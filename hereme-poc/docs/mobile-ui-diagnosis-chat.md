# Mobile chat UI diagnosis

Baseline: `master` at `bb13311`, Chromium/Playwright mobile viewports, Norwegian locale, 2026-11-22.

## Evidence

- The supplied inbox screenshot reproduces the failure: a visible `Opprett gruppe` label extends beyond the right edge. Although `chat.html` declares an icon-only button, `translateStatic()` replaced its SVG with the translated text at runtime. The fix preserves the SVG and translates its accessible name and tooltip; the live screenshot and browser assertion now verify the icon remains present in both languages.
- The conversation failure **is reproduced** at 390 px in the baseline capture: translation replaces the arrow with `Tilbake til samtaler`, which wraps; the title/subtitle and content-sized Details button then overlap. The page itself does not report horizontal document overflow, so a scroll-width-only smoke assertion missed the collision.
- Image and video messages used unrelated caps (image: 180 x 145 px; video: 180 x 110 px), matching the inconsistent presentation in the supplied capture. Neither used the available bubble width.
- The composer already stages files until explicit Send and uses `100dvh` plus bottom safe-area padding. Its attachment row wrapped opportunistically instead of reserving three square controls and flexible retention copy.

## Affected files and direction

- `public/chat.css`: explicit mobile grid contracts for inbox/header/composer, square icon controls, title truncation, safe-area insets, and consistent responsive media sizing.
- `tests/chat-browser.cjs`: assertions at 320, 359, 375, 390, and 430 CSS px for page overflow, control bounds, long-title truncation, composer bounds, and both supported languages.

No chat API, attachment authorization/expiry, consent, routing, or send/staging behavior is changed. Real iOS Safari/PWA keyboard behavior remains a manual device check; Playwright Chromium validates responsive geometry only.
