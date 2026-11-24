# MI-01 and M1 implementation record

2026-11-24, feature/tanteulerikkesvei, based on 0a93b6c. **The independent runtime passed the development Docker rehearsal.** The user subsequently requested an operator-run cutover, both local panels and a central overview with health and registration controls. See the release handoff below for the current scope. The legacy Compose/Caddy files are retained to identify and recover the predecessor.

At 17:56 CET, `node hereme-poc/deploy/platform/rehearse.cjs` exited 0 on local Docker Engine 29.5.2. Both sites initially ran image `sha256:73c469297d5247749b113adda48b8ba3f9d36fb6295a9e5005bcfa047b29f0b6`. The main site's replacement image was `sha256:1ef7d03682b9d000e59a95136490104bccfd1a78debceb586b2da08548ae82ed`. After cleanup, Docker listed zero containers, networks, volumes or image tags matching rehearsal prefix `m1a8a82422df9b`.

Read [ADR 0015](adr/0015-independent-instances.md) for the current and proposed runtime diagrams, audit, retained data, risks, authority boundaries and implementation decisions. Use the [operator runbook](runbooks/multi-instance.md) for development start-up, per-site update, backup and recovery, route reload and migration sequence.

## File and component map

| Change | Responsibility |
|---|---|
| deploy/platform/instance.compose.yaml and sidecar.Caddyfile | App, private ingress, per-site worker set and volume mounts. The same template covers main and additional sites. |
| deploy/platform/edge.compose.yaml and edge/{Caddyfile,development.options,production.options} | Explicit host routes, original aliases, edge-only published ports, private peer addresses and persistent TLS state. Local CA and loopback bindings are development defaults. |
| deploy/docker/Dockerfile.dockerignore | Limit the application build context to package files, source, seed and public assets. |
| server/config.js, db.js, chat-socket.js | Require exact production HTTPS origin/RP agreement, preserve loopback, define existing versus new DB startup and check Host during WebSocket upgrades. No schema migration. |
| public/app.js, server/{index.js,share-meta.js,services.js,domain/share-previews.js}, public/security.html, public/i18n/misc-{nb,en}.json | Browser share links and server-generated share metadata/preview labels follow the community origin. Generic passkey guidance in both languages. |
| tests/instance-isolation.test.js, tests/support/instance-contract.cjs | Same two-site API contract against separate real Node processes or through the Docker gateway. Includes a temporary SQLite/media snapshot restore. |
| deploy/platform/rehearse.cjs | Local-only Docker rehearsal with ephemeral resources, one initial application image, actual HTTPS probes, runtime inspection and a compatible second image for the single-site update check. |
| tests/{passkeys.test.js,sharing-profiles.test.js,browser-smoke.cjs,logout-browser.cjs} | Domain, generated URL, clipboard and mobile sign-in/logout regression coverage. Logout had an obsolete registration selector. |
| docs/adr/0015-independent-instances.md, docs/runbooks/multi-instance.md, this file, existing ADR/contract/spec/runbook links and CHANGELOG.md | Decision, migration procedure and verification status. |

Removed the uncommitted configure-tante-env.js, its implementation-specific test and the hardcoded production rollout draft. Each project can use the same existing push configuration tool against its own private env. Identity, chat, revision storage and business rules continue to use their existing services.

## Acceptance ledger

| Gate | Evidence / outstanding check |
|---|---|
| Current architecture, instance ownership and migration map | Read-only VPS inspection confirmed the deployed legacy topology and original volume names, schema 23, existing staff roles, enabled push and passkeys. The previous mutable image has no verified Git SHA. |
| Two independent application runtimes | Passed in production mode on loopback with temporary SQLite databases and independent processes. Both had the configured origin and RP. The same username could register independently. |
| Session, data and request isolation | Passed host-only secure cookie checks, session replay rejection in both directions, foreign profile, post, uploaded image and private chat isolation, rejection of wrong Origin, CSRF and mismatched Host. The Docker run also exercised registration, separate notification inboxes and push keys, and authorized and denied WebSocket upgrades through TLS. |
| Persistence and main recovery | Passed snapshot, verification, restore into fresh storage, session/ID/media/chat persistence on reopened main, community availability while main was stopped and fail-closed missing existing DB. The existing suite also exercises private archive restore/reconciliation and chat expiry. |
| Existing functionality | 86 Node tests; JS syntax checks; browser suites for wall, avatars, chat, language, logout, mobile layout, passkeys, PWA notifications, install, sharing and voting. Initial logout test timed out waiting for a removed selector. Rerunning against the actual recovery confirmation form passed. |
| Deployment configuration | Docker Compose rendered both instance configurations and the edge. Verified the two distinct volume/network names, matching image reference, correct origins and absence of published app/worker ports in resolved configs. |
| Running container image IDs, mounts and networks | Passed inspection of both app containers, all eight workers and both sidecars. Every app and worker initially used the same image ID. Each worker mounted only its own site's data and, for Git workers, its private archive. Only the edge published ports. |
| HTTPS, edge WSS, client-IP forwarding, aliases and unknown-host rejection | Passed over loopback with the rehearsal CA. Caddy validated and reloaded its configuration. The www redirect, unknown HTTP/HTTPS hosts, mismatched SNI/Host, and the app audit hash of a controlled client's actual TCP address all matched expectations. |
| Independent updates | Passed. While the main stack was down, the other site's authenticated API returned 200. After main restarted on a different image, both image pins matched, the other app kept its container ID and session, and main retained its account and media. The candidate changed only an image label, so this exercises a schema-compatible update. |
| Public release | The chosen community A record resolves. Public admin DNS, the live cutover, issued certificates, device checks and operator observation are tracked separately from development evidence. |

## Operator release handoff

The active branch is `feature/tanteulerikkesvei`. The DNS name selected by the operator is `tanteulrikkesvei.hereme.no`. The production SSH account is UID 1000, the same UID as the Node containers. On November 24 the legacy project had one administrator and two moderator role assignments. Cloudflare resolved the two community names to `46.251.249.110`. Both authoritative nameservers subsequently confirmed the panel A record. The operator removed the Cloudflare preflight after its cached answer delayed deployment.

| Files | Implemented responsibility |
|---|---|
| `deploy/deploy-online.ps1`, `deploy/platform/release.py`, `scripts/verify-release-clone.js` | Clean-revision check, verified SSH transfer, immutable image, provisioned credentials, per-site snapshots, clone and schema checks, ordered releases, code-only recovery and credential retrieval. |
| `deploy/platform/{sites.json,management.compose.yaml,policy.compose.yaml,admin-route.caddy,edge/Caddyfile}` | Two-site inventory, exact public routes, isolated operator service and separate registration policy mounts. |
| `server/platform/{index.js,operator.js,policy.js,web/}`, `server/index.js`, `server/error-localization.js` | Separate operator auth with TOTP and host-only sessions, live readiness and revision, audited registration changes, backend enforcement, localized errors and readiness of the local policy. |
| `deploy/platform/test-deployment.cjs`, `deploy/platform/tests/`, `tests/support/instance-contract.cjs`, `tests/platform-operator.test.js` | Real Docker cutover from commit 0a93b6c with disposable accounts and a pre-cutover post, browser sign-in/toggles, authenticator vectors and throttling, failure recovery, repeat release and durable isolation. |
| Repository-root `.gitignore`, ADR 0015, runbooks, system spec and changelog | Credential exclusion, architecture, daily operation and migration handoff. |

Verification on November 24 included 88 passing Node tests, 126 JavaScript syntax checks and all 11 existing Playwright suites (wall, avatars, chat, language, logout, mobile shell, passkeys, notifications, install, sharing and voting). The initial missing English registration-closed translation was corrected and the full suite passed. The separate Docker isolation rehearsal passed explicit SNI routing, WSS, source-IP forwarding, private mounts and independent image replacement. The PowerShell 5.1 parser and Linux Python 3.12 syntax checks passed. Windows ACL checks confirmed the downloaded credentials can be restricted to the current user.

The final Docker cutover rehearsal (project prefix `cut389d40bdc2`) completed all assertions, verified the second release, and removed its containers, networks and volumes. It used source from the committed pre-platform release and synthetic data. It checked a pre-cutover member session and published post, the two local staff logins, isolation of member and operator cookies, one-time authenticator codes, mobile and desktop operator controls, independent registration and degraded-site reporting. A deliberately unstartable candidate exercised code-only rollback. It then deployed another release and checked the retained session, private chat, media, operator audit and registration state.

The operator credentials, new site staff and disposable test data are generated at runtime. A public deployment requires the operator's commit and execution of the deployment command. A real-device passkey, notification-delivery and retained main-content check follows cutover. Schedule off-host backups, capacity monitoring and the first 24-hour observation. Review these results before expanding into branding, further provisioning or web-triggered releases.

## First production attempt and recovery

The cutover at `49b87d7` stopped during verification of the main snapshot and resumed the original stack. Public readiness passed. Replaying the candidate on a disposable copy of the retained 218 MiB snapshot verified every input checksum. Startup then expired one unused article upload with three files and no post, draft or revision references. The original verifier compared the post-cleanup copy directly with the pre-cleanup manifest and rejected it.

The corrected verifier passed on that retained backup mounted read-only. It verifies every input file, then checks the original hashes after startup with a narrowly scoped allowance for expired, unclaimed article uploads. The full Node suite passed all 89 tests. Production retry awaits a new committed revision.
