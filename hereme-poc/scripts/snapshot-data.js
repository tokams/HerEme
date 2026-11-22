'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { applyMigrations, readRows } = require('../server/migrations');

// The online backup API includes committed WAL transactions. A raw .sqlite copy does not.
async function snapshotData(sourceDir, destinationDir) {
  const source = fs.realpathSync(sourceDir);
  const destination = path.resolve(destinationDir);
  if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${destination}`);
  if (destination === source || destination.startsWith(source + path.sep)) {
    throw new Error('Snapshot destination must be outside the source data directory.');
  }
  const sourceDb = new DatabaseSync(path.join(source, 'hereme.sqlite'), { readOnly: true });
  const staging = destination + '.incomplete-' + crypto.randomUUID();
  fs.mkdirSync(staging, { recursive: true });
  try {
    await backup(sourceDb, path.join(staging, 'hereme.sqlite'));
  } finally {
    sourceDb.close();
  }
  const snapshot = new DatabaseSync(path.join(staging, 'hereme.sqlite'));
  let counts;
  try {
    const integrity = snapshot.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('Snapshot failed SQLite integrity check.');
    }
    if (snapshot.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('Snapshot contains broken foreign keys.');
    }
    for(const directory of ['uploads','media','avatars']){
      const from=path.join(source,directory),to=path.join(staging,directory);
      if(fs.existsSync(from))fs.cpSync(from,to,{recursive:true,errorOnExist:true,force:false});else fs.mkdirSync(to,{recursive:true});
    }
    for (const { id, image_url } of snapshot.prepare('SELECT id,image_url FROM posts WHERE image_url IS NOT NULL').all()) {
      if (!image_url.startsWith('/uploads/')) continue; // Packaged /assets are versioned with the app.
      const filename = image_url.slice('/uploads/'.length);
      if (!filename || filename.includes('/') || filename.includes('\\') || filename === '..') {
        throw new Error(`Unsafe media path on post ${id}: ${image_url}`);
      }
      const original = fs.readFileSync(path.join(source, 'uploads', filename));
      const copied = fs.readFileSync(path.join(staging, 'uploads', filename));
      if (!original.equals(copied)) throw new Error(`Media changed during snapshot: ${image_url}`);
    }
    if(snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media'").get()){
      for(const row of snapshot.prepare('SELECT id,original_path,display_path,thumbnail_path,sha256 FROM media').all()){
        for(const relative of new Set([row.original_path,row.display_path,row.thumbnail_path].filter(Boolean))){
          const file=path.resolve(staging,relative);if(file!==staging&&!file.startsWith(staging+path.sep))throw new Error(`Unsafe media record ${row.id}: ${relative}`);
          if(!fs.existsSync(file))throw new Error(`Missing media record ${row.id}: ${relative}`);
        }
        const original=fs.readFileSync(path.resolve(staging,row.original_path));
        if(crypto.createHash('sha256').update(original).digest('hex')!==row.sha256)throw new Error(`Media checksum mismatch: ${row.id}`);
      }
    }
    if(snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_avatars'").get()){
      for(const row of snapshot.prepare('SELECT user_id,small_path,large_path FROM user_avatars').all())for(const relative of [row.small_path,row.large_path]){
        const file=path.resolve(staging,relative);if(!file.startsWith(staging+path.sep))throw new Error(`Unsafe avatar record ${row.user_id}: ${relative}`);
        if(!fs.existsSync(file))throw new Error(`Missing avatar record ${row.user_id}: ${relative}`);
      }
    }
    counts = Object.fromEntries(['users', 'rooms', 'posts', 'votes', 'comments', 'reports'].map(table =>
      [table, snapshot.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
    applyMigrations(snapshot);
    if (!snapshot.prepare('SELECT id FROM migration_source WHERE id=1').get()) {
      snapshot.prepare('INSERT INTO migration_source(id,directory,baseline) VALUES(1,?,?)')
        .run(source, JSON.stringify(readRows(snapshot)));
    }
  } finally {
    snapshot.close();
  }
  const checksums={};for(const directory of ['uploads','media','avatars'])for(const file of walk(path.join(staging,directory)))checksums[path.relative(staging,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const manifest = { version: 2, source, createdAt: new Date().toISOString(), counts, checksums };
  fs.writeFileSync(path.join(staging, 'snapshot.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(staging, destination);
  return manifest;
}
function walk(directory){if(!fs.existsSync(directory))return [];const result=[];for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const item=path.join(directory,entry.name);if(entry.isDirectory())result.push(...walk(item));else if(entry.isFile())result.push(item);else throw new Error(`Unexpected media entry: ${item}`);}return result;}

if (require.main === module) {
  const [source, destination, ...extra] = process.argv.slice(2);
  if (!source || !destination || extra.length) {
    console.error('Usage: node scripts/snapshot-data.js <source-data-dir> <new-destination-dir>');
    process.exitCode = 1;
  } else {
    snapshotData(source, destination).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
module.exports = { snapshotData };
