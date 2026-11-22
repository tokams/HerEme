'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{applyMigrations}=require('../server/migrations');
test('schema 20 accounts, posts and comments survive the additive comment-vote migration',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hereme-comment-migration-')),db=new DatabaseSync(path.join(root,'data.sqlite'));
  t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
  db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-schema.sql'),'utf8'));applyMigrations(db);
  db.prepare("INSERT INTO users(id,token_hash,name,normalized_name) VALUES('kept','hash','Kept','kept')").run();
  db.prepare("INSERT INTO posts(id,author_id,title,type,status) VALUES(99,'kept','Existing','text','published')").run();
  db.prepare("INSERT INTO comments(id,post_id,author_id,body,depth) VALUES(88,99,'kept','Existing reply',0)").run();
  db.exec('DROP TABLE comment_votes; DROP INDEX posts_author_status; DROP INDEX comments_author_post; DELETE FROM schema_migrations WHERE version=21');
  applyMigrations(db);
  assert.equal(db.prepare('SELECT max(version) version FROM schema_migrations').get().version,21);
  assert.equal(db.prepare('SELECT body FROM comments WHERE id=88').get().body,'Existing reply');
  assert.equal(db.prepare('SELECT count(*) count FROM comment_votes').get().count,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
