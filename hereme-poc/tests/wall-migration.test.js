'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {applyMigrations,readRows}=require('../server/migrations');
const {backfillDesigns,parseDesign,insertDesign}=require('../server/post-design');

test('wall migration preserves all legacy rows and high-water IDs while allowing roomless posts',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));
    db.exec(`INSERT INTO rooms(id,slug,name) VALUES(1,'sporsmal','Hjelp'),(2,'ryktetorget','Prat');
      INSERT INTO posts(id,room_id,title,type) VALUES(7,1,'Gammelt spørsmål','text'),(8,2,'Gammel mening','text');
      INSERT INTO posts(id,room_id,title,type) VALUES(100,1,'Deleted high water','text');
      DELETE FROM posts WHERE id=100;
      INSERT INTO comments(id,post_id,body) VALUES(11,7,'En kommentar');`);
    const before=readRows(db);
    applyMigrations(db);applyMigrations(db);
    assert.deepEqual(readRows(db),before);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.deepEqual(db.prepare('SELECT category FROM post_design ORDER BY post_id').all().map(p=>p.category),['question','opinion']);
    const post=db.prepare("INSERT INTO posts(title,type) VALUES('Uten rom','text')").run();
    assert.equal(Number(post.lastInsertRowid),101);
    insertDesign(db,101,parseDesign({category:'alert',image_zoom:'1.4',image_x:'30'}));
    // Later original posts receive category mappings without changing existing selections.
    db.exec("INSERT INTO posts(room_id,title,type) VALUES(1,'Senere kildeinnlegg','text')");
    backfillDesigns(db);
    assert.equal(db.prepare('SELECT category FROM post_design WHERE post_id=101').get().category,'alert');
    assert.equal(db.prepare('SELECT category FROM post_design WHERE post_id=102').get().category,'question');
    assert.equal(db.prepare('SELECT room_id FROM posts WHERE id=101').get().room_id,null);
  } finally {db.close();}
});

test('canonical design rejects unknown or mismatched themes and invalid crop values',()=>{
  for(const input of [{category:'custom'},{category:'tip',poster_style:'question'},{image_zoom:4},{image_x:-1},{image_y:101},{image_zoom:'oops'},{image_zoom:''}])
    assert.throws(()=>parseDesign(input));
  assert.deepEqual(parseDesign({category:'tip'}),{category:'tip',text_position:'auto',image_zoom:1,image_x:50,image_y:50});
  assert.throws(()=>parseDesign({text_position:'freeform'}),/tekstplassering/);
});
