'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { snapshotData } = require('../scripts/snapshot-data');
const { mergeData } = require('../scripts/merge-data');
const { importUserContent } = require('../scripts/import-user-content');
const { nextId } = require('../server/migrations');
const tables = ['users', 'rooms', 'posts', 'votes', 'comments', 'reports'];
const legacyColumns={users:'id,token_hash,name,created_at',rooms:'id,slug,name,description,emoji,created_by,created_at',posts:'id,room_id,author_id,demo_author,title,body,type,link_url,image_url,base_score,status,created_at',votes:'post_id,user_id,value',comments:'id,post_id,parent_id,author_id,demo_author,body,depth,created_at',reports:'id,post_id,user_id,reason,resolved,created_at'};
const rows = db => Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT ${legacyColumns[name]} FROM ${name} ORDER BY rowid`).all()]));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hereme-migration-'));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'uploads'), { recursive: true });
  const db = new DatabaseSync(path.join(source, 'hereme.sqlite'));
  db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-schema.sql'), 'utf8'));
  db.exec(`
    INSERT INTO users(id,token_hash,name) VALUES ('legacy-user','legacy-token','Regnvenn');
    INSERT INTO rooms(id,slug,name,description,created_by) VALUES (19,'nabolag','Nabolag','Eget rom','legacy-user');
    INSERT INTO posts(id,room_id,author_id,title,body,type,link_url,image_url,base_score,status,created_at) VALUES
      (41,19,'legacy-user','Spørsmål fra før','Tekst som skal beholdes','text',NULL,NULL,-4,'published','2026-10-01 12:30:00'),
      (42,19,NULL,'Lenke fra før','Kilde','link','https://example.org/',NULL,9,'review','2026-10-02 12:30:00'),
      (43,19,'legacy-user','Bilde fra før','Bildetekst','image',NULL,'/uploads/legacy.png',3,'hidden','2026-10-03 12:30:00'),
      (44,19,NULL,'Plakat fra før','Egen plakat','poster',NULL,'/uploads/legacy.png',8,'published','2026-10-04 12:30:00');
    UPDATE posts SET demo_author='Demovenn' WHERE author_id IS NULL;
    INSERT INTO votes(post_id,user_id,value) VALUES (41,'legacy-user',-1);
    INSERT INTO comments(id,post_id,parent_id,author_id,body,depth) VALUES
      (51,41,NULL,'legacy-user','Første kommentar',0), (52,41,51,'legacy-user','Svar',1);
    INSERT INTO reports(id,post_id,user_id,reason,resolved) VALUES (61,43,'legacy-user','Annet',0);
  `);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrWQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(source, 'uploads/legacy.png'), png);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true }); });
  return { root, source, db, png };
}

test('live WAL snapshot preserves the complete legacy database, IDs, media and restart behavior', async t => {
  const { root, source, db, png } = fixture(t);
  assert.ok(fs.statSync(path.join(source, 'hereme.sqlite-wal')).size > 0);
  const expected = rows(db);
  const destination = path.join(root, 'preview');
  const manifest = await snapshotData(source, destination);
  assert.equal(manifest.counts.posts, 4);
  const verify = () => {
    const copy = new DatabaseSync(path.join(destination, 'hereme.sqlite'), { readOnly: true });
    try { assert.deepEqual(rows(copy), expected); } finally { copy.close(); }
  };
  verify();
  for (let restart = 0; restart < 2; restart++) {
    const result = spawnSync(process.execPath, ['-e', "require('./server/db').db.close()"], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, HEREME_DATA_DIR: destination }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    verify(); // Startup must not reseed an existing user-created room or alter existing rows.
  }
  assert.deepEqual(fs.readFileSync(path.join(destination, 'uploads/legacy.png')), png);
  assert.deepEqual(rows(db), expected);
  await assert.rejects(snapshotData(source, destination), /already exists/);
  verify();
});

test('later snapshots include newly created source posts and leave independent preview data intact', async t => {
  const { root, source, db } = fixture(t);
  const first = path.join(root, 'preview');
  await snapshotData(source, first);
  const preview = new DatabaseSync(path.join(first, 'hereme.sqlite'));
  preview.prepare("INSERT INTO posts(id,room_id,title,type) VALUES (?,19,'Preview-only test','text')").run(nextId(preview,'posts'));
  preview.close();
  db.exec("INSERT INTO posts(room_id,title,type) VALUES (19,'Created after first snapshot','text')");
  const latest = path.join(root, 'preview-latest');
  await snapshotData(source, latest);
  const copy = new DatabaseSync(path.join(latest, 'hereme.sqlite'));
  assert.deepEqual(rows(copy), rows(db));
  copy.close();
  const previous = new DatabaseSync(path.join(first, 'hereme.sqlite'));
  assert.equal(previous.prepare('SELECT title FROM posts WHERE id=-1').get().title, 'Preview-only test');
  previous.close();
});

test('missing media fails visibly without publishing a usable snapshot', async t => {
  const { root, source } = fixture(t);
  fs.unlinkSync(path.join(source, 'uploads/legacy.png'));
  const destination = path.join(root, 'broken-preview');
  await assert.rejects(snapshotData(source, destination), /ENOENT/);
  assert.equal(fs.existsSync(destination), false);
});
test('selective import restores user-authored posts and relationships without importing demo-only content twice',async t=>{
  const {root,source,png}=fixture(t),target=path.join(root,'current');await snapshotData(source,target);
  const current=new DatabaseSync(path.join(target,'hereme.sqlite'));current.exec(`DELETE FROM reports WHERE post_id=43; DELETE FROM comments WHERE post_id=41; DELETE FROM votes WHERE post_id IN (41,43); DELETE FROM posts WHERE id IN (41,43);`);current.close();
  const snapshots=path.join(root,'durable-import-snapshots'),first=await importUserContent(source,target,{snapshotRoot:snapshots});assert.equal(first.source_posts,2);assert.equal(first.imported.posts,2);assert.equal(first.imported.comments,2);assert.equal(first.imported.reports,1);assert.equal(path.dirname(first.backup),snapshots);assert.ok(fs.existsSync(first.backup));
  const restored=new DatabaseSync(path.join(target,'hereme.sqlite'),{readOnly:true});
  try{assert.deepEqual(restored.prepare('SELECT id FROM posts ORDER BY id').all().map(row=>row.id),[41,42,43,44]);assert.equal(restored.prepare("SELECT count(*) n FROM posts WHERE demo_author='Demovenn'").get().n,2);assert.equal(restored.prepare('SELECT parent_id FROM comments WHERE id=52').get().parent_id,51);assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);}finally{restored.close();}
  assert.deepEqual(fs.readFileSync(path.join(target,'uploads','legacy.png')),png);
  const second=await importUserContent(source,target);assert.equal(second.imported.posts,0);assert.equal(second.imported.comments,0);
});
test('legacy duplicate pseudonyms are deterministically disambiguated without losing identities',async t=>{
  const {root,source,db}=fixture(t);db.prepare("insert into users(id,token_hash,name) values('legacy-duplicate','other-token','REGNVENN')").run();
  const destination=path.join(root,'deduplicated');await snapshotData(source,destination);const copy=new DatabaseSync(path.join(destination,'hereme.sqlite'),{readOnly:true});
  try{const users=copy.prepare("select id,name,normalized_name from users where id in ('legacy-user','legacy-duplicate') order by created_at,id").all();assert.equal(users.length,2);assert.equal(new Set(users.map(user=>user.normalized_name)).size,2);assert.ok(users.some(user=>user.name.toLocaleLowerCase('no')==='regnvenn'));assert.ok(users.some(user=>/-2$/.test(user.name)));}finally{copy.close();}
});

test('merge preserves real writes from both instances, relationships, votes, moderation, uploads and IDs', async t => {
  const { root, source, db, png } = fixture(t);
  const destination = path.join(root, 'preview');
  await snapshotData(source, destination);
  const preview = new DatabaseSync(path.join(destination, 'hereme.sqlite'));
  preview.exec(`
    PRAGMA foreign_keys=ON;
    INSERT INTO users(id,token_hash,name,normalized_name) VALUES ('preview-user','preview-token','Preview','preview');
    INSERT INTO rooms(id,slug,name,created_by) VALUES (-1,'preview-room','Preview room','preview-user');
    INSERT INTO posts(id,room_id,author_id,title,type,image_url) VALUES (-1,-1,'preview-user','Preview photo','image','/uploads/preview.png');
    INSERT INTO comments(id,post_id,parent_id,author_id,body,depth) VALUES
      (-1,-1,NULL,'preview-user','Preview comment',0), (-2,-1,-1,'preview-user','Preview reply',1);
    INSERT INTO votes(post_id,user_id,value) VALUES (41,'preview-user',1);
    INSERT INTO reports(id,post_id,user_id,reason) VALUES (-1,41,'preview-user','Annet');
    UPDATE posts SET title='Preview title' WHERE id=41;
  `);
  fs.writeFileSync(path.join(destination,'uploads/preview.png'),png);
  preview.close();
  db.exec(`
    INSERT INTO users(id,token_hash,name) VALUES ('source-user','source-token','Source');
    INSERT INTO rooms(id,slug,name,created_by) VALUES (20,'source-room','Source room','source-user');
    INSERT INTO posts(id,room_id,author_id,title,type,image_url) VALUES (45,20,'source-user','Source photo','image','/uploads/source.png');
    INSERT INTO comments(id,post_id,parent_id,author_id,body,depth) VALUES
      (53,45,NULL,'source-user','Source comment',0), (54,45,53,'source-user','Source reply',1);
    DELETE FROM votes WHERE post_id=41 AND user_id='legacy-user';
    INSERT INTO votes(post_id,user_id,value) VALUES (41,'source-user',1);
    INSERT INTO reports(id,post_id,user_id,reason) VALUES (62,41,'source-user','Annet'), (63,41,'legacy-user','Annet');
    UPDATE posts SET body='Source body' WHERE id=41;
  `);
  fs.writeFileSync(path.join(source,'uploads/source.png'),png);
  const sourceBefore = rows(db);
  const first = await mergeData(source,destination);
  assert.equal(first.counts.posts,6);
  assert.equal(first.counts.comments,6);
  assert.deepEqual(rows(db),sourceBefore);
  assert.ok(fs.existsSync(path.join(first.backupDir,'hereme.sqlite')));
  const merged = new DatabaseSync(path.join(destination,'hereme.sqlite'));
  assert.equal(merged.prepare('SELECT room_id FROM posts WHERE id=-1').get().room_id,-1);
  assert.equal(merged.prepare('SELECT room_id FROM posts WHERE id=45').get().room_id,20);
  assert.equal(merged.prepare('SELECT parent_id FROM comments WHERE id=-2').get().parent_id,-1);
  assert.equal(merged.prepare('SELECT parent_id FROM comments WHERE id=54').get().parent_id,53);
  const common = merged.prepare('SELECT title,body,status FROM posts WHERE id=41').get();
  assert.deepEqual({...common},{title:'Preview title',body:'Source body',status:'review'});
  assert.equal(merged.prepare('SELECT sum(value) AS score FROM votes WHERE post_id=41').get().score,2);
  assert.equal(merged.prepare("SELECT count(*) AS n FROM votes WHERE user_id='legacy-user'").get().n,0);
  assert.equal(nextId(merged,'posts'),-2);
  assert.deepEqual(merged.prepare('PRAGMA foreign_key_check').all(),[]);
  merged.close();
  for (const filename of ['legacy.png','preview.png','source.png']) {
    assert.deepEqual(fs.readFileSync(path.join(destination,'uploads',filename)),png);
  }
  assert.equal((await mergeData(source,destination)).changes,0);
  db.exec("INSERT INTO posts(room_id,title,type) VALUES (20,'Later source post','text')");
  assert.equal((await mergeData(source,destination)).counts.posts,7);
});

test('existing empty databases are never automatically seeded', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-empty-'));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  const db=new DatabaseSync(path.join(root,'hereme.sqlite'));
  db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));
  db.close();
  const result=spawnSync(process.execPath,['-e',"require('./server/db').db.close()"],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,HEREME_DATA_DIR:root},encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
  const copy=new DatabaseSync(path.join(root,'hereme.sqlite'));
  assert.equal(copy.prepare('SELECT count(*) AS n FROM rooms').get().n,0);
  assert.equal(copy.prepare('SELECT count(*) AS n FROM posts').get().n,0);
  copy.close();
});

test('merge maps later original posts while retaining roomless preview categories and crop metadata',async t=>{
  const {root,source,db}=fixture(t),destination=path.join(root,'wall');
  await snapshotData(source,destination);
  const preview=new DatabaseSync(path.join(destination,'hereme.sqlite'));
  preview.exec("INSERT INTO posts(id,title,type) VALUES(-1,'Directly on the wall','text')");
  require('../server/post-design').insertDesign(preview,-1,{category:'alert',image_zoom:1.5,image_x:30,image_y:70});
  preview.close();
  db.exec("INSERT INTO posts(id,room_id,title,type) VALUES(45,19,'Later original','text')");
  await mergeData(source,destination);await mergeData(source,destination);
  const merged=new DatabaseSync(path.join(destination,'hereme.sqlite'));
  try {
    assert.equal(merged.prepare('SELECT room_id FROM posts WHERE id=-1').get().room_id,null);
    assert.deepEqual({...merged.prepare('SELECT category,image_zoom,image_x,image_y FROM post_design WHERE post_id=-1').get()},
      {category:'alert',image_zoom:1.5,image_x:30,image_y:70});
    assert.equal(merged.prepare('SELECT category FROM post_design WHERE post_id=45').get().category,'story');
    assert.equal(merged.prepare('SELECT count(*) AS n FROM posts').get().n,6);
    assert.deepEqual(merged.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {merged.close();}
});

test('conflicting edits roll back the whole merge and leave both databases intact', async t => {
  const { root, source, db } = fixture(t);
  const destination = path.join(root,'preview');
  await snapshotData(source,destination);
  const preview = new DatabaseSync(path.join(destination,'hereme.sqlite'));
  preview.exec("UPDATE posts SET body='Preview edit' WHERE id=41");
  const before = rows(preview);
  preview.close();
  db.exec("UPDATE posts SET body='Original edit' WHERE id=41; INSERT INTO posts(room_id,title,type) VALUES(19,'Must not partially import','text')");
  await assert.rejects(mergeData(source,destination), /posts \[41\].body: changed differently/);
  const after = new DatabaseSync(path.join(destination,'hereme.sqlite'));
  assert.deepEqual(rows(after),before);
  after.close();
});
