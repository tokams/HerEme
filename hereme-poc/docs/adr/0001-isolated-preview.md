# ADR 0001: Separate instances and merge real writes into the new app

Status: accepted, 2026-11-18. The user requires real posts from both instances to
survive while the original app remains running unchanged.

Keep Node.js 24 and built-in SQLite. The feature worktree runs on port 3001 with
its own SQLite/uploads storage. Initialize it with an online snapshot including
committed WAL writes, and verify uploaded media before publishing the snapshot.
Never overwrite an existing destination or automatically seed an existing DB.

Additive migration 1 creates `schema_migrations` and `migration_source`. The latter
stores the original directory and last imported row baseline. Existing content
tables, IDs, timestamps and media URLs stay unchanged. A tracked preview uses
negative integer IDs for new rooms/posts/comments/reports; the original keeps
positive IDs. Users have UUIDs and votes use post/user keys. All write endpoints
use one identity allocator driven by durable DB state. No rows are renumbered at
merge or cutover. Chronological views use timestamps rather than numeric IDs.

Merge original into preview using the baseline, a new source snapshot and current
preview rows. Preserve preview additions, combine independent field edits, and
fail before commit on contradictory edits. Unvotes propagate; other deletions
fail visibly. Upload names are immutable: byte collisions fail. Check foreign
keys and uniqueness transactionally. Combined unresolved reports obey the
existing threshold of three. Retain incoming snapshots and pre-merge backups.

This contract supports exactly two writing origins. Additional writing clones
need another identity design. Original does not receive preview writes; the
merged preview becomes authoritative at cutover and keeps both ID ranges. Stop
original writes and merge once more before cutover. A snapshot is not proof of
current synchronization; this is an operator action, not continuous replication.

Tests own temporary storage and cover the legacy schema, WAL, both writing
origins, all relationships, repeat merges, conflicts, uploads and API identities.
