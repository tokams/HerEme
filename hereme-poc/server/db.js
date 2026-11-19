'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('./migrations');
const { runtimeConfig } = require('./config');

const { dataDir } = runtimeConfig();
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
const databasePath = path.join(dataDir, 'hereme.sqlite');
const freshDatabase = !fs.existsSync(databasePath);
const db = new DatabaseSync(databasePath);
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

applyMigrations(db);
if (freshDatabase) require('./seed').seedDemo(db);
module.exports = { db, dataDir };
