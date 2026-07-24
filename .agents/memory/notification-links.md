---
name: Notification deep links
description: How in-app notification navigation works (role-agnostic link column)
---
Notifications have a nullable `link` column holding a role-agnostic path suffix (e.g. `chat?group=dept-3`, `appraisals`).
**Why:** employee and management routes differ (`/employee/chat` vs `/chat`), so links can't be stored absolute.
**How to apply:** pass `link` as the 5th arg to `notify()`; the bell (notifications-bell.tsx) prefixes `/employee/` or `/` by viewer role and falls back to a per-type map for old rows. Pages that receive query params (like chat's `?group=`) must react to wouter's `useSearch()`, not just read location on mount.
