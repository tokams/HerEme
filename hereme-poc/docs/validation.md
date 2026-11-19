# Validation — Square wall v3, 2026-11-18

Implements the updated poster-wall issue and subsequent user requests for fixed
Cascadia Code, Simple/Advanced desktop layouts, visible category icon buttons in
Simple, slightly spaced tiles and light/dark modes. See [design](wall-v3.md).

## Automated and visual checks

- `npm test`: **25 passed**, zero failures. Covers online WAL snapshots, both
  writing origins, conflict rollback, all post types/media, seed idempotency,
  category/crop/text-position validation, roomless posts, preserved high-water
  IDs, repeat merges, API interactions, filtered activity and port selection.
- `npm run test:browser`: **passed**, using a temporary database and isolated
  headless Chromium. Desktop 1440x1000, mobile 390x844; responsive checks also at
  320, 768, 900 and 1100. No page overflow or JavaScript/console errors.
- Verifies Simple default, five visible category icon buttons, multi-selection,
  shared filter state across desktop modes, light/dark and layout persistence,
  actual discussion links, search and sorting; square edges, ordered actions,
  fixed loaded Cascadia font, no font selector, 10px Simple/zero Advanced gaps,
  and 1.12 photo/square text proportions.
- Covers text/photo publication, crop and text placement persistence, untouched
  original demo image links, all five themes, 44px voting, mobile full-screen
  detail, sharing, nested replies, moderation, focus containment, preserved scroll
  and filters, reduced motion, long headlines at all four placements on narrow
  tiles and database restart persistence.
- Reviewed Simple light, Advanced dark and mobile wall screenshots, including
  the supplied green/red square vote icons. Other interaction captures are
  available under `docs/screenshots/wall-v3/`.
- `git diff --check` passed. Implementation remains unstaged and uncommitted.

## Actual preview preservation and runtime

Retained `data/preview.before-wall-v3` before redesign. Compared all 148 rows from
its six legacy tables plus presentation/import/design/membership metadata against
current preview: no changed or missing rows. All nine uploads are byte-identical.
Migration 5 adds default auto text placement; old category/crop values survive.
SQLite integrity is OK; foreign-key check is empty.

The final merge imported zero source changes, retained 30 posts, 10 users,
7 historical rooms, 21 votes, 33 comments and 1 report. Newer real preview writes
remain alongside the original posts and 13 supplied examples. Repeated explicit
seeding added zero and skipped all 13. The original source's six legacy tables
also compare unchanged against their preview counterparts.

Retained merge backup/source snapshot suffix:
`7d8d52e8-ae38-492e-8240-23eaa474224e` under `data/preview.before-merge-...`
and `data/preview.incoming-...`. No snapshot or original data was overwritten.

At 21:50 UTC, subsequent real preview writes brought the total to **32 posts**,
23 votes and 12 uploads. All 51 original-source legacy rows match the preview.

The worktree `run.cmd` is running on **http://localhost:3001**
(Node PID 24804, launcher PID 22104 after the preview-only restart); the original remains on
**http://localhost:3000**, PID 16472. Both health endpoints pass. The new live
activity endpoint, display preference script, icons, styles and local font are
served successfully, including the updated font MIME handler. All 28 distinct
live referenced media URLs are verified nonempty.
Recheck processes/ports before taking any future process action.

Future source writes need another explicit merge before cutover; this is not
continuous synchronization. See [migration procedure](migration.md).

## Manual hardware checks

Physical phone camera capture and another device over Wi-Fi remain untested.
Browser file selection and responsive tests do not establish physical camera,
firewall or device readiness.
