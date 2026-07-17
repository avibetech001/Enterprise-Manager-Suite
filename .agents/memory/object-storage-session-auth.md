---
name: Object storage with session auth
description: How file uploads/downloads are secured in this app (no Replit Auth)
---
The object-storage templates assume Replit Auth (`req.isAuthenticated()`). This app uses its own session auth, so storage routes check `req.currentUser` instead.

**Rule:** `GET /storage/objects/*` must authenticate BEFORE any object lookup (avoids an existence oracle) and must only serve files that belong to the requester's company — it looks up `projects.submission_file_path = objectPath AND company_id = me.companyId`. If new features store object paths elsewhere, extend that ownership check; a bare "logged-in" check is not enough (code review flagged this as broken access control).

**Also:** `format: uri` in openapi emits `zod.url()` which breaks the zod v3 catalog build — same class of problem as `format: email`. Use plain `type: string`.
