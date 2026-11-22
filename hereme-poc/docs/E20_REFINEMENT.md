# E20 UI refinement evidence

Inspected baseline: `master` at `f4da9c0`. This worktree was clean before the refinement. No production data, chat consent rules, or published post IDs were changed.

| Issue | Result | Evidence |
| --- | --- | --- |
| E20-01 article to chat navigation | PASS locally | `tests/sharing-browser.cjs` opens an article, enters an unsent draft, uses browser Back/Forward, sends the first pending request, then returns from pending and accepted chats. A direct draft link without `returnTo` returns to inbox. Invalid users fall back to inbox. Physical iPhone/PWA navigation remains unverified. |
| E20-02 real article preview | PARTIAL | Browser smoke verifies cover and chapter images, formatted Markdown, media viewer, removal, reupload, draft reopen, and published chapter order. Shared renderer supports video elements and the test covers their safe markup. The machine has no FFmpeg/FFprobe or video fixture, so actual upload/transcode/playback could not be exercised here. |
| E20-03 custom SVG controls | PASS locally | Share, Publish, Reply, Back, Close, reorder and other decorative arrows now use the icon registry; text labels and localized names remain. Browser smoke and component tests exercise affected controls. Physical iOS emoji presentation remains unverified. |
| E20-04 compact mobile composer | PASS locally | Browser smoke checks no horizontal overflow and at least 44px targets at 375, 390 and 430 CSS pixels. Article and poster screenshots are in `docs/screenshots/e20-refinement`. Hardware keyboard, zoom and iOS safe-area behavior remain unverified. |

Source Sans 3 Regular was copied from the owner-provided file; its SHA-256 is `53492FB3A0DEF77354F166A55D09B63A10855E91C206C7620A81CF56E97F8EC3`. The browser smoke test verifies that the local WOFF2 loads. The OFL notice was assembled from the same license text already distributed with Cascadia Code, with the Adobe copyright and reserved font name from the [official Source Sans release notice](https://github.com/adobe-fonts/source-sans/blob/release/LICENSE.md).

Checks: `npm test`, `npm run check`, `npm run test:browser`, `npm run test:chat-browser`, and `node tests/sharing-browser.cjs`. These are local tests with isolated temporary databases. Real iPhone Safari/PWA verification is still required before deployment.
