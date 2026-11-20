# ADR 0008: Role-based moderation and administration panel

Status: accepted, 2026-11-20.

HerEme exposes an authenticated staff panel through the existing application
origin. It is not a second policy implementation: the panel, HTTP controllers
and operator tooling dispatch the same domain services against the same SQLite
state. Session, CSRF, capability and rate-limit checks apply to every write.

`moderator` can read the moderation projection and censor a whole post by moving
it to the reversible `hidden` state. It can restore a post to `published`.
`admin` has content and account management capabilities; provisioned admins also
hold `moderator` explicitly. Admins can edit post text, category, status and net
score, edit or delete comment subtrees, permanently delete posts and delete user
accounts. User deletion requires an explicit choice: preserve and anonymize the
user's posts, or delete those posts and their dependent interactions and media.

Every staff mutation requires a human reason and writes an audit event. The
current administrator cannot delete their own account, and the final admin or
operator account cannot be removed. Public projections continue to expose only
`published` posts. Staff credentials are provisioned locally, never committed,
and use the normal recovery-key login rather than a shared PIN.

This supersedes ADR 0006 only where that document deferred browser-based remote
administration. The one-service, canonical-state, HTTPS, backup and recovery
decisions remain unchanged.
