# ADR 0015 — Independent HerEme instances

Proposed for M1 review, 2026-11-24. Development implementation is authorized. Operator acceptance and production cutover are separate gates.

## Current architecture and audit

Inspected feature/tanteulerikkesvei at 0a93b6c, also the local main and branding tip. This is a feature delivery branch. All communities use the same release. The previous working-tree draft added a second port, concrete services, two domains in application policy, prefixed secrets and a coupled rollback. That draft cannot provide independent releases. The repository also contains historical implementations and systemd deployment examples. The Windows online deploy script packages only hereme-poc.

```text
80/443 → docker app network namespace → Caddy → loopback Node :3000
                                                   │
                  media, chat, push, Git workers ───┴─ docker_hereme-data
                                      Git worker ──── docker_hereme-content-git
                  Caddy ───────────────────────────── docker_caddy-data / caddy-config
```

Read-only VPS inspection on November 24 confirmed the legacy project `docker`, all four worker types, the proxy, the main data and Git mounts, and the two Caddy volumes. The live database is schema 23 with one administrator and two moderator role assignments. Push and passkeys are enabled. The old mutable image does not establish the deployed Git SHA. The deployer rechecks the running containers and their mount identities before changing service.

| Component | Current behavior and M1 consequence |
|---|---|
| Browser | Static HTML/JS, origin-scoped service worker, manifest and browser storage. Shared post URLs, card metadata and rendered preview text need the community origin. Presentation and the five category IDs stay with the shared release. |
| API | One Node process, one SQLite connection per process, one configured origin. HTTP enforces exact Host and unsafe-method Origin. Authenticated writes also require CSRF. Upgrade handling runs outside that middleware and needs its own Host check. |
| Identity | Host-only session, CSRF and challenge cookies. Recovery hashes, WebAuthn credentials, challenges, rate limits and staff roles belong to the local DB. Replace the RP hostname list with exact agreement between configured origin and RP. The gateway controls which hosts enter. |
| Storage | Preserve the whole data volume during a move, including hereme.sqlite, WAL/SHM, uploads, media derivatives and originals, avatars, chat stages and attachments, tmp and derived share-previews. SQLite holds users, sessions, posts/revisions, drafts, messages, memberships, subscriptions, queues, audit and migration state. Existing production data must require an existing database. A new managed instance starts empty. |
| Workers | Four worker types including the private content Git mirror. Only that worker mounts its private archive. Push requires outbound HTTPS and the instance's private VAPID key. Chat cleanup enforces seven-day expiry. Media conversion uses FFmpeg. |
| Recovery | Private per-site environment, VAPID pair, data snapshot/manifest, Git archive and reconciliation, and operational logs belong to each site. Normal verified snapshots omit chat bytes. Edge TLS state belongs to the gateway. |
| Release | Legacy deploy uses project docker, mutable latest, private .env, snapshot/verification, schema-aware code rollback and forced recreation. Use a separate manual development path with one content-addressed image and independent projects. Keep the single-site deployment available until a reviewed migration. |

## Decision

Provision one tenant Compose project per community, using one instance template and a separately supplied environment. Persist the DB and Git archive on external, explicitly named volumes. The app binds loopback. A Caddy sidecar shares only its own app network namespace. Each site has a dedicated internal ingress network with a fixed trusted edge peer. Other workers need no incoming network. Give the push worker a project-local egress network. Only the edge publishes HTTPS/HTTP. A release is pinned to the same image content ID or registry digest for every app and worker. Host-to-upstream bindings and network attachments are deployment configuration. Adding another site requires no application code changes.

```text
                 one TLS gateway, explicit SNI + Host routes
                /                                        \
  main ingress → sidecar → loopback:3000      community ingress → sidecar → loopback:3000
                   main volume + workers                       community volume + workers
```

Use one community database per instance. Member or staff authority is local. The platform operator uses a separate SQLite registry, password, authenticator code and host-only secure session. The operator can read live HTTPS health and release identity, and open or close registration. The central service mounts only its registry and the policy tree. Each community mounts its own policy directory read-only. Atomic replacement makes registration changes persistent and effective on the next sign-up. Existing members continue signing in. The gateway has no database, membership or Docker socket access. Sites start with local config and have no control plane dependency.

## Risks and migration gates

1. The operator confirmed `tanteulrikkesvei.hereme.no` is canonical. The issue bundle and branch use a different spelling. The apex and the chosen community resolve to the VPS. The panel also requires an `admin` A record.
2. The edge overwrites client IP metadata. The sidecar accepts only its configured edge peer and relays that value to Node. Host, Origin, CSRF and the upgrade handshake need positive and negative tests. Reserve admin and unlisted hosts. Peer addresses and CIDRs require conflict checks on the target host.
3. Restrict private content caching. Keep media authorization on the application path. SQLite, upload directories, Git history, TLS keys and VAPID secrets require separate owners and backups. A host administrator remains privileged across the VPS.
4. All communities share physical CPU and disk. Volume isolation does not impose disk quotas. Disk budgeting, off-host retained backups, stale-worker monitoring, and capacity under concurrent transcoding are production acceptance work.
5. Stopping a project, changing an image or rolling back must affect only that site. Never restore an older DB over newer writes. Rehearse backup, restore to fresh storage, restart and failed health checks before a production decision.

## Implementation and acceptance plan

1. Restore the prior single-site deployment files to their reviewed baseline. Add reusable app and edge Compose definitions under deploy/platform. Use a local certificate authority and loopback host ports for development.
2. Change server/config.js, db.js, chat-socket.js, shared links/metadata and preview generation. Preserve existing authentication and schema. Remove the community-specific push configurator. Reuse the existing per-environment push tooling.
3. Run both origins with temporary data. Exercise registration, cookies, post/media, chat, cross-session replay, Host/Origin/CSRF and WebSocket checks. Rehearse migration with verified synthetic data. Inspect runtime image IDs, networks, mounts, gateway routing/client IP and single-project replacement on a Linux Docker engine.
4. The operator subsequently requested both local panels and a central overview with health and registration controls for this release. The protected central service runs a separate entry point from the shared image. The existing SSH deployment account performs release operations on the host. The web panel has no access to Docker, SSH credentials, community SQLite, media or Git archives. A local TLS-verified health request through the edge supplies release status.
5. The deployer assigns the first main instance its observed legacy volumes. Later updates quiesce, snapshot, clone-check and replace one community at a time. It persists an active release pointer per project so a failure in the next project preserves a completed update. Public edge replacement is the last step. All application and worker containers use the immutable image ID. The bounded release supports schema 23. Adding a third deployment, general feature policies, branding, operator provisioning jobs and UI-driven releases remain separate milestones.
