# Public threat model and abuse budgets

## Trust boundaries

The browser, links, upload bytes, forwarded headers and public network are
untrusted. SQLite, configured media roots and loopback operator access are trusted
only after path/config validation. Caddy is the sole trusted reverse proxy in
production. The app does not fetch user-submitted links.

## Controls

| Threat | Control |
| --- | --- |
| Stored/reflected XSS | Text is escaped before HTML insertion; URL protocols are allowlisted; CSP blocks inline/third-party scripts and framing. |
| CSRF/session theft | Random HttpOnly Secure SameSite=Lax session cookie, server-side expiry/revocation, per-session CSRF secret on all writes, origin validation. |
| SQL/command injection | Prepared SQL; enum/range schemas; external media tools receive argument arrays without a shell. |
| SSRF/private-network access | Links are stored and opened by the browser only. No server link preview fetch. |
| Spam/fake voting/recovery guessing | Per-IP and per-session fixed-window limits, generic recovery errors and security events without credentials. |
| Upload/media attacks | Stream to private temporary storage, reserve disk, signature/decode/probe validation, bounded concurrency/time; publish only ready media. |
| Disk/CPU denial | Readiness minimum-free-space threshold, upload suspension, request limits, one video worker by default and retained failure state. |
| Privilege escalation | Capabilities are checked in services; verification never grants staff roles; the staff panel requires personal sessions, CSRF and persisted roles; CLI provisioning requires local filesystem access. |

Default budgets per five-minute window: account creation 10/IP, recovery 10/IP,
posts 12/account and 20/IP, comments 40/account, votes 180/account, reports
20/account, image uploads 12/account and video uploads 3/account. Operators can
tighten values through environment configuration. Rate-limit responses are 429
with Retry-After; denied attempts do not partially change domain state.

Security logs contain request ID, event, result, actor ID when known and truncated
IP hash. They never contain cookies, CSRF/recovery secrets, post bodies or upload
bytes. Automated media checks are operational controls, not a claim of perfect
content detection; reports and human review remain authoritative.
