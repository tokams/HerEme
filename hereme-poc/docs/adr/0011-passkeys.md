# ADR 0011: Additive WebAuthn authentication

Status: implemented locally; production enrollment disabled pending E12-01.

Use pinned SimpleWebAuthn server verification with required user verification and
discoverable credentials. Private keys and biometric data never reach HerEme.
The browser invokes native credential APIs and serializes public ceremony data;
all ownership, challenge, origin, counter and signature policy lives on the server.

Credentials map to immutable existing user IDs through opaque random handles.
Recovery credentials, roles, authored data and normal session semantics remain.
Fresh session-bound ownership proof is required to bind or manage credentials;
recovery-key verification remains available when an authenticator is lost.
Single-use expiring challenges are bound to ceremony, session/account where
applicable, and configured RP/origin. Anonymous ceremonies have a browser binding.

Under [ADR 0015](0015-independent-instances.md) the production RP equals the
hostname of the instance's exact configured HTTPS origin. Localhost uses a
separate development RP; credentials cannot move between RPs. Rollback disables
WebAuthn while preserving additive tables and legacy recovery authentication.
Do not roll back live data to old snapshots after concurrent writes.
