---
name: orval breaks with js-yaml v5
description: Security override forcing js-yaml >=5 breaks orval codegen; keep the orval>js-yaml exemption in pnpm-workspace.yaml
---

The security dependency overrides in `pnpm-workspace.yaml` force `js-yaml: ">=5.2.3"`, but orval (dev-only codegen) imports js-yaml's v4 default export and fails with "does not provide an export named 'default'".

**Why:** js-yaml v5 removed the default export; orval hasn't migrated.

**How to apply:** keep the scoped override `"orval>js-yaml": "^4.1.0"` in pnpm-workspace.yaml. If codegen ever fails with that error again after dependency updates, re-check this exemption survived.
