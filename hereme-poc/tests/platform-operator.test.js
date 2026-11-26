'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openRegistry, login, totp} = require('../server/platform/operator');
const qr = require('../server/qr');

test('explorer requires both a current platform session and an explicit operator grant', async () => {
  const {createPanel}=require('../server/platform');
  const {hash}=require('../server/platform/operator');
  const db=openRegistry(':memory:');
  const server=createPanel({registry:db,sites:[],explorerOperators:['reader']}).listen(0,'127.0.0.1');
  try {
    await require('node:events').once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port+'/api/explorer-access';
    const access=token=>new Promise((resolve,reject)=>{
      require('node:http').get(url,{headers:{host:'admin.hereme.no',cookie:'__Host-hereme_operator='+token,
        'x-forwarded-uri':'/databases/community.json?sql=select+1'}},res=>{
        res.resume();resolve(res.statusCode);
      }).on('error',reject);
    });
    const add=db.prepare('INSERT INTO sessions VALUES(?,?,?,?)');
    add.run(hash('authorized'),'reader','csrf',Date.now()+60000);
    add.run(hash('ordinary'),'operator','csrf',Date.now()+60000);
    add.run(hash('expired'),'reader','csrf',Date.now()-1000);
    assert.equal(await access('ordinary'),403);
    assert.equal(await access('expired'),401);
    assert.equal(await access('authorized'),204);
    assert.deepEqual({...db.prepare('SELECT actor,action,site,detail FROM audit').get()},
      {actor:'reader',action:'database query',site:'community',detail:'SQL SHA-256 '+hash('select 1')});
  } finally {server.close();db.close();}
});

test('operator authenticator uses six-digit SHA-1 TOTP with big-endian time steps', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(totp(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp(secret, Math.floor(1111111109 / 30)), '081804');
});

test('operator login throttling is scoped to the gateway peer and expires', () => {
  const registry = openRegistry(':memory:');
  const fields = {name:'operator', password:'incorrect', code:'123456'};
  try {
    for(let i=0; i<12; i++) assert.equal(login(registry,'peer-a',fields,1000),null);
    assert.throws(()=>login(registry,'peer-a',fields,1000), {status:429});
    assert.equal(login(registry,'peer-b',fields,1000),null);
    assert.equal(login(registry,'peer-a',fields,301001),null);
    assert.equal(login(registry,'peer-a',null),null);
  } finally {registry.close();}
});

test('community QR codes encode the public HTTPS destination', async () => {
  const main = await qr.toString('https://hereme.no/', {type:'svg', margin:2});
  const community = await qr.toString('https://tanteulrikkesvei.hereme.no/', {type:'svg', margin:2});
  assert.match(main, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(community, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.notEqual(main, community);
  assert.equal(qr.matrix('https://hereme.no/').length, 29);
});
