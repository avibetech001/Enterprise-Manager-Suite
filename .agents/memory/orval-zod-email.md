---
name: Orval zod email format
description: Why `format: email` must not be used in the OpenAPI spec of this monorepo
---

Rule: do not use `format: email` on string properties in `lib/api-spec/openapi.yaml`; use plain `type: string` and validate email shape in server code if needed.

**Why:** Orval v8 generates `zod.email()` (zod v4 top-level API) for `format: email`, but the workspace catalog pins zod v3, so `typecheck:libs` fails with TS2339 "Property 'email' does not exist" in `lib/api-zod/src/generated/api.ts`.

**How to apply:** whenever adding email fields to the OpenAPI spec, leave off the format; if codegen ever fails with that error, search the spec for `format: email`.
