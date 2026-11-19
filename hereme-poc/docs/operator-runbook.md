# Operator runbook

## Provision and deploy

Use a supported Linux VM with Node 24+, Caddy, SQLite-compatible local storage
and enough disk for retained originals plus derivatives. Create DNS only for a
domain actually controlled by the operator. Run `deploy/install.sh` as root,
replace every example value in `/etc/hereme/hereme.env`, install the reviewed
Caddyfile and open only 22 (restricted SSH), 80 and 443. The Node port stays on
127.0.0.1. Copy a pinned release to `/opt/hereme/releases/<version>`, owned by
root and not writable by the service, then run `scripts/deploy.sh`.

Never put cookies, recovery keys, CSRF values or provider secrets on command
lines or in logs. Keep the environment file root-owned and group-readable only.

## Routine checks

- `systemctl status hereme hereme-worker caddy`
- `curl --fail http://127.0.0.1:3000/api/live`
- `curl --fail http://127.0.0.1:3000/api/ready`
- `journalctl -u hereme --since today`
- verify the latest backup manifest and off-host copy
- review disk free space before enabling uploads or video

Readiness checks database read/write transaction, media paths, schema and free
disk. A failed check removes the instance from service but keeps liveness up for
diagnosis. Set `HEREME_UPLOADS_SUSPENDED=1` and restart when disk pressure makes
new media unsafe; text interactions remain available.

## Back up and restore

Run `node scripts/backup-data.js /off-host/staging/hereme-<timestamp>`. The
destination must not exist or be inside the live data directory. Copy the
completed directory off-host only after `node scripts/verify-backup.js <path>`
passes. Default policy: daily 14 days, weekly 8 weeks, monthly 12 months; the
operator must configure the scheduler and remote destination.

Restore into a new empty data directory with
`node scripts/restore-data.js <backup> <new-data-dir>`. Start a separate
loopback instance against it and verify ready, representative old/new URLs,
authors, votes, comment parents and all media before changing the service config.
Never restore over the live directory.

## Moderation and privacy

Use the local service account:
`sudo -u hereme node /opt/hereme/current/scripts/moderate.js list` and then
`... moderate.js act <post-id> <publish|hide|dismiss> --reason "operator note"`.
Use `scripts/roles.js` to grant/revoke capabilities and
`scripts/anonymize-user.js` only after identity/request verification. Commands
use domain services and append audit events. Remote admin is disabled.

## Rollback and incidents

Code rollback changes `/opt/hereme/current` to the previous immutable release
and restarts; schema rollback uses the pre-migration backup, never reverse SQL on
live data. For suspected compromise: stop Caddy, preserve logs/backups, revoke all
sessions, rotate secrets, inspect audit/security events, then restore a verified
snapshot. For failed media processing inspect durable job state; do not mark a
derivative ready by hand.
