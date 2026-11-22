# E22-05 chat media presentation

Implemented on `feature/branding` on 2026-11-22. The change is limited to chat message presentation and the authorized attachment viewer. Chat APIs, access checks, message-request consent, upload behavior, file retention and permanent seven-day deletion are unchanged.

## Root causes and corrections

- The expanded bundle rendered every attachment, so an eight-file message became a long media wall. The renderer now exposes at most four cells in two rows; five or more files use three previews and a localized `+N / View all` cell while the viewer retains the complete ordered file list.
- The collapsed card used a wide fan and did not have a strict height contract. It now uses a 100–135 px compact card, up to three mildly rotated faces, and localized count/type metadata.
- The viewer rendered one large panel per file and repeated filenames. It now renders exactly one selected item, one filename, an `index / count`, custom SVG Close/Previous/Next/Download controls, contained image/video media, and a concise file/expired/error state.
- Bundle expansion lived only in the current DOM. Expansion is now canonical client state keyed by conversation and message, and is reapplied after incremental WebSocket reconciliation without remounting unchanged media.
- Pointer activation inherited the browser's persistent blue outline. Attachment controls now suppress pointer focus decoration while retaining a clearly visible olive `:focus-visible` outline for keyboard users.

## Behavior covered

- 1 image, 2/4/5/8 attachment presentation, mixed media and expired attachment states.
- Exact tapped index, arrow buttons, keyboard arrows, swipe navigation, boundary-disabled controls, download of the selected authorized file and retry after preview failure.
- Native video controls without autoplay; non-previewable files remain downloadable.
- Escape, Close and browser Back close the viewer; transcript scroll and trigger focus are restored.
- Human-readable run timestamps use semantic `<time datetime>` markup and sender runs retain one visible header.
- Norwegian and English viewer labels have matching keys and parameters.
- 320, 359, 375, 390 and 430 px mobile geometry plus desktop geometry are exercised without horizontal overflow.

## Evidence

- `docs/screenshots/e22-05/chat-bundle.png`
- `docs/screenshots/e22-05/chat-viewer.png`
- `docs/screenshots/e22-05/chat-conversation.png`
- `docs/screenshots/e22-05/chat-desktop.png`
- `docs/screenshots/e22-05/chat-mobile.png`

The automated browser evidence uses Chromium and cannot substitute for the issue's physical iPhone Safari/PWA, VoiceOver or real-device rotation checks. Those remain release-device validation gates; safe-area, focus, browser Back, reduced-motion CSS and responsive-width contracts are implemented and locally exercised where automation can represent them honestly.
