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
    fs.cpSync(path.join(source, 'uploads'), path.join(staging, 'uploads'), { recursive: true, errorOnExist: true, force: false });
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
  const manifest = { version: 1, source, createdAt: new Date().toISOString(), counts };
  fs.writeFileSync(path.join(staging, 'snapshot.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(staging, destination);
  return manifest;
}

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
