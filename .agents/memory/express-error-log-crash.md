---
name: Express error-log crash
description: Production API restarts have been triggered while Express 5 logs an error under Node 24.
---

Deployment logs have shown Express 5's default `app.logerror` path crashing inside Node 24 `util.inspect` with `Cannot read properties of undefined (reading 'value')`. In the observed employee-summary failure, the original error was response validation rejecting announcement rows that lacked the required `createdByName`.

**Why:** The error logger masked the response-contract mismatch and made the issue look like a generic Node crash.

**How to apply:** If this stack reappears, inspect the response shape at the route's validation boundary and capture the original error safely rather than attributing it to `util.inspect` alone.
