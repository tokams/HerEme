'use strict';
// Run candidate startup and schema migration on a private copy first.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {verifyBackup,verifyChecksums,verifyDatabase} = require('./verify-backup');
const {unclaimedArticleUploads} = require('../server/domain/articles');

const snapshot = process.argv[2];
const clone = fs.mkdtempSync(path.join(os.tmpdir(),'hereme-release-'));
try {
  fs.cpSync(snapshot,clone,{recursive:true});
  verifyBackup(clone);
  const manifest = JSON.parse(fs.readFileSync(path.join(clone,'snapshot.json'),'utf8'));
  const dbFile = path.join(clone,'hereme.sqlite');
  const before = new DatabaseSync(dbFile,{readOnly:true});
  let unclaimed;
  try {
    unclaimed = unclaimedArticleUploads(before,{expiredOnly:false});
  } finally {before.close();}
  process.env.HEREME_DATA_DIR = clone;
  process.env.HEREME_DATABASE_START = 'existing';
  require('../server/services').db.close();
  const db = new DatabaseSync(dbFile,{readOnly:true});
  try {
    verifyDatabase(db);
    // Verify surviving bytes against the original manifest. Only files of a previously
    // unclaimed upload whose retention expired and whose record was removed can be absent.
    const expected = {...manifest.checksums};
    const now = db.prepare("SELECT unixepoch('now') AS seconds").get().seconds;
    const recorded = db.prepare('SELECT 1 FROM media WHERE id=?');
    const referenced = db.prepare('SELECT 1 FROM media WHERE ? IN (original_path,display_path,thumbnail_path) LIMIT 1');
    for (const upload of unclaimed) {
      if (upload.expires_at===null || upload.expires_at>=now || recorded.get(upload.media_id)) continue;
      for (const relative of [upload.original_path,upload.display_path,upload.thumbnail_path]) {
        if (relative && path.posix.dirname(relative)==='media/'+upload.media_id &&
            !fs.existsSync(path.join(clone,relative)) && !referenced.get(relative)) delete expected[relative];
      }
    }
    verifyChecksums(clone,expected);
    if(db.prepare('SELECT max(version) AS v FROM schema_migrations').get().v!==25)
      throw Error('Candidate needs a separately reviewed database migration.');
    for(const table of ['users','rooms','posts','votes','comments','reports']) {
      const {count} = db.prepare('SELECT count(*) AS count FROM '+table).get();
      if(count!==manifest.counts[table]) throw Error('Candidate changed the '+table+' count on the snapshot.');
    }
  } finally {db.close();}
} finally {fs.rmSync(clone,{recursive:true,force:true});}
