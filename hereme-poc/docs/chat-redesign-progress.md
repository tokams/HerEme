# E17 chat redesign progress

Baseline: `master` at `951f482` on 2026-11-22; clean worktree. The issue kit contains E17-01 (compact chat UI) and E17-02 (optional profile photos). `docs/SYSTEM_SPEC.md` describes the existing consent, staged attachment, seven-day retention, HTTP history, and WebSocket signal contracts; source routes and DTOs remain authoritative.

| Task | State | Paths and evidence |
| --- | --- | --- |
| E17-01 T0 contract inspection | Complete | `public/chat.*`, `server/domain/chat.js`, issue screenshots, current system spec. |
| E17-01 T1 compact inbox/header | Complete locally | `public/chat.html`, `chat.css`, `avatar.js`; supplied SVGs, responsive header and inbox. |
| E17-01 T2 composer popover | Complete locally | `chat.js` stages photo, video or any file only after the picker; Send performs upload. |
| E17-01 T3 sender runs and single media | Complete locally | `chat-render.js` keys messages and days, keeps the DOM mounted across refresh, renders one run label and bare single attachments. |
| E17-01 T4 bundle/gallery | Complete locally | Two or more ordered attachments fan into a bundle and open the existing private gallery. |
| E17-01 T5 responsive/realtime tests | Automated checks complete | `tests/chat-render.test.js`, `tests/chat-browser.cjs` cover run labels, narrow screens, staged send, gallery and WebSocket node stability. Physical iOS check remains open. |
| E17-02 avatar storage/API/profile UI | Complete locally | Schema 20, `server/domain/avatars.js`, avatar endpoints and profile crop dialog; 64/256 WebP, owner change/remove, public active-account projection, backup/restore and deletion cleanup. `tests/avatar.test.js` and `tests/avatar-browser.cjs` cover behavior. |

Local verification on 2026-11-22: `npm test` 70/70, `npm run check` 103 JavaScript files, `npm run test:chat-browser`, `node tests/avatar-browser.cjs` at 320/390 CSS px, and `git diff --check` passed. Captures: [conversation](screenshots/chat-redesign/e17-conversation.png), [desktop inbox](screenshots/chat-redesign/e17-desktop.png), [mobile inbox](screenshots/chat-redesign/e17-mobile.png), [avatar crop](screenshots/chat-redesign/e17-avatar-crop.png), [profile avatar](screenshots/chat-redesign/e17-avatar-profile.png). The captures show test accounts and browser rendering, not physical iOS.

Open device check: physical iPhone Safari/Home Screen safe area, keyboard behavior, camera capture and image orientation. The video card shows the browser's validated first frame; the chat pipeline still does not generate a private video poster derivative. No remote or production check has been performed. A migration backup and restore on a production clone are still required before deployment.
