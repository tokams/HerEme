# Passkeys progress

- T0 contract: complete in `docs/passkeys-contract.md`.
- T1 SQLite: complete, additive schema 18; stable users/recovery/sessions retained.
- T2 backend: complete with SimpleWebAuthn 14.1.0, bound single-use challenges, UV and discoverable credentials.
- T4 management: complete; list/rename/revoke with fresh proof, and revocation requires recovery-typed proof plus confirmation.
- T5 config: disabled by default; canonical production gate enforced.
- T3 browser UX: PASS locally; shared login/onboarding, one-time recovery backup,
  native ceremony adapter, Security list/add/rename/remove and keyboard focus.
- T6 automated coverage: PASS for 60 Node tests and Chromium virtual-authenticator
  registration/discoverable login to same UUID/roles, two credentials, rename and
  revocation. Negative browser cases reject tampered signature, origin, RP hash,
  missing UV, mismatched handle, unknown credential, disabled user and revoked
  credential. Domain tests cover expiry/replay/cross-session/wrong ceremony,
  cookie binding and recovery-confirmed removal. Physical-device matrix BLOCKED.
- SimpleWebAuthn 14.1.0 is pinned; npm metadata confirms MIT and Node >=22 support.
- Public passkey operations remain off; no production configuration was changed.
- Production enrollment: BLOCKED pending independent HTTPS, DNS and deployed-config verification.
- Physical device ceremonies: NOT TESTED; no device-support claim is made.
