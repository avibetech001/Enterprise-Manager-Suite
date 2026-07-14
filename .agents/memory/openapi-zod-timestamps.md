---
name: OpenAPI nullable timestamps & enums
description: Rules for openapi.yaml so zod response parses don't 500 at runtime
---

**Rule 1:** Every timestamp field returned from drizzle (Date objects) must have `format: date-time` in openapi.yaml — including nullable ones (`type: ["string","null"]` + `format: date-time`). Without the format, orval emits `zod.string()` which throws "Expected string, received date" at parse time (500s that typecheck can't catch).

**Rule 2:** Backend permission keys live in TWO places: `PERMISSION_CATALOG` in api-server `lib/auth.ts` AND the `PermissionKey` enum in openapi.yaml. Adding a key only to the catalog makes login/session responses fail zod parse (500) for users holding the new key.

**Why:** Both bit during the employee-portal build (July 2026): check-out and management-login 500'd only at runtime; smoke tests via curl caught them.

**How to apply:** After adding endpoints/permissions, run codegen and curl-smoke the affected endpoints with a user that has the new data shape.
