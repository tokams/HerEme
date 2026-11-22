# Changelog

## 2026-11-22 — Install help translation

- Translate the notification explanation inside the iPhone install sheet when
  the interface language changes.

## 2026-11-22 — Norwegian and English interface

- Added Norwegian Bokmål and English interface resources, accessible flag
  selectors, and browser-local plus account language preferences.
- Added nullable `preferred_language` migration for existing accounts and
  recipient-language notification and push presentation.
- Localized browser UI and API errors while preserving stable stored values,
  existing accounts, posts, and private messages.

## 2026-11-22 — Install notification explanation

- Explain beside the install controls and in the iPhone instructions that
  installing enables message and post-activity notifications after opt-in.

## 2026-11-22 — PWA installation entry points

- Added a mobile install button above the forum wall and an install action in
  the account menu. Chromium uses its native install prompt when available.
- Added iPhone Home Screen instructions and browser-local dismissal for 30 days.
  Installed standalone windows hide the install controls.

## 2026-11-21 — Account setup and iOS home screen

- Label the recovery credential as an innloggingskode in the account dialog and
  submit it through the existing browser password-save form after registration.
- Give the iOS standalone app an opaque status bar and safe-area spacing above
  the masthead.

## 2026-11-21 — Domain cutover recovery

- Retry public readiness during TLS startup and check the live database schema
  before automatically switching back to the previous application image.

## 2026-11-21 — Deployment environment backup permissions

- Save the private environment as an operator-owned mode-0600 sibling of the
  root-owned snapshot, before running containers or builds.
- Resolve rollback image from the live app container so retries after a failed
  build cannot mistake the newly built latest tag for the deployed version.

## 2026-11-21 — Passkey authentication

- Added optional passkey sign-in and account security enrollment with recovery
  fallback, preserving existing identities and roles.
- Production enrollment stays disabled until canonical hereme.no rollout gates.
- Documented additive storage, trust boundaries, rollback and physical-device gates.

## 2026-11-21 — Domain migration preparation

- Prepared canonical hereme.no with temporary www/legacy redirects.
- Added guarded idempotent domain-only environment updates preserving secrets.
- Deployment backs up private environment and rolls back without replacing live data.
- Live cutover blocked by public DNS resolution; Uniweb DNSSEC activation pending.

## 2026-11-21 — Live notification and device-enrollment follow-up

- Added schema 16 recipient-scoped notification events and immediate bell/inbox
  refresh over the authenticated WebSocket.
- Clarified that category preferences do not grant operating-system permission;
  device enrollment now has a distinct action and explicit permission feedback.
- Existing browser subscriptions are reconciled on startup and login, and Service
  Worker deliveries also tell open windows to refresh immediately.
- Online deployment now creates and preserves protected VAPID credentials and
  enables the push worker, fixing deployments that remained permanently disabled.

## 2026-11-21 — Optional PWA and Web Push notifications

- Added an installable PWA shell, branded icons and a root Service Worker with
  generic push display and validated same-origin click routes.
- Added schema 15 subscription ownership, category preferences, forum reply
  notifications, durable outbox/delivery state and supervised worker telemetry.
- Added per-device opt-in/off, notification settings, unified in-app inbox and
  account-safe login/logout rebinding. Production rollout defaults off pending
  real iPhone, Android and deployed HTTPS verification.

## 2026-11-21 — System specification and v2 baseline

- Added `docs/SYSTEM_SPEC.md` as a single current-behavior and change-scoping
  reference, distinguishing the code baseline, public observations and open
  implementation or validation work.
- Created `release/v2` at committed chat baseline `5d7b72d`; specification
  edits remain on `feature/chat` and are not part of that frozen branch.

## 2026-11-21 — Staged chat attachments and live delivery

- Added schema 14 with ordered attachment metadata, private staging and a
  durable chat event log. File selection stays local until Send; one message
  can contain optional text and multiple ordered files.
- Added three supplied SVG picker icons, a removable draft tray, private image
  and video previews, bundle viewer, resumable upload status and retry-safe
  message finalization.
- Added authenticated, recipient-scoped WebSocket updates with session
  revocation checks and HTTP history sync after reconnect. Caddy already
  forwards upgrades through the existing reverse proxy.
- Expanded API and browser coverage for staging, privacy, idempotency and live
  delivery.

## 2026-11-21 — Unified chat interface and pending-message flow

- Rebuilt Chat around the supplied mobile inbox and desktop two-pane wireframes,
  with shared SVG chat icons, 15-grapheme previews, live username suggestions,
  editable group selection and full-screen mobile conversations.
- Added schema 13 for pending direct conversations, idempotent sends and durable
  request, invitation, decision and message notifications. Search uses indexed
  candidates and Levenshtein ranking. The first message creates one request;
  recipients see content only after acceptance.
- Added focused API and browser coverage for consent, reciprocal contact,
  notifications, group selection, responsive navigation and attachment preview.

## 2026-11-21 — Private chat and repeatable public deployment

- Corrected the deployment backup verifier to mount snapshots writable while
  SQLite opens its read-only database connection; SQLite may need a temporary
  shared-memory sidecar. The failed first attempt stopped before cutover.

- Added username discovery, consent-based direct messages, invited groups,
  opt-in online presence, private file sharing with resumable chunk uploads,
  and server-enforced membership and blocking.
- Added schema 12 and a minute-based cleanup worker. Files expire after seven
  days; incomplete uploads expire after one day. Chat bytes are excluded from
  application backups and missing files become tombstones after restore.
- Added a Windows PowerShell deployment script for the existing Docker host
  with a verified snapshot and failed-cutover rollback, plus ADR 0009 and
  operator instructions.

## 2026-11-20 — Role-based staff control and historical user content

- Added authenticated moderator and administrator panels over canonical domain
  services. Moderators can reversibly censor whole posts; administrators can
  edit displayed content and scores, delete comment subtrees and posts, and
  delete users while explicitly preserving/anonymizing or deleting their posts.
- Added explicit `admin` capabilities, CSRF-protected staff APIs, mandatory
  reasons, audit events, last-admin/self-deletion protections and permanent media
  cleanup for destructive post operations.
- Added local one-time staff provisioning and stored the generated admin and
  moderator recovery credentials outside Git in the project `secrets` folder.
- Added a backed-up, repeatable selective import for user-authored historical
  posts. The local data set gained 8 missing posts, 4 users, 15 votes, 8 comments
  and 8 uploads; synthetic/demo-only content was not imported.
- Added schema 11 and ADR 0008; extended API and migration contracts for staff
  authorization, censorship, content edits, deletion choices and idempotent
  historical import.

## 2026-11-20 — Deployed image and video media

- Reworked **+** into a three-choice entry screen for **Bare innlegg**,
  **Bildeplakat** and **Videoplakat**. Each choice now has a focused first action
  and one small finish step for title, poster style and optional reflection.
- Allowed canonical immutable `/media/<uuid>/display|thumbnail` image paths in
  the poster renderer while continuing to reject arbitrary and traversal URLs.
- Completed the Docker video path with FFmpeg/FFprobe, the durable media worker,
  shared persistent storage and the production video feature flag.
- Replaced the custom in-page recorder with the device-native video capture
  interface and normalized codec-qualified and common mobile video MIME types.
- Anchored each video duration chip to its own card media button so it remains
  within the card at every wall layout and viewport width.
- Moved the public PoC from its inconsistently reachable `sslip.io` hostname to
  `hereme.46.251.249.110.nip.io`, retaining the existing application data and
  issuing a new automatically renewed HTTPS certificate.

## 2026-11-19 — Isolated Docker deployment

- Added a production Node 24 image and Compose deployment that keeps the app on
  loopback in a shared network namespace with Caddy, publishes only HTTP/HTTPS,
  persists application and certificate state, gates proxy startup on readiness
  and restarts both services unless explicitly stopped.
- Deployed a fresh instance without migrating users or live data. The supplied
  demonstration seed remains the only initial content.

## 2026-11-19 — Account-first mobile menu

- The burger menu now opens directly on account state. Signed-in users see their
  pseudonym, recovery-key rotation and logout without another profile step.
- Anonymous visitors see the recovery login form immediately and a prominent
  create-pseudonym action, with password-manager autofill metadata retained.

## 2026-11-19 — Recovery credential save and autofill

- Replaced the copy-only recovery screen with a prefilled username/new-password
  form and validated native POST/redirect so browser and mobile password managers
  can offer to save the generated credential. Returning recovery login now exposes
  standard username/current-password autofill metadata.
- Added reveal plus clipboard, selection-copy and manual-prompt fallbacks. The
  server confirms the key against its existing scrypt hash and never stores or
  logs the plaintext credential.

## 2026-11-19 — Public-release architecture and optional capability boundaries

- Added secure pseudonym recovery and browser sessions, canonical domain services,
  stable APIs, indexed pagination/search, audited private moderation and account
  lifecycle operations while preserving and upgrading legacy identities.
- Added server-decoded immutable image storage with display/thumbnail derivatives,
  durable resumable video upload/worker states, native playback and explicit
  location/verification feature boundaries that remain disabled by default.
- Added schema 6–10 migrations, cross-instance media-aware merging, checksummed
  backup/restore, production config validation, systemd/Caddy deployment, health
  checks, threat model, policies, runbooks, CI and a truthful go/no-go gate.
- Validated source syntax, 27 automated contracts and an isolated Chromium flow at
  350/390/700/900/1280/1700 widths. External VM, DNS/TLS, cellular, off-host backup,
  licensed Norway geometry and BankID-provider evidence remain operator gates.

## 2026-11-18 — Square wall v3 and desktop display choices

- Applied supplied v3 square geometry, muted category palettes, gradients, badges
  and SVG vote controls. Bundled fixed Cascadia Code with its OFL notice.
- Added default Simple desktop wall with visible category icon buttons and 10px
  gaps; Advanced provides shared filters and database-backed discussion panels.
- Added persisted desktop layout and light/dark preferences, shared search/sort,
  and responsive mobile detail/composition using the same canonical post state.
- Migration 5 persists bounded text placement without changing existing posts,
  crop/category choices, votes, comments, reports or media. Original demo posters
  remain accessible while source photos use the new template.
- Validated 25 unit/API/migration tests and isolated browser interactions and
  screenshots; checked all pre-v3 rows and uploads against the retained snapshot.

## 2026-11-18 — Category wall, second iteration

- Replaced newspaper, room navigation and directories with one dense tile wall
  shared by mobile and desktop, five category checkboxes and one create action.
- Added five fixed theme definitions, shared poster surfaces and uniform tile
  headers, 44px green/red voting controls, scores and comment counts.
- Moved reports and sharing into focused detail, full-screen on mobile, with
  reduced-motion support, keyboard containment and preserved scroll position.
- Simplified composition to category/title/optional photo/body/link; no-image
  posters are first-class. Desktop has bounded crop controls within fixed styles.
- Migration 4 preserves every legacy row, makes rooms optional for new posts,
  and stores canonical category/crop metadata. Repeat merges map later source
  posts and retain roomless preview content and its selected design.
- Seed examples now span all five categories through explicit import-key mappings.
- Supersedes the first iteration's newspaper and flexible canvas poster editor.

## 2026-11-18 — Poster wall and community newspaper

- Replaced the sidebar feed with an editorial desktop front page and compact mobile
  photo/poster wall, distinct text/link items, room identities and a footer LAN QR.
- Imported the user's 13-post seed pack, preserving all 14 original posts and every
  pre-import row in users, rooms, posts, votes, comments and reports. Import is
  explicit/idempotent for existing databases; fresh databases seed once.
- Added visible synthetic-demo disclosure, optional poster source metadata and
  a new-variant flow that retains the demo label without changing the original.
- Added camera/library pickers, headline fitting, contrast, typography, position,
  alignment, zoom/pan and aspect controls; composed posters use the existing API.
- Added canonical room joins, full-image details, detail voting and reporting,
  keyboard modal containment and visible feed errors with retry.
- Added additive migrations for display/import metadata, room membership and
  atomic negative-ID allocation. New posts start at net +1; old scores are unchanged.
- The supplied seed pack supersedes the earlier blocked image-generation attempt.
- Verified 20 automated tests and isolated Chromium desktop/mobile interactions,
  screenshots and restart persistence. Final merge retains all 51 original rows,
  six uploaded images and 13 additional examples; see docs/validation.md.

## 2026-11-18 — Regular launcher and image tooling

- The worktree's regular run.cmd now selects preview storage and starts at 3001.
  Occupied ports advance automatically, with at most 20 bind attempts. URLs and QR
  codes use the actual listening port. Original checkout remains unchanged.
- Installed image-generation dependencies in an ignored local .venv; authored
  nine reproducible photo prompts. API generation was blocked by zero account
  credits, so no generated photos or new frontend are claimed complete.

## 2026-11-18 — Preview and migration preparation

- Added a port-3001 preview launcher and configurable isolated data directory.
- Added verified, non-overwriting online snapshots of SQLite and uploaded media.
- Added a transactional, repeatable merge retaining real writes from both instances,
  with durable source tracking, separate ID ranges, conflict reports and backups.
- Existing empty databases no longer receive automatic seeds. Removed silent feed
  truncation and ordered chronologically so imported and new posts remain reachable.
- Fixed LAN address selection so Wi-Fi precedes virtual Ethernet adapters.
- Isolated API tests and added migration coverage using the legacy database schema.
- At this preparatory stage the redesign was pending content; the user later
  supplied the seed pack used by the completed presentation implementation above.
