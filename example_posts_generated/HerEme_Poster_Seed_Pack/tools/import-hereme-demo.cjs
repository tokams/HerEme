'use strict';

// Run in the HerEme PoC root: node tools/import-hereme-demo.cjs
// Importing is explicitly opt-in and repeatable. It does not delete/update old posts.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const payload = JSON.parse(fs.readFileSync(path.join(root, 'example_posts.json'), 'utf8'));
if (payload.dataset_id !== 'hereme-poster-demo-nov-2026' || !payload.synthetic_demo) {
  throw new Error('Unexpected or unlabeled demo dataset. Import aborted.');
}

// Existing server/db.js sets up schema and adds the PoC's original sample content
// only on a brand-new database. Never recreate or clear the user database here.
const { db } = require(path.join(root, 'server', 'db.js'));
db.exec(`CREATE TABLE IF NOT EXISTS hereme_demo_imports (
  seed_key TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL UNIQUE REFERENCES posts(id),
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const existing = db.prepare('SELECT post_id FROM hereme_demo_imports WHERE seed_key = ?');
const getRoom = db.prepare('SELECT id FROM rooms WHERE slug = ?');
const addRoom = db.prepare('INSERT INTO rooms(slug, name, description, emoji) VALUES (?, ?, ?, ?)');
const addPost = db.prepare(`INSERT INTO posts
  (room_id, demo_author, title, body, type, link_url, image_url, base_score, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const addComment = db.prepare(`INSERT INTO comments
  (post_id, parent_id, demo_author, body, depth, created_at)
  VALUES (?, ?, ?, ?, ?, ?)`);
const mark = db.prepare('INSERT INTO hereme_demo_imports (seed_key, post_id) VALUES (?, ?)');

function dbTimestamp(iso) {
  // Legacy PoC saves timestamps as SQLite datetime strings, not ISO 8601.
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}
function checkImages(post) {
  const locations = [post.image_url, post.poster?.source_image_url].filter(Boolean);
  for (const loc of locations) {
    if (!loc.startsWith('/assets/demo/') || loc.includes('..')) {
      throw new Error(`Unexpected asset path: ${loc}`);
    }
    const filepath = path.join(root, 'public', loc.slice(1));
    if (!fs.existsSync(filepath)) throw new Error(`Missing file: ${filepath}`);
  }
}

let count = 0;
let skipped = 0;
db.exec('BEGIN IMMEDIATE');
try {
  for (const p of payload.posts) {
    if (existing.get(p.seed_key)) { skipped++; continue; }
    checkImages(p);
    const rm = payload.rooms.find(r => r.slug === p.room_slug);
    if (!rm) throw new Error(`Missing room metadata: ${p.room_slug}`);
    let roomId = getRoom.get(p.room_slug)?.id;
    if (!roomId) roomId = Number(addRoom.run(rm.slug, rm.name, rm.description, rm.emoji).lastInsertRowid);
    const postId = Number(addPost.run(roomId, p.demo_author, p.title, p.body, p.type,
      p.link_url ?? null, p.image_url ?? null, p.base_score, p.status, dbTimestamp(p.created_at)).lastInsertRowid);
    const commentIds = new Map();
    for (const cm of p.comments ?? []) {
      const parentId = cm.parent_local_id ? commentIds.get(cm.parent_local_id) : null;
      if (cm.parent_local_id && parentId == null) throw new Error(`Unknown parent: ${cm.parent_local_id}`);
      const depth = parentId ? 1 : 0;
      const commentId = Number(addComment.run(postId, parentId, cm.demo_author, cm.body, depth,
        dbTimestamp(cm.created_at)).lastInsertRowid);
      commentIds.set(cm.local_id, commentId);
    }
    mark.run(p.seed_key, postId);
    count++;
  }
  db.exec('COMMIT');
  console.log(`HerEme demo import finished: ${count} new posts, ${skipped} already imported. No existing posts changed.`);
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
} finally {
  db.close();
}
