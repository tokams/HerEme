# Operator runbook

## Passkey rollout (not deployed)

Keep `WEBAUTHN_ENABLED=false` until the canonical hereme.no cutover, trusted TLS,
two external DNS resolver checks, canonical redirects and account recovery have
passed. Configure `WEBAUTHN_RP_ID=hereme.no` and
`WEBAUTHN_ALLOWED_ORIGINS=https://hereme.no`. Never enroll production credentials
on nip.io. Local development uses localhost with a separately configured port.
Apply the additive schema with the normal verified WAL snapshot and preserve the
existing data volume and private chat bytes. Test an existing and new account.
Enable through the operator environment only after reviewing the security tests;
turn the flag off to roll back enrollment/login while recovery login continues.
Retain all credential tables and live data. Older code may reject the new schema;
use compatible current code with the flag off rather than a destructive restore.

Physical iPhone Safari/Home Screen, Android credential manager, and desktop
authenticators must be verified separately from Chromium virtual-authenticator
tests. Record the actual deployed SHA and devices; local code is not live evidence.

Existing members sign in with their recovery key, then use Profile → Sikkerhet ·
Passnøkler. Keep a recovery backup. Passkeys do not verify real-world identity or
change staff permissions. Synced credentials may appear on several devices.

For the proposed `hereme.no` cutover, see [domain migration](domain-migration.md).
This target is not yet verified live; DNSSEC activation is pending at Uniweb.

## Staff accounts and panel

Run `npm run staff:provision` once against the intended `HEREME_DATA_DIR`. It
creates `HerEmeAdmin` with `member`, `moderator` and `admin`, plus
`HerEmeModerator` with `member` and `moderator`. Recovery credentials are written
to `../secrets/staff-credentials.txt` by default and must remain outside Git.
The command refuses to overwrite that file or silently rotate an existing staff
identity.

Staff sign in through the normal profile menu. Every mutation requires a reason
and is recorded in `audit_events`. Censorship is reversible (`hidden`); delete is
permanent. Before bulk destructive work, take and verify the normal data backup.

## Provision and deploy

### Web Push rollout

Web Push is disabled by default. Generate one VAPID pair on an operator machine:

```sh
npm run push:generate-vapid
```

`deploy/deploy-online.ps1` initializes a missing pair inside the staged release,
sets `WEB_PUSH_ENABLED=1`, preserves the same pair on later deployments and never
prints either key. Manual Compose/systemd installations must perform the following
configuration themselves.

Put `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` and `WEB_PUSH_ENABLED=1` in the protected
main deployment environment. For systemd, put only `VAPID_PRIVATE_KEY` in
`/etc/hereme/hereme-push.env`; keep it `root:root` mode `0600`. Systemd reads it
before dropping privileges, and no HerEme application process can read the file.
For Docker, keep the private value in `deploy/docker/.env`; Compose passes it
only to `push-worker`. Never commit or print the private key in deployment logs.

Check public `/api/health` only for the enabled and worker-fresh booleans. Staff
can inspect subscription, queue, sent, retry and permanent-failure totals at
`/api/admin/push/health`; do not publish those small-community activity counts.
Push provider failure does not fail core readiness. Roll back immediately by
setting `WEB_PUSH_ENABLED=0` and restarting the app and worker; persisted in-app
notifications continue to work.

Changing HerEme's public origin or VAPID key invalidates the enrolled device
contract. Disable the flag, rotate the environment values, deploy, then ask
members to enable notifications again. Push subscriptions and encryption keys
are confidential and are included in SQLite backups; protect backups accordingly.
Delivery outbox records are retained for 30 days. Disabled device records remain
for operational history until account deletion or a future documented cleanup.

Before enabling production, verify manifest and Service Worker MIME/scope through
the public HTTPS origin, then complete real iPhone Home Screen and Android
background delivery, tap navigation, logout and account-switch checks.

### Chat retention and automated Docker deployment

Chat attachments live only in the private `chat` directory of the data volume.
The one-minute chat worker deletes completed files seven days after upload and
abandoned uploads after one day. The normal snapshot omits attachment bytes;
restored snapshots therefore preserve message text and file tombstones but do
not recover shared files. Do not make separate long-lived copies of that
directory. Check `/api/health` for `chat_worker.last_run` and `overdue`; stale
cleanup eventually fails `/api/ready`.

On Windows PowerShell, after reviewing and committing a clean release, run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/deploy-online.ps1`
from `hereme-poc`. The script uses the pinned public host, dedicated SSH key,
strict host-key verification and existing remote `.env`. It packages the
committed `hereme-poc` tree, copies it to the Docker host, makes and verifies
a data snapshot, builds the new image, restarts Compose and checks public
readiness. On failed cutover it restores the previous image, code and snapshot.
The backup verifier mounts its snapshot directory writable because SQLite may
need to create a temporary shared-memory sidecar even for a read-only database
connection. The verifier does not modify the snapshot database.
The script never removes the named data volume. Previous code and backups are
retained on the host for operator review; prune them only under the retention
policy. It requires `git`, `ssh` and `scp` locally, and Docker Compose and
`curl` on the host.

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
The production image includes the reviewed operational scripts so backup,
verification, staff provisioning and selective import run against the exact
server/domain code shipped in that image.

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

- `systemctl status hereme hereme-worker hereme-push-worker caddy`
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
