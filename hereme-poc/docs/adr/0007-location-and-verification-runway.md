# ADR 0007: Location, verification and remote administration runway

Status: approved boundary; features disabled pending later external decisions.

Areas use stable HerEme IDs independent of names and geometry versions. The
hierarchy is country → fylke → kommune with optional explicitly governed custom
areas. Geometry comes from a separately approved, versioned and licensed Norway
dataset. A boundary update creates a new geometry version; IDs are mapped through
reviewed aliases rather than guessed from names.

A post may have zero or one area in the first location release. Zero means
unlocated/national and remains visible in All. Existing posts stay unlocated.
Subscriptions may contain several areas. Category and area filters are orthogonal.
No GPS, IP, EXIF or text inference assigns an area. A keyboard/list alternative is
required before the map flag can be enabled.

Identity verification is provider-neutral: provider, opaque subject, status,
verified/revoked timestamps and minimal audit metadata. National identity numbers
and legal names are never public and are not retained unless a later legal design
proves necessity. Verification may unlock an explicitly named capability but
never grants moderator/operator roles. Normal forum participation remains
pseudonymous and unverified.

Remote administration remains disabled. Before enabling it, a new ADR must choose
phishing-resistant MFA/passkeys, moderator invitations, least-privilege scopes,
revocation, audited actions and recovery. v1 uses local CLI commands. Shared PIN,
regular-user access and anonymous moderation are forbidden.

Feature flags default off. Enabling location requires approved geometry/source,
privacy review and map/list UX tests. Enabling verification requires a contracted
OIDC provider, exact claim policy, negative-claim tests and owner acceptance.
ADR 0008 supplies the role-based staff security decision and automated contract
coverage. Independent penetration testing remains an operator release gate for
internet exposure.
