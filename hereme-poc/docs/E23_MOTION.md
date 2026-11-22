# E23 interaction motion

Implemented on `feature/branding` from `82d270d`. `public/motion.css` owns the timing and easing tokens. `public/motion.js` supplies keyboard press feedback, lazily exposes accessible icon tooltips, and starts one-shot entry animations. Existing wall and chat logic calls the helper only at user-visible state changes.

| Interaction | Timing | Rule |
| --- | --- | --- |
| Enabled button/link press and release | 90 / 160 ms | Slight scale and one-pixel travel; disabled controls stay still. Keyboard Space/Enter receives the same feedback. |
| Hover, focus and icon tooltip | 160 / 180 ms | Border/color change and a small anchored tooltip on hover-capable devices; focus ring remains immediate. |
| Menu and attachment picker | 210 ms | Anchored fade, six-pixel entry and slight scale. |
| Bundle reveal and disclosure arrow | 260 ms | Animate the bounded inline grid without replacing media nodes. |
| Modal entry/exit; native dialog and gallery entry | 240 ms entry / 160 ms modal exit | Backdrop and panel enter together. A closing wall modal ignores pointer actions and leaves the DOM after its short exit; route, focus and action handlers run immediately. |
| Same-document main view entry | 480 ms | A nine-pixel and opacity entry after the existing route resolves. URL/history change is immediate. |
| New chat message and selected gallery media | 170 ms | Only newly appended messages and loaded media enter; existing messages remain static on reconciliation. |

The production routes, wall layout, chat structure, upload and voting contracts are unchanged. Cross-document wall-to-chat navigation retains normal browser navigation. Focus, Escape, Back and outside dismissal use their existing handlers. Reduced-motion mode removes decorative animations while retaining immediate state and focus feedback.

Intentional static cases: feed refresh, vote score text, editor typing, existing media playback, old chat messages during WebSocket reconciliation or pagination, viewport/keyboard resize, disabled controls, and background status changes. The animation styles do not use `transition: all` or a runtime animation library.

Validation: `npm run check`, `npm run test:chat-browser`, `npm run test:browser` and `npm test`. Browser tests inspect tokens, pointer and keyboard press/release, icon tooltip text, 480 ms route entry, chat popover entry, reduced-motion suppression and the existing wall/chat/editor regressions. The wall browser test closes its page for its deliberate server restart, then reopens the wall before the deep link to preserve browser Back semantics. Physical iOS Safari/PWA, VoiceOver and subjective fluidity on a slow phone remain device validation; Chromium cannot establish those outcomes.

Recorded Chromium walkthroughs at a 390×844 viewport: wall/post/menu/editor [before](e23-motion/wall-detail-menu-editor-before.webm) and [after](e23-motion/wall-detail-menu-editor-after.webm); chat popover/bundle/gallery [before](e23-motion/chat-popover-bundle-gallery-before.webm) and [after](e23-motion/chat-popover-bundle-gallery-after.webm). The before clips run the same app state with `motion.css` and `motion.js` disabled; they isolate E23 motion from data and layout changes. They are not a recording of an earlier deployed commit.
