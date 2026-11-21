# ADR 0010: Optional PWA and durable Web Push delivery

## Status

Accepted for implementation on 2026-11-21. Production rollout remains disabled
until physical device verification is complete.

## Decision

HerEme remains a normal website and also exposes an installable manifest and a
root-scoped Service Worker. Members deliberately enable push per device. SQLite
notifications remain canonical; Web Push is a best-effort delivery channel fed
by a transactional outbox.

Schema 15 adds account category preferences, device subscriptions, forum reply
notifications, a push outbox, per-device delivery state and worker telemetry.
Chat notification producers enqueue in their existing transaction. Forum reply
creation and enqueue also share one transaction. The supervised push worker
rechecks the account, preference, subscription ownership and current resource
access immediately before sending.

Payloads contain a generic label and an allowed same-origin route. They exclude
message bodies, filenames, attachments, recovery data, session data and tokens.
The Service Worker caches no private or authenticated resources.

Production is controlled by `WEB_PUSH_ENABLED`, which defaults to off. VAPID
private material is held only in deployment environment secrets. Changing the
public origin or rotating VAPID keys requires device resubscription.

## Consequences

Push provider acceptance does not prove display or delivery. The in-app inbox
remains available when permission is denied or delivery fails. Invalid endpoints
are disabled, temporary failures retry with bounded backoff, and outbox delivery
records expire after 30 days. Core readiness does not depend on a push provider.

Real iPhone Home Screen and Android background delivery are release gates that
cannot be replaced by automated provider mocks.
