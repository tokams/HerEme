# Changelog

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
