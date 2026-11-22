# E21 local implementation record — 2026-11-22

Source: E21 issue pack under the matching mycodex project reference. Worktree: `master` at initial HEAD `f4f0de4`; changes are unstaged and uncommitted.

| Issue | Local status | Evidence / remaining gate |
| --- | --- | --- |
| E21-01 canonical revisions | PASS | Additive schema 23, v1 backfill after migration/seed/import, immutable sequence trigger, stable post IDs. Migration and API tests pass. |
| E21-02 private article drafts | PASS | Owner-only create/list/read/save/delete, edit counters, own-profile list, media access check. Browser save/resume/delete tested. |
| E21-03 article edits | PASS | Private working copy, explicit publish, stale base and request-key handling, versioned media references. API and browser tests pass. |
| E21-04 public history/diff | PASS locally | Bounded/paginated list, arbitrary two-version diff, historical view, deep link and Back/Forward in browser test. Real-device screen reader review remains. |
| E21-05 private Git mirror | PASS locally | Separate Compose worker/volume, durable outbox, idempotent commit search, reconciliation and archive rebuild after erasure. Local Git test passes; production sync and backup are unverified. |
| E21-06 poster text edit | PASS | Server text-only contract, optimistic version, idempotent request, same post identity. API test passes. |
| E21-07 moderation/privacy | PARTIAL | Hidden snapshots blocked in public API/diff and article media route; audited staff inspection and SQL/Git erasure added. Exclusive historical media bytes are queued for deletion; shared media and retained backup disposition still require operator review. |
| E21-08 rollout | PARTIAL | All 79 Node tests, browser smoke, source check and Compose config pass locally. An isolated WAL snapshot and private Git archive restore/reconcile test passes. No production deploy, production-like restore rehearsal, iPhone PWA check or external security sign-off was performed. |

## Migration and rollback

Schema 23 is additive. A WAL-safe predeploy snapshot remains necessary. Existing rows and media are not removed during migration; only a truthful v1 is synthesized. Older application code rejects schema 23, so code rollback after migration requires forward repair or restoring the *entire* predeploy data snapshot into a new directory. Restoring the snapshot discards post-migration edits; record those separately before deciding. Do not restore over live data.

The private archive lives in the `docker_hereme-content-git` volume. Deployment backup copies that volume into `content-git.tar.gz` beside the verified SQLite/media snapshot when the volume already exists. Restore the archive into a new empty volume, then run `node server/content-git-worker.js --reconcile` against the restored SQLite and archive. Check `GET /api/admin/content-git/status` with staff credentials and compare all outbox rows. `--rebuild` deliberately replaces all Git objects from non-erased SQL snapshots and must only be used after confirming SQL is authoritative and backup retention has been reviewed.

## Open verification

- Rehearse restore with a production-like copy, including detached media and an archive volume, before deploying schema 23.
- Check anonymous raw media, share previews and OG routes after hiding/erasing a historical version on the live domain.
- Inspect iPhone Home Screen PWA and Safari at 320–430 px, plus keyboard/screen-reader behavior for history controls.
- Review legal erasure handling for media bytes and all retained/off-host backups. A database/Git purge cannot erase independently retained copies.
