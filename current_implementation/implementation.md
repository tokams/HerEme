# HerEme — current implementation

Discussion baseline for a future backend, frontend and visual redesign.
Captured 2026-11-18 from the **working files** in `feat/local-poster-wall` at
`.worktrees/poster-wall/hereme-poc`. Branch HEAD is
`b6856d60e19b08ad58effd90aa3b238fe31b7389`; the implementation described here
includes its **uncommitted and untracked feature changes**, not just that commit.
This describes existing behavior, not an approved future architecture.

Open [wireframes.html](wireframes.html) directly in a browser. It is one offline,
static HTML file showing mobile, Simple desktop, Advanced desktop, detail and
creation. All content is placeholder text; controls are illustrations. Grayscale
is used to make structure easy to discuss. The actual application uses the
colors described below. Wireframe labels are English; the app UI is Norwegian.

## 1. What the product currently does

HerEme is a local community poster wall. Everyone browses the same stream of
published posts. Five categories also determine the visual template:
**Question, Opinion, Story, Alert and Tip**. Categories can be selected together;
all begin selected, and selecting none produces an explicit empty state.

Posts can contain a title, optional body, optional photo and optional link. The
database retains text/link/image/poster types. The new composer creates text,
link or image posts; older finished poster images remain supported. Posts without
photos get a complete category-themed poster face. There is no room selection
in the current UI, although historical rooms and their API remain in the backend.

Readers can open posts and share their links. A nickname profile is required to
publish, vote, comment, reply or report. Clicking the same vote again removes it;
the opposite vote replaces it. New posts receive the author's initial upvote.
Replies support four levels including the root comment. Reporting is only in
detail. Three distinct unresolved reports move a post into review. A separate
PIN-protected moderator screen can publish, hide or dismiss reports.

## 2. Screens and interactions

| Surface | Current components and behavior |
| --- | --- |
| Desktop Simple — default | Brand, search, sort, create, profile/menu; Simple/Advanced and light/dark controls; five clearly visible category icon buttons with labels; post count; three-column wall with 10px gaps; no sidebars. |
| Desktop Advanced | Same actions and post data; an extra utility strip; left navigation and category checkboxes/descriptions, central tightly joined wall, right discussion/recent-comment panel. |
| Mobile | Compact brand/filter/create/menu header; category filters collapsed initially; almost edge-to-edge wall, usually two columns; no sidebars, persistent search, sort or desktop display controls. |
| Open post | Poster, title, author/time/category, body/link, votes, comments and reply composer. Close/share/report in the toolbar. Wide two-column desktop overlay; full-screen vertically stacked mobile sheet. |
| Create post | Category, title, optional photo/camera input, body, link and live preview. Desktop additionally exposes crop zoom/pan and auto/top/center/bottom title placement. No font selector. |
| Other dialogs | Nickname/profile, local address and QR code, report reason, moderator login/queue. |

Switching Simple/Advanced preserves current categories/search/sort. Layout and
light/dark choices persist in localStorage. Categories/search/sort are transient
browser state, so a fresh load restores all categories and newest-first sorting.
Closing detail preserves the wall scroll position and category selection. Sharing
uses `/?post=<id>`, native sharing when available, then clipboard or a copy prompt.
Keyboard focus is contained in dialogs; Escape closes them; reduced-motion is
respected. Wall voting does not open the post.

Responsive behavior: below 1280px Advanced hides the right panel; below 900px the
left panel collapses and desktop display controls disappear. Below 700px the
minimal mobile header and two-column wall apply. Below 359px the wall is one
column. Advanced uses four columns on screens at least 1700px wide; Simple stays
at three within a centered maximum-width container. The wall uses CSS columns,
so its reading order runs down each column, rather than row by row.

## 3. Current visual design

The supplied Square Wall Design Kit v3 HTML/CSS and SVG icons define the style.
The kit's older neon preview images do not match its final muted source palette.
**Cascadia Code is fixed**, locally bundled with its license, throughout the app.

- Square corners, black borders, dense modular poster surfaces.
- A compact category/time strip with a category-colored top rule.
- A photo or themed background, category badge at the upper right, uppercase
  bold headline and short accent bar. Photo headlines have a strong bottom-up
  category-tinted gradient behind them.
- Photo faces have height/width **1.12**; image-free faces are square. Header and
  action strip sit outside that face. Baked legacy posters keep their image intact.
- Bottom actions always read **UP / DOWN / SCORE / COMMENTS**. Green/red square
  vote icons have at least 44px targets. Report is absent from wall tiles.
- Simple desktop separates tiles by 10px. Advanced and mobile tiles touch, with
  adjacent black borders providing separation.

| Theme | Accent | Deep background |
| --- | --- | --- |
| Question / Spørsmål | `#719ad2` | `#294267` |
| Opinion / Mening | `#bb80ad` | `#623854` |
| Story / Historie | `#b4a36b` | `#595039` |
| Alert / Varsel | `#cb8177` | `#713d3e` |
| Tip / Tips | `#6fb4a1` | `#2e5e54` |

Dark is the initial theme: page `#0f1113`, panel `#171a1d`, text `#eceae3`,
accent `#96b36a`. Light uses page `#f2f1eb`, panel `#fafaf6`, text `#202724`,
accent `#b5cb91`. Shell, inputs, dialogs and tile chrome change with theme;
poster artwork retains its category palette and white headlines. A saved theme
also affects mobile, although the theme control is only visible on desktop.

## 4. Frontend structure and state

Plain HTML/CSS and browser JavaScript; no UI framework, bundler or TypeScript.
Modules expose shared browser globals; several also support CommonJS for reuse
and tests. `index.html` loads them in order.

| File under `public/` | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Shell, responsive layouts, display modes, visual rules. |
| `themes.js`, `icons.js` | Five immutable category definitions and supplied SVG icon map. The server also imports the theme definitions. |
| `poster.js` | Shared poster rendering, image crop presentation and title fitting for wall, preview and detail. |
| `feed.js` | Cards, headers, vote/comment controls and both category-filter presentations. |
| `shell.js` | Discussion/recent-comment sidebar rendering. |
| `compose.js`, `detail.js` | Composer and post/comment markup. |
| `preferences.js` | Apply stored layout/theme before the first paint. |
| `app.js` | Central mutable UI state, requests, delegated events, dialogs, focus, image preparation and workflow coordination. |

SQLite is authoritative for posts, design metadata, votes, comments and
moderation. Browser state holds current projections, selections, drafts, dialog
state and pending requests. The bearer token and display choices are in
localStorage; the moderator PIN is in sessionStorage. There is no offline write
queue, service worker, realtime subscription or cross-tab synchronization.
The browser fetches the wall and activity separately and refreshes them after
relevant actions. Rendering replaces sections of markup rather than using a
virtual DOM. A vote updates the local post projection without rerunning ranking.

## 5. Backend and interfaces

One Node.js **24+** process serves static files, uploads and JSON/multipart HTTP
endpoints. SQLite uses Node's built-in synchronous `node:sqlite`, WAL mode and
foreign keys. There are no runtime npm dependencies. Playwright is a development
dependency. `mini-web.js`, `mini-upload.js` and `qr.js` are local implementations;
the Express/Multer-like variable names do **not** mean those packages are used.

`server/index.js` owns HTTP routes, authentication, most SQL, validation and
business transitions. `post-design.js` owns category/crop/placement validation;
`activity.js` derives discussion summaries; `db.js`/`migrations.js` own storage
initialization and schema changes; `config.js`/`listen.js` own startup policy.
There is not yet a separate typed domain-action layer shared by HTTP and CLI.
Operator scripts import storage helpers and implement snapshot/merge/seed work.

| Interface | Current purpose |
| --- | --- |
| `GET /api/posts` | Published wall; `categories`, `q`, `sort` and legacy `room` query parameters. UI sends `new` initially; API defaults to `hot` if sort is omitted/unknown. |
| `GET /api/categories`, `/api/activity` | Theme catalog; discussion summaries, recent comments and totals using the same published category/search projection. |
| `GET /api/posts/:id`, `/api/posts/:id/comments` | Published post and its flat comment list, with parent/depth metadata. |
| `POST /api/posts` | Authenticated creation, including optional multipart image and canonical design metadata. |
| `POST /api/posts/:id/vote`, `/comments`, `/report` | Authenticated interactions and moderation threshold. |
| `POST /api/session`, `GET /api/me` | Create nickname identity and retrieve current identity. |
| `GET /api/admin/queue`, `POST /api/admin/posts/:id` | PIN-gated moderation. |
| `GET /api/health`, `/api/meta`, `/api/connect-qr.svg` | Process response, current connection information and QR. Health is a minimal response, not a comprehensive readiness probe. |
| `/api/rooms` and `/api/rooms/:id/membership` | Historical room listing/creation/membership retained; unused by the new UI. |

Wall queries load all published posts, then filter/search/rank in JavaScript.
Activity reads published comments and filters them to selected posts. No
pagination or dedicated search index is implemented. Counts and score aggregates
are derived by SQL; score includes retained historical/demo base scores.

Nickname login creates a UUID and random bearer token; only its SHA-256 hash is
stored server-side. There is no password, verified identity, token-expiry flow,
account recovery or role system. Moderation uses a shared demo PIN. These are
current local-demo constraints to revisit, not production security guarantees.

## 6. Data model, images and migrations

| Storage | Purpose |
| --- | --- |
| `users` | UUID, nickname, token hash and creation time. |
| `posts` | Type, author, title/body/link/image URL, historical base score, status, timestamp and nullable historical room reference. |
| `post_design` | One category and bounded zoom/x/y/text placement per post; `poster_style` in API projections equals category. |
| `votes` | One +1/-1 entry per post/user; removing the row is an unvote. |
| `comments` | Post, author, optional parent, body, depth and timestamp. |
| `reports` | Post/user/reason and resolved state; one report per post/user. |
| `rooms`, `room_memberships` | Preserved historical organization. New UI posts have `room_id = NULL`. |
| `post_presentation`, `hereme_demo_imports` | Synthetic label/source metadata and idempotent seed keys. |
| `schema_migrations`, `migration_source`, `local_sequences` | Schema version, imported source baseline and preview identity allocation. |
| `uploads/`, `public/assets/demo/` | User media files and bundled synthetic example assets; SQLite stores references. |

Schema version is **5**. Version 4 made room references optional and introduced
category/crop metadata; version 5 added auto/top/center/bottom text placement.
Creation stores post, design and initial vote in a transaction. Uploaded files
are written before that transaction and removed if it fails.

The browser accepts images up to 25 MB, decodes them, resizes the longest edge to
at most 1600px and exports JPEG at quality 0.86. The server accepts one image up
to 8 MB, checks JPEG/PNG/WebP signatures and saves a UUID-named file. Crop and
title styling are presentation metadata, not burned into new uploads. The
browser's size/conversion behavior is not a server-side image-processing pipeline.

Thirteen synthetic seed examples cover poster/photo/text/link content and all
five categories. Synthetic posters with source photos use the current template
while detail links to the preserved finished original. Real baked posters remain
intact. Existing databases are never automatically reseeded; explicit seeding
is idempotent. Exact live post counts are intentionally omitted from this baseline
because users continue creating content.

## 7. Local operation and preservation contract

The original checkout and feature worktree use separate SQLite/uploads directories.
Original defaults to `data/` and port 3000; worktree defaults to `data/preview/`
and port 3001. An occupied port advances within a bounded 20-port search. Actual
port determines the displayed URL and QR. Worktree startup expects an existing
snapshot rather than silently creating an empty replacement preview.

Online snapshots include committed WAL data and media. A manual three-way merge
combines the original's later writes with independent preview writes against the
previous baseline. The original keeps positive IDs; new preview integer IDs are
negative; users use UUIDs. Relationships are preserved. Conflicting edits and
media collisions fail visibly; pre-merge and incoming backups are retained.
This supports two writing origins and is **not continuous synchronization**.
Before cutover, stop original writes and perform a final merge into the preview.

The previous implementation validation recorded 25 passing unit/API/migration
tests plus isolated browser checks for responsive layout, display preferences,
filters, composition, voting, comments, moderation and persistence. This document
was checked against source; it does not represent a new full application test run.
Physical camera and access from another device over Wi-Fi remain manual checks.

## 8. Questions for the redesign discussion

These are discussion prompts, not new requirements or implemented changes.

1. What is the intended deployment scale: one local instance, hosted community,
   or several sites? That determines identity, storage and synchronization needs.
2. Should a domain-action/service boundary own validation and transitions across
   HTTP and operator tools? How should browser projections be defined/versioned?
3. Which authentication, roles, moderation history and recovery flows are needed?
4. When should pagination, indexed search, caching and live updates replace the
   current full-wall fetch and in-memory ranking?
5. Should image normalization, validation, variants and storage lifecycle move to
   a server/media service? Which original bytes and historical poster forms stay?
6. Are CSS column reading order, tile proportions, Simple/Advanced modes and
   permanent desktop category buttons the right information hierarchy?
7. Which visual choices are fixed identity (Cascadia Code, five categories) and
   which are open (density, palette, navigation, detail and creation layouts)?
8. How and when should the two-instance migration end, and which historical room
   endpoints/data should remain after cutover?

## Source pointers

All paths below refer to the inspected feature worktree, not the original app.

- [HTTP routes and transitions](../.worktrees/poster-wall/hereme-poc/server/index.js)
- [Database](../.worktrees/poster-wall/hereme-poc/server/db.js) and [migrations](../.worktrees/poster-wall/hereme-poc/server/migrations.js)
- [Browser coordinator](../.worktrees/poster-wall/hereme-poc/public/app.js) and [styles](../.worktrees/poster-wall/hereme-poc/public/styles.css)
- [Design specification and screenshot links](../.worktrees/poster-wall/hereme-poc/docs/wall-v3.md)
- [Migration runbook](../.worktrees/poster-wall/hereme-poc/docs/migration.md)
- [Recorded validation](../.worktrees/poster-wall/hereme-poc/docs/validation.md)
