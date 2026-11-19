'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {applyMigrations,readRows,nextId}=require('../server/migrations');
const {seedDemo}=require('../server/seed');

test('supplied seed pack preserves legacy records and is idempotent across restarts',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-seed-'));
  t.after(()=>fs.rmSync(root,{recursive:true}));
  const filename=path.join(root,'hereme.sqlite');
  let db=new DatabaseSync(filename);
  db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));
  db.exec("INSERT INTO rooms(id,slug,name) VALUES(99,'original','Original room'); INSERT INTO posts(id,room_id,title,type,base_score) VALUES(77,99,'An existing post','text',-4)");
  const before=readRows(db);
  applyMigrations(db);
  db.prepare('INSERT INTO migration_source(id,directory,baseline) VALUES(1,?,?)').run(root,JSON.stringify(before));
  assert.deepEqual(seedDemo(db),{added:13,skipped:0});
  assert.deepEqual(db.prepare('SELECT * FROM posts WHERE id=77').get(),before.posts[0]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM posts WHERE id<0').get().n,13);
  assert.equal(db.prepare('SELECT count(*) AS n FROM post_presentation WHERE synthetic_demo=1').get().n,13);
  assert.equal(db.prepare('SELECT count(*) AS n FROM post_presentation WHERE poster_json IS NOT NULL').get().n,6);
  const seeded=readRows(db);
  assert.deepEqual(db.prepare('SELECT DISTINCT category FROM post_design ORDER BY category').all().map(p=>p.category),
    ['alert','opinion','question','story','tip']);
  const designs=db.prepare('SELECT * FROM post_design ORDER BY post_id').all();
  db.close();db=new DatabaseSync(filename);applyMigrations(db);
  assert.deepEqual(seedDemo(db),{added:0,skipped:13});
  assert.deepEqual(readRows(db),seeded);
  assert.deepEqual(db.prepare('SELECT * FROM post_design ORDER BY post_id').all(),designs);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const id=nextId(db,'posts');db.close();
  const first=new DatabaseSync(filename),second=new DatabaseSync(filename);
  assert.equal(nextId(first,'posts'),id-1);
  assert.equal(nextId(second,'posts'),id-2);
  first.close();second.close();
});

test('missing seed images fail before any content is inserted',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-seed-missing-'));
  const db=new DatabaseSync(path.join(root,'hereme.sqlite'));
  t.after(()=>{db.close();fs.rmSync(root,{recursive:true});});
  db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));applyMigrations(db);
  assert.throws(()=>seedDemo(db,undefined,root),/ENOENT/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM posts').get().n,0);
});
