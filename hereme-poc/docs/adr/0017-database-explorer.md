# ADR 0017 · Platform Database Explorer

## Decision

Use Datasette 0.65.6 for database selection, table browsing, sorting, filters, pagination, schema inspection and SQL. The standard platform release pins its Docker image by digest. Operators sign in at admin.hereme.no and follow **Database Explorer** to `/databases/`.

Datasette supports several SQLite files and bounded SELECT queries in one application. sqlite-web also offers a read-only SQLite interface, but its administration and file-loading features add configuration for this deployment. DbGate Community Edition supports several database engines and connection management, which HerEme already handles through its site inventory. All three would require a separate policy for restricted data. See [Datasette SQL](https://docs.datasette.io/en/stable/sql_queries.html), [sqlite-web](https://github.com/coleifer/sqlite-web) and [DbGate](https://github.com/dbgate/dbgate).

## Trust and data flow

The management Compose file grants the existing operator access through `HEREME_EXPLORER_OPERATORS`. This accepts a comma-separated list of platform account names. An empty list grants nobody access. The panel uses the same grant to show the menu link and authorize requests. The gateway supplies the authenticated operator name to Datasette. For SQL responses the explorer container logs the operator, database, HTTP status and query digest, which can be matched to the persistent submission audit. Container log retention follows the Docker host configuration.

Caddy checks the platform session on every browser request, including JSON and static routes. The platform checks the named, MFA-authenticated bootstrap operator, expiry and host. Community staff have their own sessions. The gateway strips credentials before forwarding an authorized GET or HEAD to Datasette on a dedicated internal network. The registry audit records the operator, database and browse path or SHA-256 digest of submitted SQL. A query entry records submission, including rejected SQL.

The separate projector runs without a network interface and opens the registered source directories read-only. SQLite reads each database in a transaction with its WAL visible. Datasette receives only filtered tables in a shared 128 MiB memory volume mounted read-only in its container. The projector keeps a read connection per source, compares SQLite data_version before a browse or query and rebuilds changed projections atomically. Failed refreshes fail the request. Each site has its own snapshot. SQL cannot join across instances. The source schema and credentials are never copied wholesale.

The column policy lives in `deploy/platform/explorer/projector.py`. Community tables include user and post metadata, comment metadata, votes, structured security events and their allowlisted raw records. Platform tables include operator names and operational audit records. Session material, password hashes, TOTP seeds, private messages and attachment files are outside the policy. Schema inspection describes the columns an operator may query. Datasette limits SQL to one second and 500 result rows. Full database downloads and streaming CSV are disabled.

Example investigation:

```sql
SELECT e.timestamp_utc, e.username, e.client_ip,
       json_extract(r.raw_metadata_json, '$.ip_source') AS ip_source
FROM security_events AS e
JOIN security_event_raw AS r USING (event_id)
WHERE e.event_type = 'page_visit'
ORDER BY e.timestamp_utc DESC
LIMIT 50;
```

## Deployment and scale

The projector has a private 128 MiB tmpfs at `/tmp`. SQLite can spill statement journals there when replacing large projection tables. The root filesystem and source database mounts remain read-only. The deployment rehearsal refreshes a projection containing a 512 KiB raw event, commits another source change, then opens the authenticated explorer index and checks the new data.

The release resolves the existing main and community volume names from the deployment and builds the read-only mounts from `deploy/platform/sites.json`. For an additional provisioned community, add its id, hostname, label and existing Docker dataVolume to this inventory, then release. The volume must contain a compatible hereme.sqlite. Provision the community and its HTTPS routing separately. Registration adds explorer access to that database. Initial cutover and updates start the projector and explorer with health checks.

The refresh cost scales with the selected rows in the changed database. SQLite WAL allows normal writers to continue. A five-second refresh deadline and bounded temporary storage make oversized projections fail visibly. Confirm capacity against production-sized copies before enabling large new datasets. Security event inspection from this central operator account is an additional access path to the existing instance-local staff explorer described in ADR 0016.

Run `npm test` and `node deploy/platform/test-deployment.cjs` with a local Linux Docker engine and Playwright Chromium. The deployment rehearsal uses disposable databases, the actual gateway, a platform operator session and two communities.

## Verification on 25 November 2026

All 97 Node tests passed and the syntax check covered 132 JavaScript files. The Docker rehearsal passed initial migration, browser navigation from the platform menu to the security events table, a structured/raw JSON join on each community, platform queries, query auditing, row and time limits, and denial of writes, credential columns, downloads and unknown databases. A new account appeared in the next SQL query while the community was running. Failed-release recovery, a second release and denial after logout passed. A separate projector check loaded a third inventory ID using a disposable community volume. Production-sized refresh cost remains unmeasured.
