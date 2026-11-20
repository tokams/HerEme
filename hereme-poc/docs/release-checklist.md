# Public v1 go/no-go checklist

Repository checks can prepare this gate; only evidence from the real target marks
external rows complete. Any unresolved P0 row is NO-GO.

- [ ] CI passes unit, API, migration, security and isolated browser suites on Node 24.
- [ ] Original writes frozen; final WAL-safe original→preview merge dry-run and live comparison pass.
- [ ] Pre-cutover DB/media backup is verified and copied off-host.
- [ ] Restored disposable instance reproduces posts, images, comments and votes.
- [ ] Production config validation passes; no demo PIN/debug moderation route.
- [ ] Anonymous browse and pseudonymous create/return-login work.
- [ ] Photo/no-photo/link create, filters/newest paging, vote, comment/reply, share and report work.
- [ ] Private CLI can review/publish/hide/dismiss and audit each action.
- [ ] Privacy/rules pages and account deactivation/anonymization process are available.
- [ ] Rate limiting, CSRF, host/origin validation and upload rejection smoke pass.
- [ ] Linux service runs unprivileged, survives reboot and keeps data across deploy.
- [ ] Owned DNS points at target; HTTPS redirect/renewal and app-private socket verified.
- [ ] Mobile test passes over cellular data and desktop test passes public HTTPS.
- [ ] Canonical share URL opens publicly; headers and cookie attributes pass.
- [ ] Low-disk/readiness/backup-failure alerts reach the named operator.
- [ ] Rollback to last code and data snapshot rehearsed.
- [ ] Owner records release version/tag, operator contact and GO approval.

Video is tracked separately and is not a v1 launch gate. Location, verification
and remote admin flags must be off.
