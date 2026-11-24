# SEC-01 controller assessment, version 1

Status: engineering draft, not controller approval. Reviewed implementation: 2026-11-24. Review again before production activation and on material changes. Controller: Tomasz Gliniecki. Contact address supplied by the controller: tom.gli@icloud.com. Community processors and transfer details: pending review.

## Purposes and legitimate-interest balance

| Processing | Specific interest and necessity | Less intrusive measure and limits | Impact and safeguard |
|---|---|---|---|
| First server document request | Detect hostile traffic to the service and establish incident chronology. A server-received visit is the relevant fact. | Aggregate counters lack the connection context needed for a concrete incident. No SPA, click, scroll, asset or read tracking. | Anonymous IP and browser data can be identifying. No account ID is inferred from untrusted input. Operator-only access and bounded retention are required. |
| Registration and authentication events | Investigate credential attacks, abusive signups and account takeover. Actual attempt/outcome, auth method and verified account identity matter. | Rate limiting remains the prevention control but cannot explain an incident after the fact. Credentials and request bodies are excluded. | Shared devices and connections cause false matches. Evidence is not proof of an individual. |
| Logout, expiry and revocation | Reconstruct account access and whether a session was ended. | Session state alone does not retain an incident sequence. Store no session token or hash in event records. | Only the known account and transition are saved. |
| First rate-limit rejection per bucket/window | Confirm a protection fired and investigate a relevant burst. | Repeated rejections are not individually logged. In-memory rate-limit counters remain the primary control. | IP may be shared; do not infer guilt from one limit event. |
| Administrator suspension/ban | Trace a specific enforcement transition, actor and affected account. | Audit logs already record the action but lack the same bounded connection context. A human must review independent evidence and proportionality. | Operators can make mistakes. Restriction reasons stay in the separate staff audit; the security event uses a controlled code only. |
| Raw approved snapshot | Recheck the original bounded User-Agent and source of an address when a parser changes or an incident is reviewed. | A parsed-only record loses original diagnostic context. No full headers or request serialization. | Snapshot is available only through the privileged, audited detail view. |

Proposed basis: GDPR Article 6(1)(f), separately assessed for the purposes above. The controller must confirm real service risks, reasonable user expectations, necessity, children's possible use and safeguards. A common IP, browser or operating system cannot prove common ownership of accounts. The explorer displays similarities as observations and cannot impose a restriction. The production decision must record an approved retention period for both live databases and backups, including deletion/restore handling. Until then the new log has no automatic purge and is not ready for release.

## Field policy, version 1

| Field group | Reason to keep | Limit |
|---|---|---|
| UTC time, fixed event type, source, result/status, route class, safe reason and auth method | Explain a known state transition. | No path, query, body or arbitrary exception. |
| Instance ID and canonical hostname | Scope evidence to one community. | Host accepted only when matching the production origin; never cross-instance join. |
| Verified actor and subject ID/name snapshots | Trace a known account and preserve history after rename. | Null for an unknown visitor; actor and affected account separate. |
| Validated client IP and source | Distinguish a network connection in an incident. | One IPv4/IPv6 value from peer or the trusted loopback proxy; ignore a direct client's forwarded header. |
| Bounded User-Agent plus derived browser/OS/version/device category | Interpret authentication compatibility and incident context. | At most 512 characters, no control characters; no device model or high-entropy hints. |
| HTTP method, generated request/operation UUID | Relate an attempt and outcome. | Never a session, CSRF or credential value. |

The raw snapshot permits only IP/source, bounded User-Agent and HTTP method. Cookies, authorization, recovery keys, passkey assertions, content, URLs, forwarded chains, unknown headers and browser/device probes are excluded. No tracking identifier or client telemetry was added.

## Terminal storage and Norwegian ekomloven § 3-15

The checked implementation uses first-party host-only session and CSRF cookies (up to 30 days), a five-minute passkey challenge cookie, localStorage for language/layout/theme choices, account-keyed drafts, a 30-day install dismissal and confirmed-install flag, an optional push-subscription reference, sessionStorage for a passkey invitation reminder, and a service worker/cache plus browser push subscription. The cookie page lists these by name, purpose and lifetime or user-controlled duration. There is no third-party analytics script in the inspected public application. The new event writer only receives ordinary server requests and does not solicit Client Hints or probe the device. The controller must still decide and record whether each device-storage use is strictly necessary for a requested feature or requires prior consent. In particular, persistent install preference and optional push behavior need individual review. If an item is non-exempt, disable it or introduce valid prior consent before activation; a terms click is not consent. Manual comparison of passive metadata needs a separate § 3-15 assessment before operational use.

## DPIA screen and release controls

The implementation does not automate decisions or perform general behavior tracking. It does allow manual account correlation using personal technical data. The controller must document scale, user expectations, whether children are likely, systematic monitoring risk, combined data and the need for an Article 35 DPIA. The result, date and reviewer are pending. Access is limited to local operators and audited; transport remains HTTPS at the gateway, production databases remain per-instance, and backups follow the existing protected deployment path. Verify the backup retention and off-host storage before release.

No regulatory approval is asserted. Relevant primary guidance: [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [Datatilsynet on legitimate interests](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/nodvendig-for-a-ivareta-legitime-interesser---interesseavveiing/), [Nkom on cookies](https://nkom.no/internett/informasjonskapsler-cookies), [Ekomloven § 3-15](https://lovdata.no/lov/2024-12-13-76/%C2%A73-15).
