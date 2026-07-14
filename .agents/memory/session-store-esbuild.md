---
name: connect-pg-simple in esbuild bundles
description: Why createTableIfMissing silently breaks sessions in the bundled api-server
---
Rule: keep `createTableIfMissing: false` for connect-pg-simple in the api-server; the `session` table must exist in the database (created manually / via setup SQL).

**Why:** esbuild bundles don't include connect-pg-simple's `table.sql`, so `createTableIfMissing: true` throws ENOENT at runtime — sessions are never persisted and every request after login returns 401 even though login responds 200.

**How to apply:** if logins succeed but subsequent requests are 401, check the API logs for `ENOENT ... table.sql` and verify the `session` table exists (sid/sess/expire + IDX_session_expire index).

Also: `drizzle-kit push --force` DROPS tables not declared in the drizzle schema — the `session` table must stay declared in `lib/db/src/schema/session.ts` or push will silently delete it and every request 500s with `relation "session" does not exist`.
