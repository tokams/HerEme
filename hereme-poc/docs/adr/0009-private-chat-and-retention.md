# ADR 0009: Private chat and seven-day attachment retention

## Decision

SQLite is the canonical store for direct-message requests, accepted membership,
group invitations, messages, attachment metadata and presence heartbeats. The
browser calls the same authenticated domain actions as the HTTP API. A direct
conversation is created only on recipient acceptance. Group creators may invite
people, and invitees gain access only after accepting. Current group members
may invite additional people. Blocking stops direct messaging and further
requests; it does not erase history.

Presence is opt-in, shown only to accepted conversation members, and expires
after 90 seconds without a heartbeat. The browser refreshes every 30 seconds;
this bounded polling is the initial live-update transport. No last-seen time is
shown. Message text remains durable; moderators have no private-chat read API.

Files use opaque names under the private data directory. The browser sends
4 MiB chunks and can resume from the server's durable offset after the user
reselects the file. File type and total size are not restricted by product
policy. Disk reserve and request rates constrain operational capacity. Files
are downloaded as attachments after membership checks. Completed files expire
exactly seven days after completion; incomplete uploads expire after one day.
The cleanup worker runs every minute, removes bytes before marking metadata
expired, and exits on failure so Docker restarts it. Readiness fails when its
heartbeat is stale after the startup grace period.

Application-managed snapshots deliberately exclude `data/chat` bytes. This
prevents old backups from restoring expired files. After a restore, the cleanup
worker marks missing attachment records expired before the service is ready.
The tradeoff is that a restore loses even unexpired chat attachments. Backup
operators must not make separate copies of `data/chat` that outlive seven days.
The host disk remains the at-rest trust boundary; HTTPS protects transport.

## Consequences

Chat messages and tombstone metadata remain after attachment expiry. The
runtime needs a separate cleanup worker and persistent storage. Operators can
inspect its last run and overdue count in `/api/health`.
