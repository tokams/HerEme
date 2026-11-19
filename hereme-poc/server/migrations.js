'use strict';
const tables = ['users', 'rooms', 'posts', 'votes', 'comments', 'reports'];
const keys = { users: ['id'], rooms: ['id'], posts: ['id'], votes: ['post_id', 'user_id'], comments: ['id'], reports: ['id'] };
function applyMigrations(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const version = db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations').get().version;
  if (version > 5) throw new Error(`Unsupported database migration version: ${version}`);
  if (version === 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE migration_source (
        id INTEGER PRIMARY KEY CHECK(id=1), directory TEXT NOT NULL, baseline TEXT NOT NULL
      ); INSERT INTO schema_migrations(version) VALUES (1); COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS hereme_demo_imports (
        seed_key TEXT PRIMARY KEY, post_id INTEGER NOT NULL UNIQUE REFERENCES posts(id),
        imported_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE post_presentation (
        post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        synthetic_demo INTEGER NOT NULL DEFAULT 0 CHECK(synthetic_demo IN (0,1)),
        poster_json TEXT
      );
      CREATE TABLE room_memberships (
        room_id INTEGER NOT NULL REFERENCES rooms(id), user_id TEXT NOT NULL REFERENCES users(id),
        PRIMARY KEY(room_id,user_id)
      );
      INSERT INTO schema_migrations(version) VALUES(2); COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if(version<3){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`CREATE TABLE local_sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(value<0));
      INSERT INTO schema_migrations(version) VALUES(3); COMMIT;`);}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<4) {
    // Rebuild only to make room_id optional; keep every legacy value and relationship.
    // Foreign keys must be disabled outside the transaction for SQLite's table rebuild.
    const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    const sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='posts'").get()?.seq||0;
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      db.exec(`CREATE TABLE posts_wall (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER REFERENCES rooms(id),
        author_id TEXT REFERENCES users(id), demo_author TEXT,
        title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL CHECK(type IN ('text','link','image','poster')),
        link_url TEXT, image_url TEXT, base_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','review','hidden')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO posts_wall SELECT * FROM posts;
      DROP TABLE posts;
      ALTER TABLE posts_wall RENAME TO posts;
      CREATE INDEX posts_room_created ON posts(room_id,created_at);
      CREATE TABLE post_design (
        post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN ('question','opinion','story','alert','tip')),
        image_zoom REAL NOT NULL DEFAULT 1 CHECK(image_zoom BETWEEN 1 AND 3),
        image_x REAL NOT NULL DEFAULT 50 CHECK(image_x BETWEEN 0 AND 100),
        image_y REAL NOT NULL DEFAULT 50 CHECK(image_y BETWEEN 0 AND 100)
      );
      CREATE INDEX post_design_category ON post_design(category);
      INSERT INTO schema_migrations(version) VALUES(4);`);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='posts'").run(sequence);
      if(db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Wall migration would break foreign keys.');
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    finally { db.exec('PRAGMA foreign_keys='+foreignKeys); }
  }
  if(version<5) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec("ALTER TABLE post_design ADD COLUMN text_position TEXT NOT NULL DEFAULT 'auto' CHECK(text_position IN ('auto','top','center','bottom'))");
      require('./post-design').backfillDesigns(db);
      db.exec('INSERT INTO schema_migrations(version) VALUES(5); COMMIT;');
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
}
function readRows(db) {
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
function nextId(db, table) {
  if (!['rooms', 'posts', 'comments', 'reports'].includes(table)) throw new Error(`Unknown identity table: ${table}`);
  // A migrated preview owns negative IDs; the unchanged original keeps positive IDs.
  // SQLite accepts both. Existing IDs and every foreign key remain unchanged.
  if (!db.prepare('SELECT id FROM migration_source WHERE id=1').get()) return null;
  const id = db.prepare(`INSERT INTO local_sequences(name,value)
    VALUES (?,(SELECT MIN(COALESCE(MIN(id),0),0)-1 FROM ${table}))
    ON CONFLICT(name) DO UPDATE SET value=value-1 RETURNING value AS id`).get(table).id;
  if (!Number.isSafeInteger(id)) throw new Error(`Identity range exhausted for ${table}`);
  return id;
}
module.exports = { applyMigrations, readRows, nextId, tables, keys };
