---
name: Orval path and query parameter collision
description: Codegen can emit duplicate parameter names when a single operation combines path and query parameters.
---

Orval can generate a Zod `OperationParams` schema for path parameters and a TypeScript `OperationParams` type for query parameters when the same operation has both. The generated `api-zod` barrel then fails with TS2308.

**Why:** A chat lookup endpoint combining a group/conversation path ID with search query parameters triggered this collision during codegen.

**How to apply:** For lookup/search endpoints that need both an entity identifier and filters, consider a query-only operation with the identifier included as a query parameter, then enforce exactly one authorized scope in the route. Re-run codegen and `typecheck:libs` after API contract edits.
