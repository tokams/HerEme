# SEC-01 implementation progress

## Baseline and decision

The inspected branch is `feature/security`. Community instances share one Node application image but have separate SQLite databases, media volumes, origins and cookies. The platform panel at `admin.hereme.no` has its own registry, operator session and TOTP login. It does not store community accounts or request metadata. The community `operator` role is the explicit security administrator for an instance. Community moderators and ordinary admins cannot read the security explorer. The platform panel remains operationally separate and has no direct SQL access to a community's event log. This is a deliberate deviation from embedding community events in the central registry.

Schema 6 had a small `security_events` table with hashed IPs and arbitrary event names. Migration 24 preserves it as `security_events_legacy` and creates the constrained event/raw pair. Existing data are not reinterpreted as any of the thirteen new facts. It also audits and grants the `operator` role to the provisioned, active `HerEmeAdmin` account when that account already has the `admin` role. New staff provisioning gives the same account the role explicitly. Other admins and moderators do not gain log access. New events use the instance's existing SQLite volume. Production Compose passes stable `INSTANCE_PROJECT` as `HEREME_INSTANCE_ID`; older standalone deployments derive the identifier from their configured hostname.

## Hook matrix

| Event | Authoritative hook |
|---|---|
| `page_visit` | Initial server document request middleware, excluding prefetch and non-document routes |
| `registration_attempt`, `registration_success`, `registration_failure` | `/api/session` request and committed account creation |
| `login_attempt`, `login_success`, `login_failure` | Recovery submission and passkey verification submission |
| `logout` | `/api/session/logout` after cookie/session invalidation |
| `session_expired` | First request observing an expired unrevoked session, conditional durable update |
| `session_revoked` | `/api/session/revoke-all`, one event per active session updated |
| `rate_limit_triggered` | Domain error handler for a rejected rate limit |
| `account_suspended`, `account_banned` | Administrator restriction transition endpoint, after the database transition |

The passkey options route starts a challenge. The verification submission is the logical attempt; abandoned challenges have no recorded outcome. Rejected requests beyond a rate bucket's allowance produce one `rate_limit_triggered` event per bucket/window, rather than repeated attempt rows. Legacy bearer migration remains a separate compatibility path. SPA navigation and client-side interactions send no security telemetry.

## Approved metadata policy, version 1

All fields are collected for account/service security assessment under proposed GDPR Article 6(1)(f), subject to controller approval. Time, type, fixed route class, outcome and opaque operation/request IDs reconstruct a relevant event. Verified account ID and name identify a known actor. The target account is separate from the requester. The canonical hostname and instance ID scope evidence. Client IP distinguishes a connection for incident response. Original bounded User-Agent and its parsed browser/OS/device category help diagnose credential attacks and compatibility. Method distinguishes an actual document load from an authentication mutation. No request path, query, body, cookies, credentials, forwarded chain, optional hints, language or referring page are saved. User-Agent is limited to 512 characters without control characters, and the forwarded IP must be a single valid address supplied through the local trusted proxy. A direct peer's forwarded header is ignored. The raw snapshot is an allowlisted record, not a request dump. Device model remains null.

## Assessment for owner review

The field-by-field LIA, terminal storage review, and DPIA screen are in [security-logging-assessment.md](security-logging-assessment.md). The strongest privacy impact is correlation of people sharing a network or browser. Access is restricted to the local operator role and audited. Similarity is displayed as an observation, never automatic proof or a sanction. Retention and backup expiry require an approved schedule; the new log is not automatically purged. Logs therefore remain local and must not be deployed until the controller chooses a documented retention period and backup deletion process.

The event writer reads only ordinary server request fields and does not solicit Client Hints or perform browser fingerprinting. The installed application's existing cookies, localStorage, sessionStorage, service worker and push subscription use must be reviewed separately under ekomloven § 3-15. The additional install dismissal uses the existing localStorage key `hereme_install_dismissed_until` for 30 days and carries no identity. Manual cross-account comparison based on passive metadata remains subject to a specific § 3-15 assessment before operator use. A GDPR Article 35 DPIA screen is pending the controller's assessment of scale, children, and monitoring risk. No automatic decision is created.

## Storage inventory observed in source

| Technology | Observed use and lifetime |
|---|---|
| `hereme_session`, `hereme_csrf` | Host-only session and CSRF cookies, 30 days by default |
| `hereme_passkey_challenge` | Host-only passkey challenge binding, five minutes |
| `hereme_language`, `hereme_layout`, `hereme_theme` | Saved UI choices in localStorage until removed |
| `hereme_design_draft:<user ID>` | User's unfinished composer content in localStorage until published or cleared |
| `hereme_install_dismissed_until`, `hereme_install_confirmed` | Install choice in localStorage, 30-day dismissal and persistent installed flag |
| `hereme_push_subscription_id` | Push binding reference in localStorage until device is disabled/logged out |
| `passkey-invite:<user ID>` | Session-only reminder suppression |
| Service worker and push subscription | PWA install/offline shell and explicitly enabled notifications; inspect browser/device lifecycle |

No advertising tracker or analytics script was found in the inspected public code. The owner identified Tomasz Gliniecki as controller but has no contact address yet. Actual production processors, retention period, and legal basis/exemption for each storage item require owner verification. The user-facing notices must reflect those decisions before release.

## Phase status

T0 source audit and assessment draft are recorded here and in ADR 0016. T1 is implemented with migration 24, one event writer, all thirteen event hooks, a bounded rate-limit event, and atomic authentication/security writes. T2 is implemented in the local operator-only staff tab with search, pagination, raw detail and read auditing. T3 has the installation dismissal, menu links and bilingual legal pages. The pages inject per-instance public controller/contact/processor values at request time and return 503 when production contact or processors are not configured. The legal content needs owner review and actual contact and processor details before release.

The production release reads private `state/legal.json` in the platform base directory; use `deploy/platform/legal.example.json` as a shape reference. Its `main` and `community` entries require the verified controller, contact email and reviewed processor summary. The deployment script fails before cutover if it is missing or incomplete. The local Docker rehearsal uses explicit test-only values. Do not put the private file or credentials in the image or repository.

T4 development verification: the final `npm test` passed 96/96, `npm run check` parsed 132 JavaScript files, and `git diff --check` passed. `node --test tests/security-events.test.js` passed all six tests, including all thirteen event names, atomic raw/structured failure and account rollback, spoofed headers and public legal routes. `node tests/pwa-install-browser.cjs` passed mobile/iOS/desktop installation and dismissal. `node tests/security-browser.cjs` passed operator explorer access and escaped malicious raw User-Agent rendering. `node tests/passkeys-browser.cjs`, `node tests/language-browser.cjs` and `node tests/pwa-browser.cjs` passed. Docker's Python 3.12 parsed `release.py`. `node deploy/platform/rehearse.cjs` passed two-instance HTTPS/WSS, image/mount, trusted-IP and independent replacement checks against disposable volumes. `node deploy/platform/test-deployment.cjs` passed a synthetic legacy-to-schema-24 cutover, local operator access on both communities, failed-update recovery and a second release; disposable resources were removed. Early full runs exposed test-fixture legal settings, and the first cutover rerun exposed a hardcoded schema-23 update check. Both were corrected before the final passing runs. No production or live DNS was changed.

Development acceptance satisfied: all thirteen fixed hooks; paired rows and atomic writes; verified actor and subject snapshots; one expiration event; allowlisted raw metadata; proxy spoof rejection; bounded rate-limit logging; operator-only audited explorer with a provisioned local operator; escaped raw display; host-isolated SQLite and cookies; translated menu and install flow; public bilingual pages using per-instance values. A direct central-platform log explorer was not added because `admin.hereme.no` holds operational state and no community identities; the operator opens each community's own privileged panel. This is the ADR 0016 isolation decision. The release script accepts a schema 23 initial cutover and schema 23 or 24 upgrades, covering an existing platform installation and later SEC-01 releases.

Remaining release gates: owner supplies a real contact mailbox and processor/transfer details, approves the purpose-specific LIA and terminal-storage decisions, records a retention and backup expiry schedule, completes the DPIA screen, reviews the legal text and runs a copied-production-data migration rehearsal. The contact address is not yet available, so the production legal pages and readiness deliberately stay unavailable. Physical iOS/PWA behavior and production proxy/IP observations remain unverified. The synthetic cutover test proves code and process behavior, not the shape of the private live dataset.

## First production attempt (2026-11-24)

The committed SEC-01 release `6ac52c2` stopped at the intentional legal configuration gate before image build, database snapshot, migration or cutover: `/home/dongjel/services/hereme-platform/state/legal.json` is missing. Read-only inspection confirmed the previous `0f334188` release remains current and both community application containers are healthy. No backup directory was created for the failed attempt. `deploy/deploy-online.ps1` now checks for the private file before uploading an archive and gives a direct action message. It does not create or fill the file. The owner must provide a working contact address and reviewed processor details for both sites; do not use the example placeholders. A new commit is needed for the preflight improvement, but no code commit or production retry was made by this session.
