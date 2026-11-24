'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {DatabaseSync}=require('node:sqlite');
function verifyChecksums(root, checksums) {
  for (const [relative,expected] of Object.entries(checksums)) {
    const file=path.resolve(root,relative);
    if (!file.startsWith(root+path.sep)) throw new Error(`Unsafe manifest path: ${relative}`);
    const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (actual!==expected) throw new Error(`Checksum mismatch: ${relative}`);
  }
}
function verifyDatabase(db) {
  if (db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('SQLite integrity check failed.');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign-key check failed.');
}
function verifyBackup(directory) {
  const root=fs.realpathSync(directory);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'snapshot.json'),'utf8'));
  if (manifest.version!==2) throw new Error('Unsupported backup manifest.');
  verifyChecksums(root,manifest.checksums);
  const db=new DatabaseSync(path.join(root,'hereme.sqlite'),{readOnly:true});
  try {
    verifyDatabase(db);
    const counts=Object.fromEntries(['users','posts','votes','comments','reports'].map(table=>
      [table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
    return {ok:true,createdAt:manifest.createdAt,files:Object.keys(manifest.checksums).length,counts};
  } finally {db.close();}
}
if(require.main===module){try{console.log(JSON.stringify(verifyBackup(process.argv[2]),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={verifyBackup,verifyChecksums,verifyDatabase};
