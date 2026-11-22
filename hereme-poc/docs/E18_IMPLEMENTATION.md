# E18 local implementation record

Baseline: current worktree on 2026-11-22. No deployment, remote mutation or commit was performed as part of E18.

| Issue | Local result | Evidence |
| --- | --- | --- |
| E18-01 post links and rich previews | PASS locally; external clients PARTIAL | Raw GET/HEAD metadata, 1200×630 image generation for text, photo, video thumbnail and legacy local poster, public image route, hidden-post revocation, HTML/Host tests. iMessage and other remote-client unfurls still require a live deployment and physical device. |
| E18-03 comment votes | PASS locally | Schema 21, one vote per account/comment, toggle/swap, self-vote and unpublished rejection, CSRF/auth, compact in-place UI updates, aggregate tests. |
| E18-02 public profiles | PASS locally; device check PARTIAL | Stable linked author IDs, strict public DTO, guest `/u/:id`, contextual author menu, chat draft gate, mobile browser test. Physical iPhone/PWA navigation remains to be checked. |
| Chat media alignment | PASS locally; device check PARTIAL | Portrait sent and received image geometry at mobile width, existing chat browser flow. The screenshot's black side gutters came from a fixed-width image box with `object-fit:contain`; the media element now sizes to its content and aligns to its sender edge. A shared generic write-rate bucket intermittently blocked the test's group creation, so group creation now has its own bounded bucket. |

Preview contract: `https://hereme.no/?post=<id>` is canonical. A public post gets `200` with post-specific OG tags. Missing, hidden or review posts get `404`, generic noindex metadata and no post text. A versioned JPEG is served only while the post is currently public at that revision, with `Cache-Control: no-store` to enforce moderation at the application boundary. A rendering failure keeps the post page available with a generic image and a logged, bounded retry. The cache directory is regenerable and excluded from snapshots; source media and database remain in the verified backup.

Before production deployment: verify the schema 20→21 migration and snapshot restore on a production clone, exact public `hereme.no` origin and HTTPS, iMessage and a second unfurler on real devices, and iPhone installed-PWA navigation. The deployment script requires a clean committed tree; this implementation remains uncommitted.

Visual captures: [public profile](screenshots/sharing-profiles/e18-profile.png), [post preview](screenshots/sharing-profiles/post-preview.jpg).

Local checks: `npm test` (including an additive schema 20→21 migration test), `npm run check`, `npm run test:browser`, `npm run test:chat-browser`, `node tests/sharing-browser.cjs`, and `git diff --check`. The wall browser smoke generates screenshots under `docs/screenshots/wall-v3`; generated changes to those baseline captures were restored after inspection.
