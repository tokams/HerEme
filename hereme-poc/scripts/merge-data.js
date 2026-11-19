'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { snapshotData } = require('./snapshot-data');
const { readRows, tables, keys, applyMigrations } = require('../server/migrations');
const { backfillDesigns } = require('../server/post-design');
const { backfillLegacyMedia } = require('../server/domain/media');
const key = (table, row) => JSON.stringify(keys[table].map(column => row[column]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergePlan(baseline, incoming, current) {
  const actions = [], conflicts = [];
  for (const table of tables) {
    const base = new Map(baseline[table].map(row => [key(table, row), row]));
    const source = new Map(incoming[table].map(row => [key(table, row), row]));
    const target = new Map(current[table].map(row => [key(table, row), row]));
    for (const rowKey of new Set([...base.keys(), ...source.keys()])) {
      const before = base.get(rowKey), after = source.get(rowKey), local = target.get(rowKey);
      if (equal(before, after) || equal(after, local)) continue;
      if (!after) {
        if (table !== 'votes' || !equal(before, local)) conflicts.push(`${table} ${rowKey}: conflicting deletion`);
        else actions.push({ table, remove: before });
      } else if (!before) {
        if (local) conflicts.push(`${table} ${rowKey}: identity collision`);
        else actions.push({ table, insert: after });
      } else if (!local) {
        conflicts.push(`${table} ${rowKey}: target row is missing`);
      } else {
        const merged = { ...local };
        for (const column of Object.keys(after)) {
          if (equal(after[column], before[column])) continue;
          if (!equal(local[column], before[column]) && !equal(local[column], after[column])) {
            conflicts.push(`${table} ${rowKey}.${column}: changed differently in both instances`);
          } else merged[column] = after[column];
        }
        actions.push({ table, update: merged });
      }
    }
  }
  if (conflicts.length) throw new Error(`Merge conflicts; no database changes applied:\n${conflicts.join('\n')}`);
  return actions;
}
function copyTreeImmutable(source, destination, relative = '') {
  const from=path.join(source,relative);if(!fs.existsSync(from))return;
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    const child=path.join(relative,entry.name),sourceFile=path.join(source,child),targetFile=path.join(destination,child);
    if(entry.isDirectory()){fs.mkdirSync(targetFile,{recursive:true});copyTreeImmutable(source,destination,child);continue;}
    if(!entry.isFile())throw new Error(`Unexpected media entry: ${child}`);
    const bytes=fs.readFileSync(sourceFile);if(fs.existsSync(targetFile)){if(!bytes.equals(fs.readFileSync(targetFile)))throw new Error(`Media collision: ${child}`);}else fs.writeFileSync(targetFile,bytes,{flag:'wx'});
  }
}

async function mergeData(sourceDir, targetDir) {
  const source = fs.realpathSync(sourceDir), target = fs.realpathSync(targetDir);
  if (source === target) throw new Error('Source and target must be separate data directories.');
  const targetDb = new DatabaseSync(path.join(target, 'hereme.sqlite'));
  targetDb.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  try {
    const tracking = targetDb.prepare('SELECT directory,baseline FROM migration_source WHERE id=1').get();
    if (!tracking || fs.realpathSync(tracking.directory) !== source) throw new Error('Target does not track this source directory.');
    const suffix = crypto.randomUUID();
    const incomingDir = target + '.incoming-' + suffix;
    const backupDir = target + '.before-merge-' + suffix;
    await snapshotData(source, incomingDir);
    await snapshotData(target, backupDir);
    applyMigrations(targetDb);
    const incomingDb = new DatabaseSync(path.join(incomingDir, 'hereme.sqlite'), { readOnly: true });
    let incoming,incomingRelease;
    try {
      incoming = readRows(incomingDb);
      incomingRelease={
        designs:incomingDb.prepare('SELECT * FROM post_design').all(),
        presentations:incomingDb.prepare('SELECT * FROM post_presentation').all(),
        links:incomingDb.prepare('SELECT * FROM post_media').all(),
        media:incomingDb.prepare('SELECT * FROM media').all()
      };
    } finally { incomingDb.close(); }
    targetDb.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;');
    try {
      // Read the baseline again under the write lock to serialize concurrent merge attempts.
      const baseline = JSON.parse(targetDb.prepare('SELECT baseline FROM migration_source WHERE id=1').get().baseline);
      const actions = mergePlan(baseline, incoming, readRows(targetDb));
      for (const table of tables) {
        const expected = targetDb.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
        for (const row of incoming[table]) {
          if (!equal(Object.keys(row), expected)) throw new Error(`Unsupported source schema for ${table}`);
        }
      }
      // Immutable uploaded filenames and derived media must never be silently replaced.
      copyTreeImmutable(path.join(incomingDir,'uploads'),path.join(target,'uploads'));
      copyTreeImmutable(path.join(incomingDir,'media'),path.join(target,'media'));
      for (const action of actions) {
        const { table } = action;
        const where = keys[table].map(column => `${column}=?`).join(' AND ');
        if (action.remove) targetDb.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...keys[table].map(column => action.remove[column]));
        else if (action.insert) {
          const columns = Object.keys(action.insert);
          targetDb.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
            .run(...columns.map(column => action.insert[column]));
        } else {
          const columns = Object.keys(action.update).filter(column => !keys[table].includes(column));
          targetDb.prepare(`UPDATE ${table} SET ${columns.map(column => `${column}=?`).join(',')} WHERE ${where}`)
            .run(...columns.map(column => action.update[column]), ...keys[table].map(column => action.update[column]));
        }
      }
      const insertedPosts=new Set(actions.filter(action=>action.table==='posts'&&action.insert).map(action=>action.insert.id));
      const releaseLinks=incomingRelease.links.filter(row=>insertedPosts.has(row.post_id)),releaseMediaIds=new Set(releaseLinks.map(row=>row.media_id));
      for(const row of incomingRelease.media.filter(row=>releaseMediaIds.has(row.id))){const columns=Object.keys(row);targetDb.prepare(`INSERT INTO media(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(column=>row[column]));}
      for(const [table,rows] of [['post_presentation',incomingRelease.presentations.filter(row=>insertedPosts.has(row.post_id))],['post_design',incomingRelease.designs.filter(row=>insertedPosts.has(row.post_id))],['post_media',releaseLinks]])for(const row of rows){const columns=Object.keys(row);targetDb.prepare(`INSERT OR IGNORE INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(column=>row[column]));}
      backfillDesigns(targetDb);
      backfillLegacyMedia(targetDb,target);
      // Reports from two instances may jointly reach the existing moderation threshold.
      targetDb.exec(`UPDATE posts SET status='review' WHERE status='published' AND
        (SELECT count(*) FROM reports WHERE post_id=posts.id AND resolved=0)>=3`);
      if (targetDb.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Merge would break foreign keys.');
      targetDb.prepare('UPDATE migration_source SET baseline=? WHERE id=1').run(JSON.stringify(incoming));
      const counts = Object.fromEntries(tables.map(table => [table, targetDb.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
      targetDb.exec('COMMIT');
      return { changes: actions.length, backupDir, incomingDir, counts };
    } catch (error) {
      targetDb.exec('ROLLBACK');
      error.message += `\nOriginal snapshot: ${incomingDir}\nPreview backup: ${backupDir}`;
      throw error;
    }
  } finally { targetDb.close(); }
}

if (require.main === module) {
  const [source, target, ...extra] = process.argv.slice(2);
  if (!source || !target || extra.length) {
    console.error('Usage: node scripts/merge-data.js <original-data-dir> <preview-data-dir>');
    process.exitCode = 1;
  } else mergeData(source, target).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = { mergeData, mergePlan };
