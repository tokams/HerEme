# Operator runbook

## Provision and deploy

Use a supported Linux VM with Node 24+, Caddy, SQLite-compatible local storage
and enough disk for retained originals plus derivatives. Create DNS only for a
domain actually controlled by the operator. Run `deploy/install.sh` as root,
replace every example value in `/etc/hereme/hereme.env`, install the reviewed
Caddyfile and open only 22 (restricted SSH), 80 and 443. The Node port stays on
127.0.0.1. Copy a pinned release to `/opt/hereme/releases/<version>`, owned by
root and not writable by the service, then run `scripts/deploy.sh`.

For an isolated Docker host, copy a reviewed release to a dedicated directory,
set `HEREME_DOMAIN` in `deploy/docker/.env`, and run:

```sh
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

The application and Caddy share one network namespace so the production Node
listener remains loopback-only. Only ports 80 and 443 are published. Application
data and Caddy certificate state live in named volumes and both containers use
`unless-stopped`. The worker shares the application volume and uses the FFmpeg
and FFprobe binaries pinned into the application image. Use a distinct Compose
project name when the host runs more than one HerEme deployment.

### Current public PoC target

The public PoC is `https://hereme.46.251.249.110.nip.io/` on
`46.251.249.110`. Connect as the non-root admin account with the dedicated key:

```sh
ssh -i ~/.ssh/dongjel_relay dongjel@46.251.249.110
cd /home/dongjel/services/hereme
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

The remote directory is a reviewed release copy, not a Git checkout. Back up the
files being replaced before copying a new release, retain `deploy/docker/.env`,
and never replace or remove the `docker_hereme-data` volume during a code deploy.
Root SSH is disabled. Verify the existing SSH host key instead of accepting a
changed key during deployment.

Never put cookies, recovery keys, CSRF values or provider secrets on command
lines or in logs. Keep the environment file root-owned and group-readable only.

## Routine checks

- `systemctl status hereme hereme-worker caddy`
- `curl --fail http://127.0.0.1:3000/api/live`
- `curl --fail http://127.0.0.1:3000/api/ready`
- `journalctl -u hereme --since today`
- verify the latest backup manifest and off-host copy
- review disk free space before enabling uploads or video

For Docker deployments, replace the systemd checks with
`docker compose -f deploy/docker/compose.yaml ps` and `... logs`; query readiness
through the configured public HTTPS origin because production host validation
intentionally rejects requests for an unconfigured host.

Readiness checks database read/write transaction, media paths, schema and free
disk. A failed check removes the instance from service but keeps liveness up for
diagnosis. Set `HEREME_UPLOADS_SUSPENDED=1` and restart when disk pressure makes
new media unsafe; text interactions remain available.

## Back up and restore

The installed `hereme-backup.timer` runs a daily WAL-safe snapshot, verifies its
manifest immediately and retains `HEREME_BACKUP_KEEP` local copies. Inspect with
`systemctl list-timers hereme-backup.timer` and `journalctl -u hereme-backup`.
For an ad-hoc copy run `node scripts/backup-data.js /off-host/staging/hereme-<timestamp>`. The
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
