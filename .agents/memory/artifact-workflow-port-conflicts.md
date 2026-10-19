---
name: Artifact workflow port conflicts
description: How to recover when a managed artifact workflow fails because an older listener still owns its port.
---

When a managed workflow reports `EADDRINUSE` but its app still answers on the expected port, an older service process may remain alive after the workflow state changes. Confirm the listener with `lsof -iTCP:<port> -sTCP:LISTEN` and a local request. Stop only the app server process holding the port, then restart the existing managed workflow once. Keep the artifact's configured port and workflow; do not create a replacement workflow.

**Why:** duplicate starts produced a failed workflow status while the previous Vite and API processes continued serving requests.

**How to apply:** use this when restart logs show a port conflict and health/preview requests still return successfully.
