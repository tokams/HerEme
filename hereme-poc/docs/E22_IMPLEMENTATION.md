# E22 targeted UI polish — local implementation

Implemented from the consolidated E22 issue pack on 2026-11-22. The poster wall, category treatments, two-column mobile grid, vote controls, routes, permissions and storage contracts remain unchanged.

## Delivered

- Chat sender runs now restart when the sender changes, the date changes or more than five minutes elapse. Every message keeps its own DOM and server identity.
- Messages with multiple attachments remain one message. They render as a compact collapsed stack, expand in place into an authorized mixed-media grid, fold again, and open one selected file in the existing viewer.
- Bundle contracts cover 2, 8 and the maximum 12 attachments; the browser flow sends and opens an eight-file image/file bundle. Single-video cards show duration after metadata loads.
- Existing staged multi-file upload, seven-day deletion, pending-request consent, WebSocket reconciliation, scroll anchoring, one-row composer and safe-area behavior are retained and covered by browser tests.
- Post detail Close, History, Edit, Report and Share actions use compact custom SVG controls with localized accessible names and 44 px touch targets.
- Portrait poster media and video have a bounded default stage. Poster images have an explicit full-size viewer.
- Article chapters can collapse and expand without changing field values, order, media or the E21 draft/revision payload.
- The authoring regression builds four chapters, previews two uploaded photos plus a generated WebM before publish, verifies the final field in landscape, and then publishes/reopens the real two-photo article.
- Wall and detail votes update controls without replacing the mounted poster image node. Pending author-chat requests survive browser Back/Forward.
- Wall regression checks now cover 320, 375, 390, 430, 768, 1280 and 1700 CSS px.

## Evidence

- `docs/screenshots/e22/chat-bundle.png`
- `docs/screenshots/e22/article-toolbar-desktop.png`
- `docs/screenshots/e22/detail-toolbar-mobile.png`

Automated checks cover sender/time grouping, bilingual keys, inline bundle expansion and individual viewing, stable media DOM after WebSocket and vote updates, attachment staging, pending-request history navigation, four-chapter mixed-media preview, chapter collapse state, toolbar permissions, wall geometry, landscape focus and mobile overflow. Physical iPhone PWA keyboard, VoiceOver and real-device Safari checks remain release validation tasks.

## Git note

The implementation is on `feature/branding`. The follow-up completion changes are intentionally left unstaged for review.
