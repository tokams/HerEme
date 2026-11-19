# Validation — Square wall v3, 2026-11-18

Implements the updated poster-wall issue and subsequent user requests for fixed
Cascadia Code, Simple/Advanced desktop layouts, visible category icon buttons in
Simple, slightly spaced tiles and light/dark modes. See [design](wall-v3.md).

## Automated and visual checks

- `npm run check`: all JavaScript sources parse successfully.
- `npm test`: **27 passed**, zero failures. Covers online WAL snapshots, both
  writing origins, conflict rollback, all post types/media, seed idempotency,
  category/crop/text-position validation, roomless posts, preserved high-water
  IDs, repeat merges, API interactions, filtered activity and port selection.
- `npm run test:browser`: **passed**, using a temporary database and isolated
  headless Chromium. Desktop 1440x1000, mobile 390x844; responsive checks also at
  350, 390, 700, 900, 1280 and 1700. No page overflow or JavaScript/console errors.
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
- Release tests additionally cover recovery/session/CSRF contracts, legacy identity
  upgrade, FTS pagination, normalized image derivatives, private moderation audit,
  checksummed restore, resumable video offsets and the 180-second worker boundary.

## Actual-data migration rehearsal

On 2026-11-19, the current original and poster-wall data were opened read-only and
the complete release migration/merge ran against disposable snapshots. The first
attempt exposed duplicate case-insensitive legacy pseudonyms; schema 10 now
disambiguates them deterministically while retaining both user IDs and every post
relationship. The repeated rehearsal then passed with 35 posts, 11 users, 7
historical rooms, 29 votes, 50 comments, 1 report and 15 verified media files.

The source-to-preview merge reported zero outstanding changes. Manifest checksums,
SQLite integrity and foreign keys passed. A disposable release process migrated
and opened the result, `/api/ready` reported every check true, and one bounded page
returned all 35 published posts. It was stopped after the check. Neither running
data directory was modified and no process/PID claim is recorded here.

Future source writes still require an explicit final merge before cutover; this is
not continuous synchronization. See [migration procedure](migration.md).

## Manual hardware checks

Physical phone camera capture and another device over Wi-Fi remain untested.
Browser file selection and responsive tests do not establish physical camera,
firewall or device readiness.
