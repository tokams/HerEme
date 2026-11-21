# E12-01 domain migration

Prepared locally from `2bdb336448420857ddcf8bd3af6523a7847d9f79` on `master`.
Target: https://hereme.no. Deployment is NOT verified or performed.

## Execution ledger

T0 PARTIAL: clean baseline; Cloudflare resolver 1.1.1.1 returned NXDOMAIN for
both apex and www during this execution. Live inspection/cutover blocked by DNS.
No passkey/WebAuthn implementation exists in this baseline: existing accounts use
nickname and recovery key. Host-only sessions require a new login on the new host.
The operator reports Uniweb DNSSEC activation is pending and may take several
hours. Google resolver 8.8.8.8 also returned NXDOMAIN for the apex. No DNS edits
were made. Do not cut over until public resolution succeeds.
T1 PARTIAL: Docker Caddy has temporary 307 alias redirects preserving `{uri}`.
Production container validation runs before cutover; local engine check recorded
separately. `deploy/Caddyfile` is the standalone systemd deployment configuration;
Docker uses `deploy/docker/Caddyfile`. Standalone configuration is not migrated.
T2 PASS locally: explicit previous-domain guard, private environment backup,
idempotent domain-only edit, unchanged VAPID and push settings, data-preserving
rollback. Existing `docker` project and all volumes are retained.
T3 PASS locally: existing strict canonical Host/Origin checks, host-only Secure
cookies and relative PWA/chat/share routes need no weakening or account migration.
T4 PARTIAL: no subscription deletion/key rotation; real iPhone delivery BLOCKED.
T5 PARTIAL: local tests; live DNS/HTTP/TLS/authorized-account tests remain blocked.
Local verification: 53/53 Node tests, syntax check of 81 JavaScript files,
PowerShell parser and git diff check pass. Docker Linux engine unavailable;
Caddy container validation is BLOCKED locally, mandatory before remote cutover.
T6 BLOCKED: DNS failed; changes require reviewed clean committed release.
T7 PASS: operator procedure and verified/proposed distinction documented here.

## Operator procedure

Confirm A records via 1.1.1.1 and 8.8.8.8 resolve exclusively to the deployment
server, www CNAME points to apex, and no unexpected AAAA exists. Check TCP 80/443.
Do not change unrelated DNS records or purchase TLS. Caddy obtains certificates.

After reviewing and committing, run from deploy:

```powershell
.\deploy-online.ps1 -Plan
.\deploy-online.ps1 -ExpectedPreviousDomain hereme.46.251.249.110.nip.io
```

Subsequent same-domain deployments omit ExpectedPreviousDomain. The script refuses
unknown previous hosts and preserves all non-domain environment values. It no
longer calls configure-push-env during deployment, so disabled push stays disabled
and VAPID cannot rotate as a domain side effect.

Backups live beside the installation under `hereme-backups/<UTC timestamp>`.
Database/public-media snapshot is verified; `production.env` is mode 0600 and must
never be printed or committed. Private chat bytes remain on the existing volume
and are never deleted/restored by domain rollback. Previous code/config/env remain
at `hereme-previous-<timestamp>`. Automatic rollback restores that directory and
image, reusing current data. Never restore an old database over concurrent writes.
Application schema incompatibility after rollback requires operator intervention;
do not automatically restore snapshots. Domain-only changes do not change schema.

Before calling migration complete, verify canonical ready/health, all three TLS
certificates, HTTP-to-HTTPS, 307 www/legacy path and query preservation, existing
account recovery (same ID/roles/content), CSRF writes and authenticated WSS, media,
manifest/icons/root service worker, same public VAPID key, and a consented push.
Record actual release SHA and pre/post data reconciliation. No authorized account
or private credentials should be included in this document.

## Existing users

Open hereme.no and sign in again using the existing nickname and recovery key.
Browsing remains public. Add the new domain to the Home Screen and explicitly
enable notifications again. Old PWA installations and push subscriptions cannot
transfer to the new origin; existing records are retained. Remove the old Home
Screen installation to avoid using two installations. Operators should audit old
subscription retirement separately; do not bulk-delete devices during cutover.
