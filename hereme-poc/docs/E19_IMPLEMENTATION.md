# E19 implementation status — 2026-11-22

Local changes on `master` at `8f9fdd2`. No commit, push or deployment was made.

| Issue | Local result | Evidence and remaining check |
| --- | --- | --- |
| E19-01 | The chat `+` button shares the message row with the input and Send. A labeled three-action popover stages camera photos, recorded video or device files. | Chat browser flow checks 320/375/390/430 px, Norwegian and English, Escape dismissal and staged files. Capture choices need a physical device check. |
| E19-02 | New-account passkey enrollment is first. The recovery code appears once in a masked field with adjacent copy. Leaving before enrollment or acknowledgment warns. | Virtual-authenticator browser flow checks enrollment, cancellation, unavailable configuration, copy success/failure, existing login, recovery confirmation and dismissed exit warning. Browser password-save prompts still need device checks. |
| E19-03 | The standalone status inset uses the active dark/light surface; initial and later theme colors match it. | Browser smoke covers general wall themes. Safari and installed iPhone PWA status areas need separate visual checks because iOS can add native effects. |
| E19-04 | Mobile chat shell and panes share a visible-viewport height. The flex message list owns scrolling and the composer stays at the bottom after viewport resize. Zoom remains enabled. | Chat browser geometry checks 320/375/390/430 px and a Chromium page-scale round trip. Pinch zoom, software keyboard, rotation and safe areas need Safari and installed iPhone PWA checks. |
| E19-05 | Root and nested comments use 15 px vote triangles in poster vote background colors with 44 px targets and a compact Reply action. | Wall browser smoke checks rendered color and target size; existing comment persistence tests cover the server contract. |

Local checks: `npm run check` passed (109 JavaScript files); `npm test` passed (73 tests); chat, wall and passkey browser flows passed. Browser smoke regenerates tracked screenshots, so those generated changes were restored after verification. No private recovery code was written to a test fixture or log.

## Manual iPhone gate

Before declaring the iOS visual issues finished, test Safari tab and Home Screen PWA separately in dark/light mode. In each, open direct and group chat, pinch in and out, open and close the keyboard, rotate, switch conversations, open attachment choices and type a draft. Confirm that the composer stays reachable, the status inset stays opaque, and no controls clip at the notch or bottom edge. Record device, iOS version and dated screenshots without chat secrets.
