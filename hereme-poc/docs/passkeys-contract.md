# Passkey backend contract

Passkeys are enabled with `WEBAUTHN_ENABLED=1` or `true`. Production requires `WEBAUTHN_RP_ID` to equal the hostname of `HEREME_PUBLIC_ORIGIN` and the sole `WEBAUTHN_ALLOWED_ORIGINS` value to equal that exact HTTPS origin. Preserve the configured RP when moving an existing database.

`GET /api/passkeys/config` returns `{enabled,rp_id}`. Anonymous `POST /api/passkeys/login/options` returns `{challenge_id,options}` and a short-lived HttpOnly binding cookie. `POST /api/passkeys/login/verify` accepts `{challenge_id,response}`, sets normal HerEme cookies, and returns `{user,csrf_token}`. Both anonymous posts require the exact configured Origin and are rate limited.

Authenticated, CSRF-protected routes are `POST /api/passkeys/step-up` (`{recovery_key}`), registration `options` (`{label}`) and `verify` (`{challenge_id,response,label}`), `GET /api/me/passkeys`, `PATCH /api/me/passkeys/:id` (`{label}`), and `DELETE /api/me/passkeys/:id` (`{confirm_recovery:true}`). Lists return `{passkeys:[{id,label,created_at,last_used_at,backed_up}]}`.

Account creation and recovery mint five-minute proofs for the exact issued session. Otherwise step-up verifies recovery server-side. Challenges expire after five minutes and are atomically consumed. Registration is bound to ceremony, RP, origin, user and session; anonymous authentication is bound to the cookie.

Registration requires a resident credential and user verification. Login resolves the account from stored credential ID/public key and requires the immutable random user handle. SimpleWebAuthn verifies origin, RP ID, signature, presence and verification. Only the identity service issues sessions.

Private keys, raw ceremony payloads, recovery secrets and biometrics are never persisted or audited. Safe enrollment, authentication, rename and revocation metadata is audited.
