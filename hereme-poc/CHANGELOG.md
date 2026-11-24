# Changelog

## 2026-11-24 — Account menu flicker

Removed an older modal animation that faded the burger menu back to transparent just as its opening transition finished. The menu now opens once, and refreshing an open panel no longer triggers that fade.

## 2026-11-24 — Community sign-up defaults

First visits now open in Norwegian Bokmål, including on browsers configured for English. Guest account prompts open on **Opprett konto**, with **Logg inn** available for returning users. Saved language preferences still apply.

## 2026-11-24 — Instance wordmark

Community pages, chat and the operator panel share the same corner wordmark. Each subdomain displays its name beneath the lettering, such as `tanteulrikkesvei` or `admin`. The main site uses the plain wordmark.

## 2026-11-24 — Community QR links

Added authenticated QR endpoints and panel cards for each managed community. Codes open the corresponding HTTPS homepage and are available on mobile and desktop layouts.

## 2026-11-24 — Verify snapshots across article upload expiry

The release verifier checks every file on a fresh snapshot copy before candidate startup. After startup it checks the original hashes again, allowing removal of the recorded files of an expired, unclaimed article upload. Drafts, posts and revision history retain their media. The failed main cutover was traced to one abandoned upload on the retained snapshot.

## 2026-11-24 — Deployment DNS preflight

Removed the Cloudflare DNS lookup from the online deployment command. The plan prints locally. Deployment verifies both communities and the platform panel over HTTPS.

## 2026-11-24 — Managed communities and operator panel

The online deploy command now migrates the observed legacy Docker project and rolls out one immutable release to two independent communities. Both have local staff panels. A separate operator MFA session provides live site status, release identity and audited registration controls at `admin.hereme.no`. Added verified snapshots, candidate checks on private copies, per-project recovery and a disposable Docker/browser deployment rehearsal. The confirmed additional hostname is `tanteulrikkesvei.hereme.no`. Follow the [deployment runbook](docs/runbooks/multi-instance.md).

## 2026-11-24 — Independent community runtime (development)

Added a shared HTTPS gateway and reusable instance stack with content-addressed app images, private worker storage, host-scoped passkeys and canonical share URLs. Added two-process isolation and restore tests and a disposable Docker rehearsal. See [M1 progress](docs/M1_PROGRESS.md) for the remaining Docker and production gates.

## 2026-11-23 — Full-screen navigation flicker

- Open and close the post detail and composer without layered backdrop/panel fades that made page-sized views appear to open twice.
- Reconcile feed cards by post identity after publishing, sorting and refreshes; when a card changes but its media URL does not, retain the decoded image element while updating the surrounding content.
- Added browser checks for immediate full-screen panels and image-node identity across composer opening and publishing.

## 2026-11-22 — Route responsiveness follow-up

- Removed the whole-screen 480 ms entry animation after reports of flicker and lag.
- Kept the current view visible until profile or post-detail data is ready; post detail now renders once, and returning to an unchanged wall reuses its post and image nodes instead of rebuilding and refetching them.

## 2026-11-22 — E23 interaction motion

- Added shared timing/easing tokens and tactile controls, keyboard press response, icon tooltips, menu entry, modal entry/exit, same-document view entry, and guarded chat message/media animations.
- Reduced-motion preferences suppress decorative movement. Existing routes, layout, data contracts and live-media identity remain intact.

## 2026-11-22 — E22-05 chat media presentation

- Replaced unbounded attachment grids with compact 2/4/5/8-file bundle presentation and a four-cell maximum inline expansion.
- Rebuilt the authorized attachment viewer as a single-item safe-area gallery with exact-index, keyboard, swipe, browser-Back, download, loading/error and focus/scroll restoration behavior.
- Preserved chat authorization, message consent, APIs and permanent seven-day file deletion; added bilingual labels, semantic timestamps, WebSocket-stable expansion and responsive browser evidence.
- Corrected the visual implementation against the approved interactive chat demo: sender-run headers now sit above softly framed bubbles, bundles use its stacked-photo/count/chevron language below the old footprint, single media reserves layout space, and approved-target plus post-change screenshots and automated visual baselines document the result.

## 2026-11-22 — E22 targeted chat, detail and editor polish

- Grouped consecutive chat messages by sender, day and five-minute continuity; added stable inline expansion for mixed attachment bundles while preserving secure individual viewing and seven-day expiry behavior.
- Added compact accessible SVG detail actions, bounded poster/video stages with full-size photo viewing, and collapsible article chapters that retain editor state.
- Kept the existing poster wall, category themes, two-column mobile grid, vote controls, routes and content contracts unchanged. Expanded responsive browser checks and added E22 review screenshots.

## 2026-11-22 — Article edit access from profile

- Added a direct Edit article action to each published article in My posts. The action opens the owner's existing private working copy. Browser smoke covers this path on the profile page.

## 2026-11-22 — E21 drafts and revision history (local worktree)

- Added additive schema 23 with idempotent legacy v1 capture, owner-only article drafts, conflict-safe publishing and poster text edits. Existing post IDs, votes, comments and media remain attached.
- Added public history, bounded line diffs, deep links and bilingual editing controls. Added moderation hiding, audited staff inspection, SQL/Git erasure and exclusive historical media purge.
- Added a private Git archive worker/volume, reconciliation, deployment archive backup and local API/browser coverage. Production restore rehearsal, physical-device checks and privacy sign-off remain open gates.

## 2026-11-22 — E20 UI refinement (local worktree)

- Installed the supplied Source Sans 3 WOFF2 with OFL notice and static server MIME support.
- Restored article-to-chat return routing for drafts, pending requests and accepted conversations; a direct chat link without a source returns to inbox.
- Shared safe Markdown and media rendering between published articles and their editor preview. Added cover/chapter media preview, draft media hydration, SVG controls and compact mobile composer layout.
- Expanded browser checks for navigation, media preview, font loading and 375/390/430px composer controls. Physical iPhone/PWA and real article video processing remain open verification gates.

## 2026-11-22 — Poster and article formats (E20, local worktree)

- Added additive schema 22 content projections. Existing posts are reshaped into full poster text while retaining their original records, relationships, votes, comments, and media.
- Added titleless poster publishing, structured Markdown articles, owned article media, two-column article cards, chapter reading, and a chapter media viewer.
- Reworked the composer, poster excerpts, compact action strip, chat and reading typography; expanded migration, API and browser checks. Source Sans 3 font files and physical iPhone verification remain open before release.

## 2026-11-22 — Mobile UI stabilization (E19)

- Keep mobile chat panes and composer aligned to the visible viewport after keyboard and zoom changes; place the attachment picker beside the message field with three labeled capture/device actions.
- Put passkey enrollment first after registration, show one masked recovery code with adjacent copy action, and warn before leaving without a saved credential. Keep the existing recovery confirmation route and account identity.
- Paint the standalone iOS status inset with the active theme color and use compact comment vote triangles with the existing vote colors and accessible tap targets.
- Extend browser coverage for chat geometry, registration, passkey enrollment and comment controls. Physical iPhone Safari and installed PWA verification remains open.

## 2026-11-22 — Sharing, public profiles and chat media alignment (E18)

- Size portrait chat images and videos to their visible media rather than a wider letterboxed box, keeping sent and received attachments against their respective transcript edges.
- Give group creation its own per-user rate bucket so unrelated chat writes cannot exhaust its creation limit.
- Add schema 21 comment votes and in-place comment controls. Public reputation sums attributable votes on eligible published content without author votes or historical base scores.
- Add guest-readable minimal public profiles with stable author links and a contextual Show profile / Start chat menu. Starting chat preserves the existing first-Send consent flow.
- Add server-rendered post link metadata and revision-checked 1200×630 share JPEGs, with canonical `hereme.no` URLs, moderation revocation and bounded fallback/retry behavior.

## 2026-11-22 — Compact chat and optional avatars (E17-01/E17-02)

- Condensed inbox and conversation headers, moved file choices into a plus-button popover, grouped consecutive sender messages, and added bare single-media cards and fanned multi-file bundles with the existing private gallery.
- Reconciled messages by stable IDs so live refreshes retain mounted media, while preserving staged Send, consent and seven-day private attachment retention.
- Added optional profile photo crop/change/removal, shared square avatars and authorized group stacks. Schema 20 stores avatar ownership; the server writes only validated, metadata-free WebP variants and includes them in verified backups.
- Added browser, API and renderer checks; physical iPhone/PWA and production-clone migration checks remain open.

## 2026-11-22 — Mobile UI stabilization (E16-01)

- Update vote controls and score in place, keeping poster media mounted and the wall stable during rapid votes and request failures. Distinguish failed images from intentional text-only posters.
- Fit mobile chat navigation, attachments and composer to narrow screens with square controls and truncating titles.
- Compact the mobile wall header, retain 44 px targets, and paint the standalone iOS status inset while scrolling.
- Add focused responsive browser checks and diagnosis notes; installed iOS Safari/PWA checks remain manual.

## 2026-11-22 — Notification icon and quick logout

- Render the notification bell inline in the header and inbox so it does not
  depend on a separate image request.
- Allow logout and notification disabling when the browser registration has no
  PushManager, and ignore a stale badge response after the account changes.

## 2026-11-22 — Language selector placement

- Kept language switching in the hamburger menu and login/registration flow.
  Removed flag controls from the header, post composer/detail, chat and policy
  pages while retaining their selected-language presentation.

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
