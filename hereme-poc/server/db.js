'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'hereme.sqlite'));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '💬',
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    author_id TEXT REFERENCES users(id),
    demo_author TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL CHECK(type IN ('text','link','image','poster')),
    link_url TEXT,
    image_url TEXT,
    base_score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','review','hidden')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS votes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value INTEGER NOT NULL CHECK(value IN (-1,1)),
    PRIMARY KEY(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES comments(id),
    author_id TEXT REFERENCES users(id),
    demo_author TEXT,
    body TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(post_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS posts_room_created ON posts(room_id, created_at);
  CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);
  CREATE INDEX IF NOT EXISTS reports_post ON reports(post_id, resolved);
`);

if (db.prepare('SELECT count(*) AS n FROM rooms').get().n === 0) {
  const seedRoom = db.prepare('INSERT INTO rooms(slug,name,description,emoji) VALUES(?,?,?,?)');
  const rows = [
    ['stavanger','Stavanger','Alt som skjer i Stavanger – stort og smått.','🌊'],
    ['sandnes','Sandnes','Snakk om Sandnes, folk og steder.','🏘️'],
    ['rogaland','Rogaland','Fra Jæren til Ryfylke og Haugalandet.','🧭'],
    ['ryktetorget','Ryktetorget','Rykter og observasjoner – merk det som er ubekreftet.','👀'],
    ['hva-skjer','Ka skjer?','Arrangementer, tips og ting å finne på.','🎉'],
    ['sporsmal','Spørsmål & hjelp','Spør lokalt, få svar fra lokalkjente.','💡'],
    ['fotoprat','Fotoprat','Del bilder, plakater og øyeblikk.','📸']
  ];
  for (const row of rows) seedRoom.run(...row);
  const seedPost = db.prepare(`INSERT INTO posts(room_id,demo_author,title,body,type,link_url,image_url,base_score,created_at)
    VALUES(?,?,?,?,?,?,?,?,datetime('now', ?))`);
  const samplePosts = [
    [5,'vestavind','Ka skjer i Stavanger denne helga?','Del konserter, loppemarkeder og andre ting folk bør få med seg!','text',null,null,46,'-25 minutes'],
    [1,'kaffikoppen','Et stille øyeblikk i Vågen 🌊','Noen andre som liker byen best tidlig på morgenen?','image',null,'/assets/vagen.svg',37,'-2 hours'],
    [4,'nysgjerrig','Noen som vet hva som skjer ved torget?','Så mye aktivitet der i formiddag. Er det et arrangement på gang? Dette er bare et spørsmål – ikke en bekreftet nyhet.','text',null,null,12,'-3 hours'],
    [2,'sykkelbyen','Hvor er den beste kaffien i Sandnes?','Trenger tips til en rolig plass med god kaffe og plass til en laptop.','text',null,null,29,'-6 hours'],
    [7,'fotofrelst','Regn, lys og fine fargar.','Et lite motiv fra vest. Lag din egen plakat med bildeknappen!','poster',null,'/assets/vestkyst.svg',63,'-10 hours'],
    [6,'nyinflytta','Nylig flytta til området – kor begynne eg?','Hva ville du anbefalt noen som vil bli kjent med folk her?','text',null,null,21,'-1 day'],
    [3,'turkompis','Favoritturen din på Jæren?','Leter etter en kjekk tur på 1–2 timer. Del gjerne dine beste tips.','text',null,null,18,'-2 days']
  ];
  for (const p of samplePosts) seedPost.run(...p);
  const seedComment = db.prepare(`INSERT INTO comments(post_id,parent_id,demo_author,body,depth,created_at)
    VALUES(?,?,?,?,?,datetime('now', ?))`);
  seedComment.run(1,null,'bytur','Håpe noen legge ut tips!','0','-18 minutes');
  seedComment.run(1,1,'vestavind','Ja! Hele poenget med dette rommet 😄',1,'-12 minutes');
  seedComment.run(2,null,'vagenfan','Så fint lys der om morgenen.',0,'-1 hour');
  seedComment.run(4,null,'lokaal','Sjekk de små stedene rundt Langgata!',0,'-3 hours');
}
module.exports = { db, dataDir };
