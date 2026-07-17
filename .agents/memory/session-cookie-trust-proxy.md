---
name: Secure session cookies behind Replit proxy
description: Production login 200 followed by immediate 401s means the secure cookie was never set.
---
Rule: with `cookie.secure: true` in production, Express must have `app.set("trust proxy", 1)` or express-session silently refuses to set the session cookie behind Replit's HTTPS-terminating proxy.
**Why:** July 2026 incident — published app: employee/management login returned 200 but every following `/api/auth/me` was 401; dev was unaffected because `secure` is false there.
**How to apply:** any Express app deployed on Replit with secure cookies needs trust proxy; diagnose by the 200-login-then-401 pattern in deployment logs.
