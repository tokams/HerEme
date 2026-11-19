# Poster wall — implemented design specification

Historical v2 specification. Superseded by [Square wall v3](wall-v3.md).

The second iteration opens directly onto the wall on both phone and desktop.
The entire primary surface is a compact header, category checkboxes and a regular
grid. No room browsing, editorial lead, discussion sidebar or multi-option create
strip remains. Posting is one action in the header. Local connection details,
the profile and moderation remain secondary surfaces.

## Screen references

These are captures of the implemented UI using the supplied examples in an
isolated test database, not hypothetical layouts:

- [Desktop wall](screenshots/wall-v2/desktop-wall.png)
- [Mobile wall](screenshots/wall-v2/mobile-wall.png)
- [Mobile full-screen detail](screenshots/wall-v2/mobile-detail.png)
- [Mobile threaded discussion](screenshots/wall-v2/mobile-comments.png)
- [Desktop composer without a photo](screenshots/wall-v2/desktop-create-text.png)
- [Desktop composer with crop controls](screenshots/wall-v2/desktop-create-photo.png)
- [Mobile composer](screenshots/wall-v2/mobile-create.png)
- [Long, unbroken headline](screenshots/wall-v2/long-title.png)

## Five reusable themes

| Category / API key | Accent / background | Preset treatment |
|---|---|---|
| Spørsmål / question | #285d83 / #e5eff4 | Question motif, soft outlined frame; clear sans headline over photos |
| Mening / opinion | #8d4939 / #f2e1d8 | Oversized quote motif and expressive italic serif |
| Historie / story | #365b50 / #e7e9dd | Signature green, quiet star motif and serif headline |
| Varsel / alert | #a43b27 / #fae5d4 | Emphasis band, exclamation motif and strong uppercase headline |
| Tips / tip | #536027 / #edf0cf | Green/gold accent, circular arrow motif and friendly serif |

Templates are fixed; choosing a category selects its style. New image posters use
a dark scrim for contrast. Headline density adapts to length and available space.
No-image posters use the category background as their intended face. Existing
baked poster photos keep their own text without another overlay.

## Layout and interaction

The header contains the brand, one publish action, profile and menu. All category
checkboxes start enabled. Selection is a union: question + alert shows both.
Selecting none shows a clear empty state with a restore-all action.

Each bordered tile contains the same header, poster button and action strip.
Green upvote and red downvote targets are 44 × 44 CSS pixels, with the net score
between them and a comment-count button. Report/share/author/body are not wall
controls. The layout uses one column below 360px, two on typical phones, three
on tablets, four on desktops and five on wide screens.

Opening a tile preserves the wall's scroll position and brings up one focused
detail view. It fills the phone viewport. Close, Share and subtle Report remain
in a pinned top toolbar; the poster, votes, metadata, body/link and comments scroll
below. Desktop uses the same content in a two-column modal. Focus stays in the
dialog, Escape closes it, the background is inert, and reduced-motion disables
the short opening transition. Sharing uses the native sheet, clipboard or an
explicit copyable URL when HTTP LAN browser permissions require it.

The composer guides category → title → optional photo → optional body/link →
preview → publish. Camera/library selection and image-free posting both work.
Desktop adds an expandable bounded crop panel; font, palette and layout remain
fixed by the template. No room, format tab or free-style editor is required.

## Component plan and implementation

| Component | Owner | Responsibility |
|---|---|---|
| Theme catalog | public/themes.js | Five immutable definitions shared with server |
| PosterSurface / preview | public/poster.js | Safe media, title, theme, crop, bounded text fitting |
| PosterTile/Header/Actions | public/feed.js | Uniform anatomy and vote/comment affordances |
| CategoryFilterBar | public/feed.js | Accessible independent category checkboxes |
| PosterWall | public/app.js + styles.css | Canonical API projection, responsive repeated grid |
| PosterComposer | public/compose.js | Guided fields and shared theme preview |
| PosterDetail / comments | public/detail.js | Same poster surface, metadata and threaded discussion |
| Action dispatcher | public/app.js | API requests, pending actions, view/focus lifecycle |
| Canonical design policy | server/post-design.js | Validation, legacy mapping and persisted crop/category |
| Migration / merge | server/migrations.js, scripts/merge-data.js | Preserve records and consolidate both origins |

Implementation followed four stages: canonical mapping and migration, common
tile/filter/surface modules, focused detail/composer, then preservation and browser
verification. The migration decision and constraints are in [ADR 0004](adr/0004-category-poster-wall.md).

## Acceptance coverage

| Contract | Evidence |
|---|---|
| Wall-first; no room/report wall actions | Browser asserts first tile position and absent actions |
| Exactly five coherent presets; no-image posters | Theme/unit tests, seed coverage and real composer flow |
| Multi-select filters, including none | API and browser tests |
| Shared anatomy, easy voting | Unit tests and browser target-size checks |
| Mobile full-screen close/share/report/comments | Browser bounds, clipboard, moderation queue and threaded reply checks |
| Same desktop identity; limited extra composition | Wall/composer captures and persisted crop assertions |
| Legacy records and later writes survive | Frozen-schema migration, repeat merge and nullable-room tests |
| Responsive/accessibility/long text | 320/390/768/1440 viewports, keyboard/reduced-motion and long-title fitting |
| Durable categories, crop and participation | API assertions and browser server-restart check |

Physical phone camera capture and another device's Wi-Fi/firewall reachability
still require checks on that hardware. The automated browser uses real local file
upload and an isolated backend; it never touches either running forum's data.
