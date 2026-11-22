# ADR 0012: Optional pseudonymous avatars

## Decision

An avatar belongs to the stable user ID, independent of the username. It is an optional public-facing image, visible where a username is already visible. New and existing accounts use a deterministic initial-letter square until the owner adds an image. Pending group invitees receive no participant identities or avatar URLs.

Schema 20 adds one `user_avatars` row per owner. The authenticated owner can save or remove a photo through `/api/me/avatar`; CSRF and session checks use the existing account policy. The image endpoint serves only active accounts and the current version. Chat/search/profile projections carry safe versioned URLs, not stored paths or private account records.

Upload accepts at most 5 MiB of JPEG, PNG or WebP and caps decoded pixels at 25 million. The server verifies file signatures, decodes with Sharp, rotates from orientation metadata, applies the requested square crop and writes only 64 and 256 pixel WebP variants. It never stores or serves the original. A replacement retains the previous version until the new files and row are committed. Startup cleanup removes orphaned versions; readiness verifies referenced files. User deletion removes stored variants.

Snapshots include the avatar directory with checksums, and restore reconstitutes it with the database. Chat attachment bytes retain their separate seven-day exclusion. A rollback to code predating schema 20 requires restoring the matching pre-migration database and data snapshot, rather than running old code against migrated storage. Operators should verify backup/restore on a clone before production cutover.

## Consequences

Avatars are not identity verification. Because images are public-facing, upload UI explains visibility. Versioned URLs avoid stale replacements; removal invalidates the active route. Image processing adds Sharp as a runtime dependency and makes file integrity part of readiness. A failed byte cleanup is surfaced instead of silently claiming deletion succeeded.
