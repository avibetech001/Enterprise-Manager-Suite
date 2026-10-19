---
name: Orval zod email format
description: Why `format: email` must not be used in the OpenAPI spec of this monorepo
---

Rule: do not use `format: email` on string properties in `lib/api-spec/openapi.yaml`; use plain `type: string` and validate email shape in server code if needed.

**Why:** Orval v8 generates `zod.email()` (zod v4 top-level API) for `format: email`, but the workspace catalog pins zod v3, so `typecheck:libs` fails with TS2339 "Property 'email' does not exist" in `lib/api-zod/src/generated/api.ts`.

**How to apply:** whenever adding email fields to the OpenAPI spec, leave off the format; if codegen ever fails with that error, search the spec for `format: email`.

Keep security upgrades of Orval compatible with the existing code generator output; do not assume newer minor releases preserve the workspace's Zod v3 and fetch setup.

**Why:** Orval 8.43 generated top-level `zod.int()` calls incompatible with Zod v3 and `Headers.entries()` calls incompatible with the client's TypeScript libraries. The patched 8.22 release generated unchanged schemas and client behavior.

**How to apply:** run codegen and the full workspace typecheck when updating Orval. Prefer a patched compatible release over migrating validation libraries as part of a dependency-only security fix.
