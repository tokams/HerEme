# Release issue implementation status

This document maps the local implementation to E01–E07 / I01–I28. It does not
claim that an external production environment exists. Repository-complete and
operator/external evidence are deliberately separate.

## Public v1 (I01–I20)

- I01–I04: release contract, ADRs, typed domain-service boundaries, stable error
  envelopes, migrations, CI, source checks, API/migration/operations/browser tests.
- I05–I08: unique pseudonyms, one-time recovery keys, password-manager-compatible
  save/autofill forms with copy fallback, legacy-token upgrade,
  HttpOnly/SameSite sessions, CSRF, revocation, roles/capabilities and verification
  state separated from authorization.
- I09–I13: canonical post projections, five categories, votes, four-level comments,
  cursor pagination, FTS5 search, activity, immutable originals and normalized image
  derivatives, shared responsive composer/wall/detail, share and reporting flows.
- I14–I16: public reporting with threshold review; private moderation/role/account
  CLIs with audit events; abuse limits and browser security headers; privacy, rules,
  account deactivation and operator anonymization.
- I17–I20: unprivileged systemd services, Caddy HTTPS template, production config
  validation, live/readiness endpoints, WAL-safe checksummed backup/restore, atomic
  deploy rollback, operator runbook and explicit cutover gate.

Repository checks cannot honestly complete DNS ownership, a real Linux VM install,
public TLS renewal, cellular-device testing, an off-host backup copy or operator
alert delivery. Those remain unchecked go/no-go evidence in `release-checklist.md`.

## Three-minute video (I21–I23)

The feature-flagged implementation supports picker/camera capture and a 180-second
browser stop, a poster preview, resumable 4 MiB disk-streamed chunks, progress,
pause/resume/cancel, bounded retry and durable upload offsets. A persistent worker
uses ffprobe as the authority for the 180-second limit, retries jobs, produces an
H.264/AAC fast-start MP4 and thumbnail, and publishes only `ready` media. Wall
tiles never autoplay; detail playback uses native controls and range responses.

The service and injected-runner boundary tests cover 180.000/180.001 seconds,
resume offsets and worker publication/rejection. Real codec/device evidence still
requires FFmpeg and physical Safari/Chrome devices in the target environment.

## Deferred capabilities with real boundaries (I24–I28)

- Location is off by default. Reviewed GeoJSON can be imported only with source,
  licence and version metadata. The feature supplies explicit subscriptions,
  accessible SVG/list selection and area-scoped posting/browsing without inferring
  or storing device location.
- Verification is off by default. The provider-neutral boundary stores only a
  hashed subject and status; verification never grants moderator/operator roles.
  A production BankID contract and provider adapter are external prerequisites.
- Remote administration is intentionally disabled and rejected by production
  config. ADR 0008 later replaced private-only moderation with audited,
  capability-checked staff sessions and same-origin endpoints.

No placeholder Norway geometry, fake BankID integration, public admin backdoor or
fabricated deployment evidence is included.
