# M1 operator rehearsal and migration

Run from `hereme-poc`. Use a development Linux Docker engine (Docker Desktop in Linux container mode works with PowerShell), Node 24+, installed package dependencies, two free loopback ports 18080/18443, and space for the image, media and SQLite reserves. Keep instance env files in a private operator directory outside the checkout. Use one file per project. Never paste a resolved Compose config containing keys into logs.

## Deploy the managed sites from Windows

Use a maintenance window for the first cutover. The active Docker project on the host is `docker`. Its main SQLite/media, private Git archive, TLS data and Caddy config volumes must be present. The script requires the existing SSH key, pinned SSH host key, a reviewed clean Git commit, Linux Docker Compose, Python 3.9+ and the deployment account with UID 1000. Allow disk space for retained backups, the build and a temporary copy of the largest site. Keep a verified off-host copy of the private deployment data.

Set Uniweb A records for the apex, `tanteulrikkesvei` and `admin` to `46.251.249.110`. Keep the existing `www` CNAME. Run these commands from `hereme-poc/deploy`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy-online.ps1 -Plan
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy-online.ps1
```

The first command prints the deployment plan locally. The second transfers the committed application tree over SSH, checks its SHA-256, builds or reuses the image for that commit and validates the gateway. On first cutover it stops the old writers, snapshots and verifies each site's SQLite and durable media, archives private Git content and starts the candidate on a disposable copy. The live main volumes and signing keys stay in place. The new site's independent staff accounts, keys and registry are provisioned before its public route opens. The operator receives both local staff panels plus a separate panel at `https://admin.hereme.no/`. The Windows command also verifies TLS, origin and release from the client network.

After the first release the deployer backs up and updates main, then the additional community, checking readiness and image IDs at each step. Each site has a brief maintenance interval. Updating the shared edge briefly affects both routes. The SSH-side release lock serializes operators. A failed site update stops progression and restarts that site's previous compatible release on its existing volume. A completed site's release is recorded separately. The current rollout supports schema 23 and checks candidate startup on copies before activation.

The candidate verifies the entire snapshot manifest on a private copy before starting services. Startup can expire an unattached article upload after one day. The second check permits its recorded files to disappear only when the upload was unclaimed, its media row was removed, and the paths have no surviving media references. An unexpected missing file or checksum mismatch stops the rollout. Preserve the backup for diagnosis.

### Access and manual verification

- Use the existing main administrator and moderator logins on `https://hereme.no/`. For `https://tanteulrikkesvei.hereme.no/`, use the new `HerEmeAdmin` or `HerEmeModerator` from the repository-root `secrets/tanteulrikkesvei-staff-credentials.txt`. Open the staff panel from the signed-in account menu.
- At `https://admin.hereme.no/`, use `secrets/platform-operator.txt` and enter its setup key into your authenticator as a time-based six-digit SHA-1 account. Protect these files as credentials. If SSH succeeded and the download was interrupted, rerun the Windows command with `-CredentialsOnly`. A conflicting local credential file requires operator review.
- Each community card in the platform panel includes a QR code for its public HTTPS homepage. Scan the code with a phone camera to open that community directly. The QR endpoint requires the platform operator session.
- Confirm both communities show **Ready** and the expected release. Close registration for the additional site, check a signed-out registration there and check an existing sign-in. Main should still accept registrations. Reopen the site and verify the audit entry. The panel's Refresh status button performs a fresh probe.
- Check an existing main account, post URL, original image, chat, notification tap and passkey on a real device. Use two disposable accounts to check the additional site. Record public certificate issuance, device delivery and the first 24 hours of worker/queue health.

### Recovery

The host root is `/home/dongjel/services/hereme-platform`. `active-main`, `active-community` and `active-edge` point to the last verified release for each project. `current` is the last release verified across all three. Under `backups/<release>/` each site has `site/snapshot.json`, its DB and durable media, `archive.tgz` and `archive.sha256`. The separate `state` backup contains the operator registry, credentials and policies. The main/secondary data volumes retain private chat bytes subject to ordinary seven-day expiry. Keep the original TLS volumes and the stopped legacy containers. Restrict and rotate off-host backups under the retention policy.

After a failure, inspect the first deploy error, active pointers, `docker ps -a` and the affected project's logs. If the SSH process or host was interrupted, establish which containers still own each named volume. Stop competing writers before resuming. For an established site with a verified compatible schema, run the following on the host, substituting the affected stack name:

```sh
stack=community
release=$(readlink -e "/home/dongjel/services/hereme-platform/active-$stack")
docker compose --env-file "$release/$stack.env" -f "$release/deploy/platform/instance.compose.yaml" -f "$release/deploy/platform/policy.compose.yaml" up -d --force-recreate --wait
```

For the edge, use its active release, `edge.env`, `edge.compose.yaml` and `management.compose.yaml`. If the first cutover failed before any active pointers were established, verify the candidate writers are stopped and the DB is still schema 23. Start the retained legacy containers with `docker compose -p docker -f /home/dongjel/services/hereme/deploy/docker/compose.yaml start --wait`. Verify main availability and sessions. A database/schema incompatibility requires forward recovery or an explicitly approved restore into fresh volumes with reconciliation of newer writes. Release automation never restores a backup over a live site.

## Disposable checks

```powershell
node --test tests/instance-isolation.test.js
node deploy/platform/rehearse.cjs
node deploy/platform/test-deployment.cjs
```

The first command runs production HTTP/auth middleware against two temporary databases and restores one snapshot. The second builds once, records the content ID, creates randomly named projects/networks/volumes, and runs both apps, both sets of workers and an edge. TLS connections use the exported *development CA certificate*, the real canonical hostnames as SNI, and TCP to 127.0.0.1. The script probes HTTPS, media, chat, WebSockets, cookie and origin isolation, upstream client IP, unknown hosts, image IDs, mounts and independent app-stack replacement. It removes the named rehearsal resources on exit. It uses a local CA without installing it on the machine. An interrupted rehearsal can leave its disposable projects/volumes behind. Use Docker's project labels and the printed resource names to identify them.

The third command rehearses the production release procedure on a local Linux Docker Engine with temporary resources, ports 18081/18444 and 18082/18445, and a real legacy-shaped project. The temporary operator container needs the local Docker socket to run the same release commands as the SSH account. Community and platform web services have no socket mount. Install Playwright Chromium for the browser checks.

## Manual development setup

1. Build the app once. Record the image ID and keep this artifact for both sites and all workers. For production releases, build from an identified clean source revision, label with that revision, retain the registry digest and pin the Caddy image by digest. Pull the chosen digest on the host and resolve its local image ID. Do not rebuild independently per site.

   ```powershell
   docker build --load -t hereme:m1-development -f deploy/docker/Dockerfile .
   (docker image inspect --format '{{.Id}}' hereme:m1-development) -replace '^sha256:',''
   ```

2. Create dedicated internal networks after checking for CIDR overlap. Reserve a dynamic pool away from the edge IP so either site may start first. The following commands are for **new development resources**.

   ```powershell
   docker network create --internal --subnet 172.29.180.0/24 --gateway 172.29.180.1 --ip-range 172.29.180.128/25 m1_main_ingress
   docker network create --internal --subnet 172.29.181.0/24 --gateway 172.29.181.1 --ip-range 172.29.181.128/25 m1_community_ingress
   'm1_main_data','m1_main_git','m1_community_data','m1_community_git','m1_edge_tls','m1_edge_cfg' | ForEach-Object { docker volume create $_ }
   ```

3. Prepare three env files. The two tenant columns each describe a separate file.

   | Setting | main.env | community.env |
   |---|---|---|
   | INSTANCE_PROJECT | m1_main | m1_community |
   | INSTANCE_HOST | hereme.no | tanteulrikkesvei.hereme.no |
   | APP_IMAGE_ID | 64 hex digits from step 1 | same ID |
   | DATA_VOLUME | m1_main_data | m1_community_data |
   | ARCHIVE_VOLUME | m1_main_git | m1_community_git |
   | EDGE_PEER | 172.29.180.2 | 172.29.181.2 |
   | DATABASE_START | empty | empty |
   | WEBAUTHN_ENABLED | true | true |

   Use `empty` to initialize an empty development DB. On subsequent releases set `DATABASE_START=existing`. Existing deployments and restored snapshots always use `existing`. Preserve each site's effective push settings. For a *new* private env file with push enabled, run the existing `node scripts/configure-push-env.js <env-file> <hostname>` once. Back up the resulting secret file. Validate completeness of an existing pair before reuse. The push worker is the only tenant service receiving the private key. Standard member registration creates a local account. Provision staff in that site's app container using the existing operator procedure.

   Development edge.env:

   ```dotenv
   EDGE_PROJECT=m1_edge
   MAIN_PROJECT=m1_main
   COMMUNITY_PROJECT=m1_community
   MAIN_EDGE_PEER=172.29.180.2
   COMMUNITY_EDGE_PEER=172.29.181.2
   EDGE_DATA_VOLUME=m1_edge_tls
   EDGE_CONFIG_VOLUME=m1_edge_cfg
   TLS_POLICY=development
   ```

4. Start the three projects using their actual private env paths. Check the effective project name, image ID, volume names and networks for both sites before starting. Use `config --quiet` to validate without printing private values.

   ```powershell
   docker compose --env-file C:/private/main.env -f deploy/platform/instance.compose.yaml up -d --wait
   docker compose --env-file C:/private/community.env -f deploy/platform/instance.compose.yaml up -d --wait
   docker compose --env-file C:/private/edge.env -f deploy/platform/edge.compose.yaml up -d --wait
   docker compose --env-file C:/private/edge.env -f deploy/platform/edge.compose.yaml cp edge:/data/caddy/pki/authorities/local/root.crt "$env:TEMP/hereme-m1-ca.crt"
   curl.exe --noproxy "*" --cacert "$env:TEMP/hereme-m1-ca.crt" --connect-to hereme.no:443:127.0.0.1:18443 https://hereme.no/api/meta
   curl.exe --noproxy "*" --cacert "$env:TEMP/hereme-m1-ca.crt" --connect-to tanteulrikkesvei.hereme.no:443:127.0.0.1:18443 https://tanteulrikkesvei.hereme.no/api/meta
   ```

   Each response must report the requested public origin. For an interactive browser use a dedicated development machine/profile with **both** names mapped to loopback, the development CA trusted and the edge bound to loopback on standard 443. This keeps production Host/Origin enforcement intact. The automated rehearsal needs no DNS, trust-store or hosts-file edits.

5. Record each app's container ID, image ID, readiness and worker health. Change one private env's pinned image ID to a reviewed compatible image, set existing mode and repeat `up -d --force-recreate --wait` for **only that project**. Check its data, roles, login, uploads, chat, notification delivery and WebSockets. Check the other site's container IDs, sessions and readiness before advancing. If a gate fails, stop the rollout. The SSH-side command above coordinates the two production sites. Provisioning and releases through the web panel are deferred.

6. Reload route changes explicitly. Keep the previous version of the edge directory. Prepare and validate the candidate configuration with the same Caddy image, env and import paths, then atomically replace the active configuration file in the mounted directory. From the edge project run `exec -T edge caddy validate --config /etc/caddy/Caddyfile`, then `exec -T edge caddy reload --config /etc/caddy/Caddyfile`. A failed reload retains the running configuration. Restore the previous on-disk file on failure so a restart also loads the working routes. Adding a network to the edge requires a reviewed Compose change and edge recreation. Only explicit site blocks acquire certificates.

## Production migration gates (requires separate operator approval)

1. Inventory the live Compose project, app/worker image **IDs**, active release directory, canonical origin, ports, Caddy settings and actual volume mount names with read-only inspection. Record schema version and counts per entity, IDs and checksums, latest worker heartbeat, roles, recovery and passkey configuration. Confirm the correct spelling in authoritative and public DNS. Inspect host disk, memory, IPAM, firewall, and backup ownership. Retain the original release and image. Restrict all private env, archives and backups.
2. On temporary storage, verify a WAL-aware snapshot using `scripts/snapshot-data.js` and `scripts/verify-backup.js`. Restore using `scripts/restore-data.js` **only into a new directory**. Rehearse restoring the corresponding private content Git volume and its checksum, run its worker with `--reconcile`, and compare version mappings. Rehearse roles, posts, original media, avatars, login, chat and passkeys. Scheduled snapshots must target a distinct private backup directory and retention policy for each instance. Normal snapshots deliberately omit chat attachment bytes, including still-valid files. The live in-place volume migration preserves them.
3. Agree a maintenance window, stop accepting writes and quiesce all writers including workers. Take/verify final snapshot and matching Git archive. Preserve private environment and both Caddy state volumes. Keep off-host copies under the existing retention policy. Never bring two releases up as writers of the same volume. Verify sufficient free space per site and host-level quotas, conversion concurrency, TLS, monitoring and alerting before enabling traffic.
4. Configure the first instance with the **observed existing** main data/archive volumes (expected docker_hereme-data and docker_hereme-content-git), `DATABASE_START=existing`, the original origin/RP, flags and VAPID pair. Start the second from new empty volumes with its own keys. Verify the two volume names and networks are pairwise distinct. Reuse the original edge certificate volumes only after their previous owner is stopped. Explicitly select production TLS policy and public bindings on 80/443. Keep the www and legacy redirects. Use the managed deployment command above for this cutover and future updates.
5. Gate release on exact image IDs, HTTPS/ready and worker freshness at both sites, unaffected member/staff sessions, real-device passkeys and push, PWA, historical URLs, chat bytes and snapshots. Observe queues, resource use, backups and certificate issuance/renewal. Production acceptance includes the planned 24-hour observation.
6. If cutover fails, route traffic away from the affected instance and stop its writers. Revert code against the current volume only when schema **and behavior** remain compatible. Preserve newer writes and current volumes if compatibility is unknown. Use forward recovery or a separately approved, reconciled restore to fresh volumes. Revert gateway configuration independently. An unverified snapshot restore must never be an automatic rollback step.
