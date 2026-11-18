# Temporary database target diagnostic (local candidate)

This change is disabled unless explicitly configured. It does not publish or
modify database content. The route is POST-only, calls the existing admin-cookie
verification itself, accepts no target or SQL from the caller, and always sends
private no-store headers. The existing admin proxy returns 401 for an
unauthorized caller; the route returns 404 for disabled configuration or a
failed route-level authorization check. No URL, host, user, password, source digest, raw database identifier
or SQL error is returned or logged by the diagnostic.

For a future, separately reviewed deployment, supply the project reference and
the independent candidate identity digest using secret deployment configuration,
plus UTC epoch-millisecond `DATABASE_TARGET_DIAGNOSTIC_FROM_MS` and
`DATABASE_TARGET_DIAGNOSTIC_UNTIL_MS`. The absolute interval must be at most
five minutes; outside that interval, in non-production deployments, or with
missing/invalid configuration, the route is unavailable. Setting or removing
deployment variables may require a new deployment and affect deployment timing;
old instances may persist until convergence. Do not put credentials in URLs,
shell history, build output or issue comments. Remove temporary settings after use.
The repository's existing `vercel-build` runs `scripts/migrate.ts` before the
Next build, so a production deployment may run database migrations independently
of this read-only route. Review the actual deployment settings, migration effects,
and active instances before making any deployment; this candidate has not been
independently reviewed or deployed.

An authorized operator must independently derive the expected identity digest
from the *candidate* database using a verified TLS connection and a read-only
transaction. The exact formula is SHA-256 of UTF-8 JSON serialization of an
array `[system_identifier_as_decimal_string, current_database_name]`; the
first value is selected from `pg_catalog.pg_control_system()` and the second
from `current_database()`. Do not use the application's public Supabase URL to
assume its database identity. The digest is an operational comparison input,
not an authorization or proof of a provider project mapping.

The two outputs are `configuredRefMatches` and `databaseIdentityMatches`, each
true, false or null (unknown). The first compares the fixed expected reference
against the actual cached postgres.js connection options, using only recognized
Supabase direct and shared-pooler formats. The second runs one read-only
transaction on the application's existing connection and compares the PostgreSQL
system identifier and database name with the independent digest. A denied
function, connection issue or unexpected data returns null. Database identifier
matching cannot distinguish physical replicas of one cluster, does not establish
TLS peer identity, cannot establish all replicas or regions have converged, and
does not replace authenticated entry-point tests, permission checks, or the
reviewed release gates. The existing app connection uses `ssl: 'require'`;
the diagnostic does not silently assert certificate validation.

Tests are local only. Use an isolated PostgreSQL database named
`tuji_diagnostic_test` on `127.0.0.1`, set
`TUJI_DIAGNOSTIC_TEST_DATABASE_URL` to its synthetic connection, then run
`npx tsx --test tests/database-target-diagnostic.test.ts`. Never point this
test at a real database. Test evidence does not prove the provider permits the
read-only system function or that any real deployment is configured.
