'use strict';
const tables = ['users', 'rooms', 'posts', 'votes', 'comments', 'reports'];
const keys = { users: ['id'], rooms: ['id'], posts: ['id'], votes: ['post_id', 'user_id'], comments: ['id'], reports: ['id'] };
const normalizedName=name=>String(name).normalize('NFKC').toLocaleLowerCase('no');
function makeUserNamesUnique(db,{writeNormalized=false}={}){
  const used=new Set(),update=writeNormalized?db.prepare('UPDATE users SET name=?,normalized_name=? WHERE id=?'):db.prepare('UPDATE users SET name=? WHERE id=?');
  for(const row of db.prepare('SELECT id,name FROM users ORDER BY created_at,id').all()){
    let name=row.name,key=normalizedName(name),number=2;
    while(used.has(key)){const suffix=`-${number++}`,limit=24-[...suffix].length;name=[...row.name].slice(0,Math.max(1,limit)).join('')+suffix;key=normalizedName(name);}
    used.add(key);if(writeNormalized)update.run(name,key,row.id);else if(name!==row.name)update.run(name,row.id);
  }
}
function applyMigrations(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const version = db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations').get().version;
  if (version > 14) throw new Error(`Unsupported database migration version: ${version}`);
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
  if(version<6) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deactivated'));
        ALTER TABLE users ADD COLUMN secured_at TEXT;`);
      makeUserNamesUnique(db);
      db.exec(`CREATE UNIQUE INDEX users_name_normalized ON users(lower(name));
        CREATE TABLE sessions (
          id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL,
          revoked_at TEXT, user_agent TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX sessions_user_active ON sessions(user_id,expires_at,revoked_at);
        CREATE TABLE recovery_credentials (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          secret_hash TEXT NOT NULL, salt TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')), rotated_at TEXT
        );
        CREATE TABLE user_roles (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('member','moderator','operator')),
          granted_at TEXT NOT NULL DEFAULT (datetime('now')), granted_by TEXT,
          PRIMARY KEY(user_id,role)
        );
        INSERT INTO user_roles(user_id,role) SELECT id,'member' FROM users;
        CREATE TABLE identity_verifications (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL, subject_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('verified','revoked','pending')),
          verified_at TEXT, revoked_at TEXT, UNIQUE(provider,subject_hash)
        );
        CREATE TABLE audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL,
          subject_type TEXT NOT NULL, subject_id TEXT, previous_json TEXT, next_json TEXT,
          reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX audit_subject ON audit_events(subject_type,subject_id,created_at);
        CREATE TABLE security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, result TEXT NOT NULL,
          actor_id TEXT, ip_hash TEXT, request_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO schema_migrations(version) VALUES(6); COMMIT;`);
    } catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<7) {
    const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    const sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='posts'").get()?.seq||0;
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      db.exec(`CREATE TABLE posts_release (
          id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER REFERENCES rooms(id),
          author_id TEXT REFERENCES users(id), demo_author TEXT, title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '', type TEXT NOT NULL CHECK(type IN ('text','link','image','poster','video')),
          link_url TEXT, image_url TEXT, base_score INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','processing','published','review','hidden','rejected')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO posts_release SELECT * FROM posts;
        DROP TABLE posts; ALTER TABLE posts_release RENAME TO posts;
        CREATE INDEX posts_room_created ON posts(room_id,created_at);
        CREATE INDEX posts_status_created ON posts(status,created_at DESC,id DESC);
        CREATE INDEX posts_status_score ON posts(status,base_score DESC,id DESC);
        CREATE TABLE media (
          id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('image','video')),
          status TEXT NOT NULL CHECK(status IN ('uploading','queued','processing','ready','rejected','failed')),
          original_path TEXT NOT NULL UNIQUE, display_path TEXT, thumbnail_path TEXT,
          mime_type TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), sha256 TEXT NOT NULL,
          width INTEGER, height INTEGER, duration_ms INTEGER, error_code TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE post_media (
          post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
          media_id TEXT NOT NULL REFERENCES media(id)
        );
        CREATE TABLE media_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('image','video')), status TEXT NOT NULL CHECK(status IN ('queued','processing','done','failed')),
          attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL DEFAULT (datetime('now')),
          locked_at TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(media_id,kind)
        );
        CREATE VIRTUAL TABLE post_search USING fts5(title,body,content='posts',content_rowid='id',tokenize='unicode61');
        INSERT INTO post_search(rowid,title,body) SELECT id,title,body FROM posts;
        CREATE TRIGGER post_search_insert AFTER INSERT ON posts BEGIN INSERT INTO post_search(rowid,title,body) VALUES(new.id,new.title,new.body); END;
        CREATE TRIGGER post_search_delete AFTER DELETE ON posts BEGIN INSERT INTO post_search(post_search,rowid,title,body) VALUES('delete',old.id,old.title,old.body); END;
        CREATE TRIGGER post_search_update AFTER UPDATE OF title,body ON posts BEGIN
          INSERT INTO post_search(post_search,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
          INSERT INTO post_search(rowid,title,body) VALUES(new.id,new.title,new.body);
        END;
        INSERT INTO schema_migrations(version) VALUES(7);`);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='posts'").run(sequence);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Release migration would break foreign keys.');
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
    finally{db.exec('PRAGMA foreign_keys='+foreignKeys);}
  }
  if(version<8) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE areas (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('country','fylke','kommune','custom')),
          parent_id TEXT REFERENCES areas(id), name TEXT NOT NULL, geometry_version TEXT,
          active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
        );
        CREATE TABLE area_subscriptions (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          area_id TEXT NOT NULL REFERENCES areas(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY(user_id,area_id)
        );
        CREATE TABLE post_areas (
          post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
          area_id TEXT NOT NULL REFERENCES areas(id)
        );
        INSERT INTO schema_migrations(version) VALUES(8); COMMIT;`);
    } catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<9) {
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`CREATE TABLE area_geometries (
        area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE, version TEXT NOT NULL,
        geojson TEXT NOT NULL, source_url TEXT NOT NULL, license TEXT NOT NULL, sha256 TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(area_id,version)
      );
      CREATE INDEX post_areas_area ON post_areas(area_id,post_id);
      INSERT INTO schema_migrations(version) VALUES(9); COMMIT;`);}catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<10){
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec('DROP INDEX users_name_normalized; ALTER TABLE users ADD COLUMN normalized_name TEXT;');
      makeUserNamesUnique(db,{writeNormalized:true});
      db.exec(`CREATE UNIQUE INDEX users_name_normalized ON users(normalized_name);
        CREATE TRIGGER users_normalized_insert BEFORE INSERT ON users WHEN new.normalized_name IS NULL OR new.normalized_name='' BEGIN SELECT raise(ABORT,'normalized_name required'); END;
        CREATE TRIGGER users_normalized_update BEFORE UPDATE OF name,normalized_name ON users WHEN new.normalized_name IS NULL OR new.normalized_name='' BEGIN SELECT raise(ABORT,'normalized_name required'); END;
        INSERT INTO schema_migrations(version) VALUES(10); COMMIT;`);
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<11){
    const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try{
      db.exec(`CREATE TABLE user_roles_admin (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('member','moderator','admin','operator')),
          granted_at TEXT NOT NULL DEFAULT (datetime('now')), granted_by TEXT,
          PRIMARY KEY(user_id,role)
        );
        INSERT INTO user_roles_admin SELECT * FROM user_roles;
        DROP TABLE user_roles;
        ALTER TABLE user_roles_admin RENAME TO user_roles;
        INSERT INTO schema_migrations(version) VALUES(11);`);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Admin-role migration would break foreign keys.');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    finally{db.exec('PRAGMA foreign_keys='+foreignKeys);}
  }
  if(version<12){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`CREATE TABLE chat_requests(id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, opening TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN ('pending','accepted','declined','cancelled')), created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX chat_requests_inbox ON chat_requests(recipient_id,state,created_at);
      CREATE TABLE chat_blocks(blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(blocker_id,blocked_id));
      CREATE TABLE chats(id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','group')), pair_key TEXT UNIQUE, creator_id TEXT REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK((kind='direct' AND pair_key IS NOT NULL) OR (kind='group' AND pair_key IS NULL)));
      CREATE TABLE chat_members(chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,joined_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(chat_id,user_id));
      CREATE INDEX chat_members_user ON chat_members(user_id,chat_id);
      CREATE TABLE chat_invites(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,state TEXT NOT NULL CHECK(state IN ('pending','accepted','declined','cancelled')),created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX chat_invites_inbox ON chat_invites(recipient_id,state);
      CREATE UNIQUE INDEX chat_invites_pending ON chat_invites(chat_id,recipient_id) WHERE state='pending';
      CREATE TABLE chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,kind TEXT NOT NULL DEFAULT 'text' CHECK(kind IN ('text','file','system')),body TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX chat_messages_page ON chat_messages(chat_id,id DESC);
      CREATE TABLE chat_files(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,message_id INTEGER REFERENCES chat_messages(id),name TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>=0),received INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL CHECK(status IN ('uploading','ready','expired')),created_at TEXT NOT NULL DEFAULT (datetime('now')),expires_at TEXT,stored_path TEXT NOT NULL UNIQUE);
      CREATE INDEX chat_files_expiry ON chat_files(status,expires_at);
      CREATE TABLE chat_presence(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,seen_at TEXT NOT NULL DEFAULT (datetime('now')),visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)));
      CREATE TABLE chat_worker_state(id INTEGER PRIMARY KEY CHECK(id=1),last_run TEXT NOT NULL,overdue INTEGER NOT NULL);
      INSERT INTO schema_migrations(version) VALUES(12); COMMIT;`);}catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<13){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`ALTER TABLE chats ADD COLUMN direct_state TEXT NOT NULL DEFAULT 'accepted' CHECK(direct_state IN ('pending','accepted','declined'));
      ALTER TABLE chats ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
      UPDATE chats SET updated_at=created_at;
      ALTER TABLE chat_requests ADD COLUMN chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE;
      ALTER TABLE chat_messages ADD COLUMN client_key TEXT;
      CREATE UNIQUE INDEX chat_message_client_key ON chat_messages(chat_id,sender_id,client_key) WHERE client_key IS NOT NULL;
      CREATE TABLE chat_notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('request','invite','accepted','declined','message')),dedupe_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT (datetime('now')),read_at TEXT);
      CREATE INDEX chat_notifications_inbox ON chat_notifications(recipient_id,read_at,id DESC);
      CREATE INDEX chat_requests_chat ON chat_requests(chat_id,state);
      CREATE INDEX users_name_second_character ON users(substr(normalized_name,2,1));
      INSERT INTO schema_migrations(version) VALUES(13); COMMIT;`);}catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(version<14){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`ALTER TABLE chat_files ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'file' CHECK(media_kind IN ('image','video','file'));
      ALTER TABLE chat_files ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'application/octet-stream';
      ALTER TABLE chat_files ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX chat_files_message_order ON chat_files(message_id,display_order);
      CREATE TABLE chat_staged_files(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>0),received INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL CHECK(status IN ('uploading','staged')),media_kind TEXT NOT NULL CHECK(media_kind IN ('image','video','file')),mime_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),CHECK((chat_id IS NULL)!=(target_user_id IS NULL)));
      CREATE INDEX chat_staged_sender ON chat_staged_files(sender_id,status,created_at);
      CREATE TABLE chat_events(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('conversation.updated','message.created','invitation.created','invitation.decided')),created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX chat_events_recipient ON chat_events(recipient_id,id);
      INSERT INTO schema_migrations(version) VALUES(14); COMMIT;`);}catch(error){db.exec('ROLLBACK');throw error;}
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
