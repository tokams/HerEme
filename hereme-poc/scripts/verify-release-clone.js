'use strict';
// The cutover contract is code-only on schema 23. Run candidate startup on a private copy first.
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {verifyBackup} = require('./verify-backup');

const snapshot = process.argv[2];
const clone = fs.mkdtempSync('/tmp/hereme-release-');
try {
  fs.cpSync(snapshot,clone,{recursive:true});
  const manifest = JSON.parse(fs.readFileSync(path.join(clone,'snapshot.json'),'utf8'));
  process.env.HEREME_DATA_DIR = clone;
  process.env.HEREME_DATABASE_START = 'existing';
  require('../server/services').db.close();
  verifyBackup(clone);
  const db = new DatabaseSync(path.join(clone,'hereme.sqlite'),{readOnly:true});
  try {
    if(db.prepare('SELECT max(version) AS v FROM schema_migrations').get().v!==23)
      throw Error('Candidate needs a separately reviewed database migration.');
    for(const table of ['users','rooms','posts','votes','comments','reports']) {
      const {count} = db.prepare('SELECT count(*) AS count FROM '+table).get();
      if(count!==manifest.counts[table]) throw Error('Candidate changed the '+table+' count on the snapshot.');
    }
  } finally {db.close();}
} finally {fs.rmSync(clone,{recursive:true,force:true});}
