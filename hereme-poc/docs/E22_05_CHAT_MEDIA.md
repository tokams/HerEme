# E22-05 corrected chat media implementation

Implemented on `feature/branding` from baseline `8a9d3b6` on 2026-11-22. The authoritative visual reference is `HerEme_E22_05_Corrected_Design_References/desired/chat/index.html`. The four iPhone captures in that package are negative evidence only.

The change remains limited to chat presentation and the authorized attachment viewer. Chat APIs, membership and request consent, upload transactions, access checks, file retention and permanent seven-day deletion are unchanged.

## Reference mapping

| Evidence | Defect in the old output | Corrected behavior |
| --- | --- | --- |
| `problems/IMG_2108.jpeg` | Full timestamps and separately framed messages made one sender's activity read as unrelated cards; pointer focus left a blue frame. | One localized sender/time header precedes distinct 5 px-radius bubbles in a tight four-pixel run. Pointer focus has no persistent blue decoration and keyboard `:focus-visible` remains olive. |
| `problems/IMG_2109.jpeg` | The viewer nested a framed attachment panel inside another panel, repeated the filename and used a large text download action. | A single media item fills the available dark stage. Compact custom SVG Close/Previous/Next/Download controls, one truncated filename and one discrete index are the only chrome. |
| `problems/IMG_2110.jpeg` | Expanding attachments produced a tall file-manager page inside the transcript. | Inline expansion is capped at four 2x2 cells and 197 px. Five or more files use three previews plus `View all (N)`, which starts at item one. |
| `problems/IMG_2111.jpeg` | Repeated large bundle cards dominated the conversation. | A bundle is one 280x100-or-smaller message item with three layered faces, a concise real-type summary and an SVG disclosure chevron. |

## Approved-demo behavior retained

- Sender changes, date changes and gaps over five minutes start a new visual run; every message keeps its real DOM and storage identity.
- Received bubbles use subdued charcoal and sent bubbles restrained dark green, with Source Sans 3 and modest corner softness.
- Collapsed bundles use the approved stacked-photo/count/type language. Expansion is in place, reversible, scroll-anchored and restored after WebSocket reconciliation.
- Single media reserves a stable 4:3 presentation slot before decode. Images use `object-fit: contain`; inline bundle thumbnails use the approved cropped treatment.
- The gallery shows one protected attachment at a time and supports exact-index opening, swipe, arrows, keyboard navigation, Escape, browser Back, download, loading/error/retry, expiration, focus restoration and transcript-scroll restoration.
- The active HerEme header, avatar, invitation flow, routes, composer, theme, custom SVG family and backend policies are preserved.

## Intentional production differences from the prototype

- The prototype's unlimited three-column gallery is not copied. The later product requirement wins: mobile inline content is a bounded 2x2 preview with a separate full gallery.
- The prototype's mock files and permission-free lightbox are replaced by real MIME metadata and existing authorized preview/download endpoints.
- The production shell and one-row `+ | message | Send` composer remain the existing HerEme implementation.

## Visual evidence

Negative before evidence (not a baseline):

- `docs/screenshots/e22-05/problem-before-contact-sheet.jpg`

Approved target captures:

- `docs/screenshots/e22-05/approved-demo-collapsed-mobile.png`
- `docs/screenshots/e22-05/approved-demo-expanded-mobile.png`
- `docs/screenshots/e22-05/approved-demo-desktop.png`

New production captures:

- `docs/screenshots/e22-05/chat-bundle-320.png`
- `docs/screenshots/e22-05/chat-bundle-375.png`
- `docs/screenshots/e22-05/chat-bundle-390.png`
- `docs/screenshots/e22-05/chat-bundle-430.png`
- `docs/screenshots/e22-05/chat-bundle-desktop.png`
- `docs/screenshots/e22-05/chat-viewer.png`

Automated visual baselines live in `tests/visual/chat/`. The browser flow compares the expanded bundle and image viewer against those committed post-change baselines with bounded pixel tolerance, in addition to explicit geometry and behavior assertions.

## Validation boundary

Chromium automation covers 320/359/375/390/430 px mobile geometry, desktop geometry, sender runs, 2/4/5/8 renderer bundles, mixed image/video/file markup, exact indexes, `View all`, swipe, keyboard, Escape, browser Back, focus/scroll restoration, stable DOM reconciliation, localization and the one-row composer. A real video upload browser fixture was not added because this Windows machine has no `ffprobe`; the existing validated server video pipeline and renderer-level mixed-media checks remain intact.

Physical iPhone Safari/PWA, VoiceOver and real-device rotation were not run and remain release-device validation gates. The problem screenshots are included only as before evidence and are never used as golden baselines.
