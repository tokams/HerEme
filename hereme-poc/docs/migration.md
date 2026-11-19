# Isolated preview and data migration

The original checkout stays on `master` and its running server stays on port 3000.
The `feat/local-poster-wall` worktree's regular `run.cmd` starts at port 3001 and
tries the next port if occupied, up to 20 attempts. Read its printed URL.
Each instance has its own SQLite file and uploads directory. Browser profiles are
also separate because local storage is scoped to the origin, including the port.

## Copy the running forum safely

From the worktree's `hereme-poc` directory, run:

```powershell
node scripts/snapshot-data.js 'C:\Users\t\workspace\HerEme_Local_Forum_PoC\hereme-poc\data' '.\data\preview'
.\run.cmd
```

The snapshot uses SQLite's online backup API, including committed transactions in
the WAL. It copies uploads, checks database integrity and foreign keys, verifies
every referenced uploaded image, and records table counts in `snapshot.json`.
The source is opened read-only. IDs, timestamps, users, rooms, posts of every type,
votes, threaded comments, reports and moderation status are copied unchanged.
Packaged `/assets` files remain part of the checked-out source code.

An existing destination is rejected. Failures retain an `.incomplete-*` directory
for diagnosis, but never publish that directory as the requested snapshot. Do not
start a server against an incomplete snapshot. Do not copy only `hereme.sqlite`
from a running instance: committed writes may still be in its WAL file.

## Merge posts created in either instance

The preview records its imported source baseline in the database. New preview
rooms/posts/comments/reports use negative IDs; the original retains positive IDs.
This avoids collisions without renumbering existing records or reply references.
Additive preview tables retain seed import keys, synthetic labels, poster source
metadata, room memberships and atomic ID reservations across merges and backups.
Migration 4 adds post_design category/crop records and makes posts.room_id nullable
for new global-wall posts. Existing rows and their room IDs are unchanged. The
table rebuild preserves AUTOINCREMENT history and verifies foreign keys before
commit. Merging maps later source posts into categories while keeping local
choices. See [ADR 0004](adr/0004-category-poster-wall.md).

Stop **only the preview** before merging, so its pre-merge backup is an exact
rollback point. The original can keep running during development.

```powershell
node scripts/merge-data.js 'C:\Users\t\workspace\HerEme_Local_Forum_PoC\hereme-poc\data' '.\data\preview'
.\run.cmd
```

The merge retains preview-created records and imports all source additions and
nonconflicting edits since the previous merge: users, rooms, every post type,
votes, nested comments, reports, moderation and media. Unvotes propagate. Combined
reports still trigger review at three unresolved reports. No source database is
modified. The merge is idempotent and does not insert duplicate sample content.

Conflicting edits to the same field, room-slug collisions, missing media, unsafe
media paths, unsupported schemas and foreign-key violations fail visibly and roll
back all database changes. Review both copies and explicitly resolve conflicts
before retrying. Neither side is silently preferred. Files copied before a later
database constraint failure may remain unreferenced; no referenced upload is
replaced or removed.

Every merge retains `<preview>.before-merge-<uuid>` and
`<preview>.incoming-<uuid>` snapshots. The printed paths identify the rollback
copy and imported source snapshot. Backups include uploads and tracking state.
Keep them until you have verified the resulting forum. To roll back, stop the
preview and point `HEREME_DATA_DIR` at its pre-merge backup; do not overwrite live
data. Do not initialize an already-used preview with a fresh source snapshot:
use the merge command to retain its real posts.

## Final cutover

Schema 5 adds bounded `post_design.text_position` with default `auto`. Existing
content, categories and crops are retained. The same migration runs on startup
and before merging. Keep the pre-v3 snapshot (`data/preview.before-wall-v3`) and
the merge's own backups; upgrading the UI does not require reimporting examples.

This is a repeatable merge, not continuous two-way synchronization. Preview posts
appear in the new instance only. Before making it authoritative, stop writes to
the original, stop the preview, run one final merge, and verify counts, media and
representative threads. Start the new app against that merged database. Preserve
the original and all pre-merge backups. Writes to the old app after this point
require another merge and are not included automatically.

## Storage and tests

`HEREME_DATA_DIR` selects the SQLite/uploads directory. If omitted, a main checkout
uses `data/` and starts at port 3000; a Git worktree uses `data/preview/` and starts
at port 3001. Both `run.cmd` and `npm start` dispatch the same runtime policy.
`run-preview.cmd` explicitly enables that same preview mode. The runtime binds the
first available port, prints the actual database path and URL, and builds the QR
from the bound port. Preview requires an existing snapshot, avoiding an accidental
fresh demo database. `npm test` creates temporary databases; it does
not write to either running instance. The migration tests use a frozen legacy
schema and cover WAL writes, every table, uploaded media, restarts, writes from
both instances, repeat merges, conflict rollback and missing media. See
[ADR 0001](adr/0001-isolated-preview.md) for the two-origin identity contract.
