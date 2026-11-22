# HerEme system specification

**Passkeys:** additive WebAuthn authentication is implemented locally for
canonical hereme.no. Production remains disabled pending domain/security/device
verification. Existing user identities and recovery login remain authoritative.
See [ADR 0011](adr/0011-passkeys.md) and `PASSKEYS_PROGRESS.md`.

**Proposed domain migration:** `https://hereme.no`; local deployment tooling and
temporary www/legacy redirects are prepared. Live cutover is BLOCKED pending DNS
resolution and a reviewed clean release. See [execution ledger](domain-migration.md).

**Snapshot:** 2026-11-22, E19 mobile UI stabilization in the local worktree
**Code baseline:** `master` at `8f9fdd2` plus uncommitted E19 changes. See `docs/E19_IMPLEMENTATION.md` for local evidence.
**Frozen baseline:** `release/v2` points to `5d7b72d`; it intentionally does not include the v3 changes.
**Purpose:** One place to understand current behavior and scope the next change. Update the snapshot and evidence when code or deployment changes.

## How to read this document

| Label | Meaning |
| --- | --- |
| **Implemented** | Present in the code baseline above and covered by the stated local checks. |
| **Observed online** | Confirmed by a read-only public check at the snapshot time. |
| **Unverified online** | Code or prior deployment records exist, but this snapshot did not prove the full production flow. |
| **Proposed** | Requested or designed behavior that still needs implementation or validation. |

The code baseline is the source for implementation details. The public site is a separate operational state. A passing readiness check does not identify a deployed Git commit or prove an authenticated user flow.

## Product and users

HerEme is a pseudonymous local forum for Stavanger, Sandnes and Rogaland. Everyone can read the shared poster wall. Posting, voting, commenting, reporting and private chat require an account. Accounts use a pseudonym, a recovery secret and secure sessions; ordinary use does not require a real name or BankID.

| Actor | Current capabilities |
| --- | --- |
| Visitor | Read the wall, open posts and view public media. |
| Member | Create posts; vote, comment and report; manage their account; use consent-based direct and group chat. |
| Moderator | Member capabilities plus censor or restore whole posts through the staff panel. |
| Administrator | Moderator capabilities plus the content overview, edits to stored content and vote scores, and permanent deletion of posts, comments or users. User deletion explicitly offers a preserve/delete-posts choice. |

Staff use personal recovery sign-in. Mutations are capability and CSRF checked, require a reason where applicable, and are audited. Credentials belong in the ignored `secrets` directory, never in this specification.

## Implemented public forum behavior

| Area | Current contract |
| --- | --- |
| Wall | One published feed ordered newest first; historical rooms remain in data but are retired from navigation and creation. |
| Categories | Exactly five poster styles: question, opinion, story, alert and tip. Filters allow multiple or no categories. |
| Posts | Text, link, image and video paths; poster crop and title placement are stored with content. New posts begin with an author upvote. |
| Voting | One current vote per user/post. Repeating a vote removes it; changing direction replaces it. Displayed score includes preserved historical base score. |
| Discussion | Nested comments up to four levels including the root. Reports are submitted from post detail; three distinct unresolved reporters move published content to review. |
| UI | Mobile full-screen post detail; desktop Simple and Advanced wall views; light/dark preference; locally served Cascadia Code; square controls and reduced-motion support. |
| Media | Original images are kept and validated server-side; display and thumbnail derivatives are generated. Post video is at most 180 seconds and uses the media worker when enabled. |
| Staff | Role-based moderator and administrator surfaces, with audited actions and server-side authorization. |
| Personal profile | An authenticated member has a private, addressable `/me` profile with their identity, member date, received upvotes, authored-post activity and accepted direct/group-chat counts. They may add, crop, replace or remove an optional public-facing avatar. |
| Public profile | Visitors may open `/u/<stable-user-id>` for an active user's avatar, pseudonym, join date and post/comment/total reputation only. The public DTO does not reuse `/me`. |
| Comment votes | Signed-in members can upvote/downvote another user's comment under a published post, repeat to remove or switch. Comment score and caller vote are projected with the discussion. |
| Post sharing | Published `/?post=<id>` returns raw escaped post-specific Open Graph metadata and a cached category-themed JPEG. Canonical new links use `https://hereme.no`; hidden/missing posts receive no specific metadata or image access. |
| PWA and notifications | The site exposes an optional installable PWA. Members have one in-app inbox, account category preferences and per-device Web Push opt-in. Production push remains disabled until device verification. |

## PWA and notification delivery

- `manifest.webmanifest`, branded 192/512 PNG icons and a root Service Worker
  support installation without changing normal browser use. The worker handles
  push and safe same-origin notification routes and caches no protected data.
- SQLite remains authoritative. Chat requests, invitations, decisions and
  accepted-chat messages reuse `chat_notifications`; replies add compact
  `forum_notifications`. Both feed the unified in-app inbox.
- Schema 15 adds account preferences, per-device subscriptions, a transactional
  outbox, retry-safe deliveries and worker telemetry. Newly subscribed devices
  receive future events only.
- Push payloads contain generic text and a validated HerEme route. They exclude
  message bodies, attachment metadata, credentials and tokens. The worker
  rechecks preferences, subscription ownership, blocks, membership and content
  availability immediately before delivery.
- `WEB_PUSH_ENABLED` defaults off. The supervised worker applies bounded retries,
  disables HTTP 404/410 endpoints and reports only enabled/fresh state publicly.
  Detailed counts require staff access. In-app notifications work while push is
  off or denied.
- Physical iPhone Home Screen, Android background and deployed HTTPS delivery
  remain **NOT VERIFIED** and are required before enabling production push.

## Browser routes and authentication

- `/` is the public wall. `/?post=<id>` is an addressable post-detail state. The wall selection, query, sort and scroll position are retained through browser Back/Forward navigation.
- `/chat` is the authenticated inbox and `/chat/<opaque-chat-id>` is an authenticated conversation route. The server returns the chat application shell for these routes; authorization and conversation membership remain API-enforced, so a URL never grants access to chat content.
- `/me` is the authenticated member's own profile only; its private activity and account details do not appear in the public profile DTO.
- `/u/<stable-user-id>` is a guest-readable minimal public profile for an active account. Public post and comment bylines link by stable ID; Start Chat opens `/chat?user=<id>` as a local draft or existing direct conversation and preserves first-Send consent.
- One shared responsive dialog provides **Logg inn** and **Opprett konto** everywhere an account is required, including the chat route. It preserves the recovery-key model, displays a newly issued key exactly once and does not auto-submit the action that originally required authentication.
- After registration, passkey enrollment is the primary action; the recovery code stays masked in one copyable field. Dismissal warns until passkey enrollment succeeds or the code is acknowledged. The recovery confirmation remains a native form submission to `/api/recovery/confirm`.
- A visitor who opens `/chat` is shown the contextual message `Logg inn eller opprett en konto for å bruke chat.`. Closing the gate returns to the public wall; no chat is created merely by authenticating.

### Personal-profile projection

`GET /api/me/summary` requires the current session and returns only the caller's account projection. It supports `sort=new|top`, a bounded cursor and a page limit of 1–50. Its metrics are canonical database counts: authored posts, comments received, positive votes from other accounts on authored posts, and accepted direct/group conversations. The authored-post rows contain compact moderation status, category, score, received upvotes and comment counts; the browser can page through them without loading all content at once.

The 13 bundled examples are marked synthetic. Existing user-authored content is not replaced by automatic seeding. A prior verified selective import brought 15 historical user posts into the public database, which then held 28 posts on 2026-11-20; those counts are historical evidence, not a current count.

Public reputation is the sum of current votes by other accounts on published, nonsynthetic posts and comments authored by an active account. The automatic author upvote and preserved `base_score` do not count. Comment votes begin at zero because no historical comment-vote data existed. Hidden/review/deleted content stops contributing; restoring a post makes its surviving votes eligible again. Negative reputation is valid. The public profile API returns only `public_id`, `username`, `avatar_url`, `joined_at` and `{posts,comments,total}` reputation.

Post-specific share metadata is inserted server-side into the normal wall HTML for `/?post=<id>` and works without JavaScript. Share JPEGs use local public media and the existing category palette; no remote image URL is fetched. The cache key follows post title, body, category and media revision. The image route rechecks published status and revision, and normal metadata/image responses use `no-store`. A rendering error logs and retries after five minutes, with a safe generic image in the meantime. Cached derivatives are regenerated after restore rather than included in snapshots. See [ADR 0013](adr/0013-public-profiles-reputation-sharing.md).

## Implemented private chat behavior

### Conversations and consent

- Mobile opens one compact inbox for direct messages and groups. Desktop uses the same conversation UI in two panes. Rows show an authorized avatar, title and a 15-grapheme message preview, or `(attachment)` for an attachment-only message. Accepted groups show up to three participant avatars ordered by latest message activity; pending invites show a neutral group icon.
- Username lookup runs as the user types, using indexed candidates and fuzzy ranking. Selecting a result opens an existing conversation or a local draft; it does not send a request.
- The first Send creates one pending direct conversation, stores the initial message and issues one durable request notification. Only the sender can read pending content. The recipient accepts or declines; decline is terminal for that pair. Retry keys avoid duplicate messages and requests.
- A group builder adds and removes people before confirmation. Confirmation creates one group and one invitation per final invitee. Invitees cannot read group messages until acceptance. The creator can send immediately.
- Members can opt in to online visibility. Presence is shared with accepted conversation members and expires without a heartbeat. Blocking prevents direct contact. Notifications for requests, invitations, decisions and accepted-chat messages persist in SQLite.

| State path | Durable transition and access rule |
| --- | --- |
| Direct draft → pending | Draft exists only in the browser. First Send creates the unique user-pair conversation, pending message and one request notification. |
| Pending → accepted / declined | Only the addressed recipient decides. Acceptance adds membership and exposes pending history; decline closes the pair. |
| Group invitation → accepted / declined / cancelled | The invitee decides; a creator can cancel an outstanding invitation. Pending invitees see minimal group metadata, not messages or files. |
| Local file → uploading → staged → ready → expired | No recipient sees a staged file. The message transaction claims ordered staged files; the expiry worker removes ready bytes after seven days and leaves tombstones. |

### Attachments and live updates

- One square plus button opens photo, video and general-file choices. Selection changes only a local draft. Up to 12 files may be staged, removed and sent with optional text as **one ordered message**.
- Send uploads 4 MiB chunks into private staging, then claims the staged IDs with the message in a database transaction. Retry keys prevent duplicate final messages. Failed uploads keep the in-page draft for retry. Staged files not sent are deleted after one day.
- Consecutive messages from one sender form compact runs; each message retains its own accessible author and timestamp. A lone attachment displays without a text bubble. Two or more files form one fanned bundle opening a gallery with individual download actions. The server checks current membership for every private preview and download. Keyed transcript reconciliation retains existing media nodes when WebSocket events refresh history.
- Sent attachment bytes expire seven days after message creation. A separate worker deletes bytes permanently and retains expired metadata so the message can show a tombstone. Normal application snapshots exclude private chat bytes; restoring a snapshot does not recover attachments.
- Authenticated WebSockets announce recipient-scoped event IDs. The browser re-fetches canonical HTTP state on events and reconnect; HTTP provides history, pagination and uploads. The server checks session revocation and limits connections. A disconnected browser has a bounded reconnect delay.

**Current chat media boundary:** The general file picker accepts arbitrary formats as downloads, within configured storage and request limits. Image preview validation recognizes PNG, JPEG and WebP. Video staging probes format and enforces the 180-second duration, but the chat path has no transcoding job or generated poster derivative. Local FFmpeg/FFprobe and Docker video validation were unavailable at the last implementation check. Treat the revised issue's full video-processing and real-device capture criteria as **Proposed** until implemented and verified.

## Architecture and canonical state

| Component | Responsibility |
| --- | --- |
| `public/` | Plain browser JavaScript/CSS and static assets. UI renders API state and dispatches actions; it does not own durable policy. |
| `server/index.js` | HTTP routes, authentication/CSRF middleware, limits and response mapping. |
| `server/domain/` | Identity, posts, interactions, staff actions, chat, avatars, media, video, locations and verification rules. |
| SQLite | Canonical users, sessions, roles, posts, post/comment votes, comments, reports, media, chats, attachments, avatars, notifications, push subscriptions/outbox/deliveries, live notification events, passkey credentials/challenges/handles, ownership proofs and audit records. Migrations reach schema 21. WAL mode is used. |
| Private data directory | SQLite plus public post media, processed avatars, temporary uploads and private chat bytes. Avatar bytes are served only through a versioned route; chat bytes are outside public static paths. |
| Workers | Durable post-media processing, minute-based chat attachment cleanup and bounded Web Push delivery. |
| WebSocket channel | Live signals only; persisted messages and notifications remain authoritative. |
| Caddy | HTTPS/WSS reverse proxy in the Docker deployment. Production Node binds to loopback. |

Key API groups are `/api/session*` and `/api/me` for identity; `/api/posts*` for forum content; `/api/admin/*` for staff; `/api/chats*`, `/api/chat-uploads/*`, `/api/chat/files/*`, `/api/chat/notifications` and `/api/chat-socket` for chat. Route names and DTOs in `server/index.js` are authoritative when implementing a client.

Avatars are optional pseudonymous public images. `POST /api/me/avatar` accepts one JPEG, PNG or WebP up to 5 MiB with crop coordinates; the server validates and rotates it, strips metadata, and stores only 64 px and 256 px WebP variants. `DELETE /api/me/avatar` restores the initial-letter fallback. The authenticated user projection includes versioned avatar URLs; active-user images are readable through `/api/avatars/:id/:version/:size`. Usernames remain separate from stable avatar ownership. The existing profile explains visibility before upload. Account deletion purges the image; backups include avatar variants and checksums. See [ADR 0012](adr/0012-optional-avatars.md).

## Security, retention and operating limits

- Production requires one HTTPS public origin, loopback binding, secure HttpOnly session cookies, CSRF protection on writes, host/origin validation and rate limits. Authentication and membership are checked server-side for private data.
- Production defaults configure a 30-day session, a 2 GiB upload ceiling and a 2 GiB free-disk reserve. These are operational limits; “any file size” is not a literal unlimited-resource guarantee.
- Post media, avatar variants and database backups use checksums and WAL-safe snapshots. Private chat bytes are deliberately omitted from normal snapshots to avoid restoring expired files. Chat messages and expired-file metadata remain.
- `GET /api/live`, `/api/health` and `/api/ready` expose liveness, operational metrics and readiness. Readiness checks database, foreign keys, media paths, disk, expected schema and chat-worker freshness.
- Location geometry and optional BankID verification are disabled by the current production flags. Existing role-based staff sign-in is active. New provider-backed verification or administration flows require separate data, policy and rollout decisions.

## Deployment and evidence at this snapshot

The public PoC target is `https://hereme.46.251.249.110.nip.io/`. At **2026-11-21 11:25 CET**, read-only calls to `/api/ready` and `/api/health` returned `ok: true`; readiness reported database, foreign keys, media, disk, schema and chat worker healthy. The publicly served `chat.js` contained staged upload and WebSocket client paths. This check did **not** verify the deployed commit, authenticated WSS flow, chat video processing or current content counts.

`deploy/deploy-online.ps1` packages only a clean committed `hereme-poc` tree. It uploads a release, creates and verifies a backup, builds the Docker image, cuts over, checks public readiness and attempts rollback on failed cutover. `release/v2` is a local frozen code reference at `5d7b72d`; branch creation alone does not deploy or publish it.

Local E18 checks on 2026-11-22: **73 automated Node tests passed**, wall, chat and sharing browser flows passed, **109 JavaScript files** passed syntax checking, and `git diff --check` passed. E17 avatar browser checks at 320/390 CSS px also passed earlier. Browser captures and open device checks are listed in `docs/chat-redesign-progress.md` and `docs/E18_IMPLEMENTATION.md`. These checks do not replace a production smoke test, clone restore or real-device unfurl test.

## Known gaps and decisions to scope next

| Topic | Current state / decision needed |
| --- | --- |
| Chat video processing | Add a private, bounded media pipeline with valid preview/poster generation or explicitly narrow supported video formats. Verify the 180-second limit with FFmpeg/FFprobe and real phone capture. |
| Production chat verification | Confirm the exact deployed revision and test authenticated WSS, reconnect, private attachments and seven-day cleanup against the live stack. |
| Large-file policy | Confirm the advertised maximum size, per-message file count, storage quota and behavior at disk pressure. Current code limits a message to 12 attachments and each upload to the configured 2 GiB ceiling. |
| Durable draft policy | In-page drafts survive a failed request but are not promised to survive page reload or device change. Decide whether persistence across reload is required. |
| External capabilities | Location/map geometry, BankID, off-host backup destination and related policy need separate approvals and integration evidence. |

## Template for the next change

Add a dated section to this document or attach a replacement version containing:

1. **Outcome and affected users:** what should become possible, and for whom.
2. **Current behavior:** a reproducible example and the baseline commit/deployment being changed.
3. **Target behavior:** user flow, wireframes, accessibility, failure and recovery behavior.
4. **State and authorization:** entities, transitions, ownership, privacy, retention and limits.
5. **Interfaces:** affected UI, API, worker, operator and deployment paths.
6. **Migration and rollout:** existing data, backup/rollback, feature flags and production checks.
7. **Acceptance evidence:** tests, observable metrics and explicit open decisions.

Keep proposed behavior separate from verified behavior. After implementing a change, update this snapshot, the relevant ADR and the changelog.

## Source documents

- [Release behavior contract](release-contract.md), [release scope](release-scope.md) and [operator runbook](operator-runbook.md).
- [Release architecture](adr/0006-release-architecture.md), [staff model](adr/0008-role-based-staff-panel.md) and [chat/retention design](adr/0009-private-chat-and-retention.md).
- Latest local chat issue: **E08 / I29, “Unified private messaging: inbox, group invitations, staged attachments and real-time chat”**, including `attachment-composer-demo.html` and the supplied SVG icons. This issue is a requested contract; its unchecked acceptance items are not evidence of completion.
- Current implementation and tests under `server/`, `public/` and `tests/`.
