---
name: Express error-log crash
description: Production API restarts have been triggered while Express 5 logs an error under Node 24.
---

Deployment logs have shown Express 5's default `app.logerror` path crashing inside Node 24 `util.inspect` with `Cannot read properties of undefined (reading 'value')`. The logging failure hides the original request error; a health check can return 200 again after the service restarts.

**Why:** Treating the `util.inspect` stack as the original route failure led to ambiguous diagnosis; the error logger itself is the observed crash point.

**How to apply:** If this stack reappears, inspect the error-handling path and capture the original error safely before attributing the failure to a specific endpoint.
