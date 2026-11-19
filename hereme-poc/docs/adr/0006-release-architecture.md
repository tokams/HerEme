# ADR 0006: First public release architecture

Status: accepted for implementation, 2026-11-19.

HerEme v1 runs as one Node.js 24+ service on one Linux VM. Node's built-in
SQLite remains the source of truth in WAL mode; measured load or an explicit
multi-node requirement is required before replacing it. Immutable media lives
outside the release directory beside the database and is referenced through
media records. Static application assets are versioned with the release.

The application keeps plain browser JavaScript and CSS. A framework rewrite is
not a release requirement. HTTP controllers parse requests and map stable DTOs;
domain services own transactions, permissions and state transitions. Operator
commands call those same services. SQLite migrations are ordered, idempotent
and reject newer schemas. Release artifacts never create a new database over a
missing production path.

The public socket binds to 127.0.0.1 and Caddy terminates HTTPS. Production uses
an explicit canonical origin, secure HttpOnly session cookies, CSRF tokens,
host validation and forwarded client addresses only from the loopback proxy.
Moderation is private CLI work for v1. Public remote admin endpoints and the old
shared PIN are disabled.

Background media work uses a durable SQLite queue. One bounded worker process is
enough for the initial VM and can move behind the same queue contract later.
Images are decoded and normalized by an explicitly configured processor.
Videos are an optional P1 capability and require configured ffprobe/ffmpeg.
Unavailable processors make media readiness fail visibly.

SQLite and local immutable media are backed up together with checksums. Deploy,
data migration and rollback are separate operations. The original/preview
three-way merge remains the cutover path; it is never described as replication.

Release flags:

- `HEREME_ENV=production` enables strict production validation.
- `HEREME_PUBLIC_ORIGIN` is the one canonical HTTPS origin.
- `HEREME_ENABLE_VIDEO=1` requires working ffprobe/ffmpeg and a worker.
- `HEREME_ENABLE_LOCATIONS=0`, `HEREME_ENABLE_VERIFICATION=0` and
  `HEREME_ENABLE_REMOTE_ADMIN=0` remain off until their later gates pass.

Three-minute video is P1. Location, map, BankID and remote admin are later work.
Provider/data-dependent features have schema and authorization seams but are not
silently simulated.
