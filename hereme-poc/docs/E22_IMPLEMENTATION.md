# E22 targeted UI polish — local implementation

Implemented from the consolidated E22 issue pack on 2026-11-22. The poster wall, category treatments, two-column mobile grid, vote controls, routes, permissions and storage contracts remain unchanged.

## Delivered

- Chat sender runs now restart when the sender changes, the date changes or more than five minutes elapse. Every message keeps its own DOM and server identity.
- Messages with multiple attachments remain one message. They render as a compact collapsed stack, expand in place into an authorized mixed-media grid, fold again, and open one selected file in the existing viewer.
- Bundle contracts cover 2, 8 and the maximum 12 attachments; the browser flow sends and opens an eight-file image/file bundle. Single-video cards show duration after metadata loads.
- Existing staged multi-file upload, seven-day deletion, pending-request consent, WebSocket reconciliation, scroll anchoring, one-row composer and safe-area behavior are retained and covered by browser tests.
- Loading older chat history now anchors the exact mounted message and lets native scroll anchoring absorb late media dimensions, preserving both DOM identity and the visible reading position.
- Post detail Close, History, Edit, Report and Share actions use compact custom SVG controls with localized accessible names and 44 px touch targets.
- Portrait poster media and video have a bounded default stage. Poster images have an explicit full-size viewer.
- Article chapters can collapse and expand without changing field values, order, media or the E21 draft/revision payload.
- The authoring regression builds four chapters, previews two uploaded photos plus a generated WebM before publish, verifies the final field in landscape, and then publishes/reopens the real two-photo article.
- Wall and detail votes update controls without replacing the mounted poster image node. Pending author-chat requests survive browser Back/Forward.
- Vote regression also keeps an actively playing generated WebM mounted, playing and advancing instead of restarting.
- Compose/detail modals track `visualViewport` height and offset on mobile, keeping the final editor field and footer above a keyboard-sized viewport and restoring full height after dismissal.
- Wall regression checks now cover 320, 375, 390, 430, 768, 1280 and 1700 CSS px.

## Evidence

- `docs/screenshots/e22/chat-bundle.png`
- `docs/screenshots/e22/article-toolbar-desktop.png`
- `docs/screenshots/e22/detail-toolbar-mobile.png`

Automated checks cover three-message sender runs and time/day boundaries; 1/2/8/12, mixed, expired and broken attachments; inline expansion, individual viewing, secure expiry rendering and upload staging; stable media DOM after pagination, WebSocket and vote updates; active video playback; keyboard-sized chat and editor viewports; pending-request history navigation; four-chapter mixed-media preview; chapter collapse/reorder/remove; bilingual SVG actions; toolbar permissions; wall geometry; landscape focus; and mobile overflow.

## Issue completion map

- **E22-01:** grouping, mixed bundles, single media, staging, secure expiry, incremental reconciliation, pagination anchoring, pending-chat navigation, composer keyboard/zoom sizing and both chat types are implemented and exercised.
- **E22-02:** the established wall remains unchanged; responsive two-column/article-span geometry, stable vote updates, active playback, bounded/full-size media, deep-link navigation and comment behavior are exercised.
- **E22-03:** real object-URL previews, cleanup, four chapters, two photos plus generated video, collapse/reorder/remove, draft reopen, mobile density, landscape and keyboard-sized viewport behavior are exercised.
- **E22-04:** detail, modal, media-viewer, reply and chapter controls use the existing custom SVG family with localized names, focus behavior and 44 px targets; History/Edit permissions and actions, Report, Share and deep-link Close remain intact.

Physical iPhone PWA, VoiceOver and real-device Safari runs remain release-device validation because they cannot be emulated truthfully in the local Windows browser runner. The corresponding keyboard, safe-area, focus, zoom, localization and screen-size contracts are automated here.

## Git note

The implementation is on `feature/branding`. The follow-up completion changes are intentionally left unstaged for review.
