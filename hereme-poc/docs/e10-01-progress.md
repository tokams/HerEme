# E10-01 implementation ledger

## T0 — observed baseline and locked contract

- Branch: `feature/push-notifications`, created from clean `main` on 2026-11-21.
- Schema 14 owns `chat_notifications` and `chat_events`. `server/domain/chat.js`
  creates chat notifications inside the same transaction as the chat action.
- `server/domain/interactions.js` creates comments but currently has no forum
  notification producer. Sessions, CSRF, host/origin checks and rate limits are
  centralized in `server/index.js` and `server/domain/identity.js`.
- Static files are served from `public/`. Current routes include `/`, `/me`,
  `/chat` and `/chat/:id`. Docker supervises the app, media worker and chat
  cleanup worker.

### Interface contract

- Migration 15 adds `forum_notifications`, `notification_preferences`,
  `push_subscriptions`, `push_outbox`, `push_deliveries` and `push_worker_state`.
- Categories are `chat_messages`, `chat_requests_and_invitations` and
  `forum_replies`. Account preferences default on. Device subscriptions are
  enabled independently and an endpoint has exactly one current owner.
- Routes: `GET /api/push/config`, `GET|POST /api/push/subscriptions`,
  `DELETE /api/push/subscriptions/:id`, `GET|PUT /api/notification-settings`,
  `GET /api/notifications`, and `POST /api/notifications/:id/read`.
- Push event payload is bounded JSON: `{notification_id,kind,title,body,route,tag}`.
  It contains no message text, file metadata, recovery data or credentials.
- Chat routes are `/chat/:id`; request/invite routes are `/chat`; forum reply
  routes use the implemented `/?post=<id>` detail route.
- Chat canonical notification IDs use `chat:<id>`; forum IDs use `forum:<id>`.
  Outbox event keys are unique and only future notification insertions enqueue.
- The worker leases due outbox rows, expands them to active owned subscriptions,
  rechecks preferences and current access, sends with bounded concurrency, and
  applies bounded exponential retry. HTTP 404/410 disables the subscription.
- `WEB_PUSH_ENABLED` is off by default. VAPID private material is environment
  only. Push upstream health never makes core forum readiness fail.
- Logout disables the current owned subscription by both server ID and the
  browser's actual endpoint before ending the session. Account transfer replaces
  the subscription ID and cascades queued work. Payloads remain generic.

## Ownership and progress

| Task | Status | Files |
| --- | --- | --- |
| T0 | PASS | `docs/e10-01-progress.md` |
| T1 | PASS | manifest, icons, Service Worker, PWA registration |
| T2 | PASS | migration 15, API, chat/forum canonical events |
| T3 | PASS | supervised worker, timeout, leases, retries, access recheck |
| T4 | PASS | device opt-in/off, category settings, unified inbox and badge |
| T5 | PASS | validated click routes, auth continuation, safe unavailable views |
| T6 | PARTIAL | automated/security/config gates pass; physical/Linux gates pending |

Manual Android, iPhone and deployed HTTPS gates are NOT VERIFIED.

## Verification ledger

- Baseline before implementation: `npm test` — 38/38 passed.
- Current: `npm test` — 51/51 passed after the final security fixes. The
  targeted API, push and PWA suite also passed 27/27. `npm run test:browser`,
  `npm run test:chat-browser` and `npm run test:pwa-browser` passed.
- `npm run check` checked 78 JavaScript files. `docker compose ... config
  --quiet`, Git Bash syntax checks and `git diff --check` passed.
- Independent read-only security review findings were fixed: provider timeout,
  ownership transfer, logout endpoint fallback, generic payloads, decision access,
  VAPID secret isolation and public telemetry minimization.
- Docker Desktop's Linux engine was unavailable, so the Linux container smoke
  build is BLOCKED locally. Production deployment was not requested or performed.
  Physical-device and public HTTPS checks remain explicit operator/external gates.
