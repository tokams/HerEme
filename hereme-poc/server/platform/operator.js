'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function base32(bytes) {
  const bits = [...bytes].map(byte => byte.toString(2).padStart(8,'0')).join('');
  return bits.match(/.{1,5}/g).map(chunk => alphabet[parseInt(chunk.padEnd(5,'0'),2)]).join('');
}
function totp(key, counter) {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1',key).update(input).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6,'0');
}
function openRegistry(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS operators(name TEXT PRIMARY KEY, password BLOB NOT NULL,salt BLOB NOT NULL,otp BLOB NOT NULL,last_counter INTEGER NOT NULL DEFAULT -1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,operator TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,time TEXT DEFAULT CURRENT_TIMESTAMP,actor TEXT NOT NULL,action TEXT NOT NULL,site TEXT,detail TEXT);
    CREATE TABLE IF NOT EXISTS attempts(peer TEXT PRIMARY KEY, starts INTEGER NOT NULL, count INTEGER NOT NULL);`);
  return db;
}
function provision(db, file) {
  if (db.prepare('SELECT 1 FROM operators').get()) throw Error('Platform operator already exists.');
  const name='operator',password=crypto.randomBytes(30).toString('base64url'),otp=crypto.randomBytes(20),salt=crypto.randomBytes(16);
  const secret=base32(otp);
  // Save credentials before activating the operator. Exclusive creation prevents accidental rotation.
  fs.writeFileSync(file,`Portal: https://admin.hereme.no/\nUsername: ${name}\nPassword: ${password}\nAuthenticator setup key: ${secret}\nTime based, 6 digits, SHA1, 30 seconds.\n`,{flag:'wx',mode:0o600});
  db.prepare('INSERT INTO operators(name,password,salt,otp) VALUES(?,?,?,?)').run(name,crypto.scryptSync(password,salt,32),salt,otp);
}
function login(db,peer,fields,now=Date.now()) {
  const {name,password,code}=fields || {};
  if (typeof name!=='string'||typeof password!=='string'||password.length>256||typeof code!=='string'||!/^\d{6}$/.test(code)) return null;
  db.prepare('DELETE FROM attempts WHERE starts<?').run(now-300000);
  const rate=db.prepare('INSERT INTO attempts VALUES(?,?,1) ON CONFLICT(peer) DO UPDATE SET count=count+1 RETURNING count').get(peer,now);
  if(rate.count>12) throw Object.assign(Error('Too many attempts. Try again in five minutes.'),{status:429});
  const user=db.prepare('SELECT * FROM operators WHERE name=?').get(name);
  if (!user || !crypto.timingSafeEqual(crypto.scryptSync(password,user.salt,32),user.password)) return null;
  const step=Math.floor(now/30000);
  const counter=[step,step-1,step+1].find(i=>i>user.last_counter && totp(user.otp,i)===code);
  if(counter===undefined) return null;
  const token=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url');
  db.exec('BEGIN IMMEDIATE');
  try {
    if(!db.prepare('UPDATE operators SET last_counter=? WHERE name=? AND last_counter<?').run(counter,name,counter).changes) {db.exec('ROLLBACK');return null;}
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),name,csrf,now+8*3600000);
    db.prepare("INSERT INTO audit(actor,action) VALUES(?,'login')").run(name);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  return {token,csrf};
}
module.exports={openRegistry,provision,login,hash,totp};
if(require.main===module) {
  const [dbFile,output]=process.argv.slice(2);
  const db=openRegistry(dbFile);
  try {provision(db,output);} finally {db.close();}
}
