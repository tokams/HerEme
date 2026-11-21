# ADR 0009: Private chat and seven-day attachment retention

## Decision

SQLite is the canonical store for direct-message requests, accepted membership,
group invitations, messages, attachment metadata and presence heartbeats. The
browser calls the same authenticated domain actions as the HTTP API. Selecting
a user opens a local draft without server writes. The first send creates a
canonical direct conversation in `pending` state, stores the first message and
one durable request notification. Only the requester can read pending messages.
Acceptance adds the recipient as a member and reveals the pending history;
decline is terminal for that user pair. A second contact attempt while pending
reuses the same conversation, and reciprocal first sends accept the existing
request. Client message keys make retries idempotent. Group creators may invite
people, and invitees gain access only after accepting. Current group members
may invite additional people. Blocking stops direct messaging and further
requests; it does not erase history.

Presence is opt-in, shown only to accepted conversation members, and expires
after 90 seconds without a heartbeat. The browser refreshes every 30 seconds;
this bounded polling is the initial live-update transport. No last-seen time is
shown. A unified inbox orders direct and group conversations by activity.
Indexed username candidates are ranked by exact, prefix, substring and bounded
Levenshtein distance. Durable in-app notifications track requests, invitations,
decisions and accepted-chat messages without storing message text. Message text
remains durable; moderators have no private-chat read API.

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
