---
name: Attendance timezone convention
description: All EMS attendance day/time logic uses one explicit company timezone
---

Rule: every attendance decision (forDate keys, weekday for the weekly schedule, late/early minute comparisons) must go through the single `COMPANY_TZ` (Africa/Lagos) Intl-based helper in the api-server attendance module — never `new Date().getDay()/getHours()` or `toISOString().slice(0,10)` directly.

**Why:** the server runs in UTC; mixing UTC dates with server-local weekday/hours misclassified late/early, off-days, and daily record keys (caught in code review, July 2026).

**How to apply:** any new attendance-related endpoint or cron must derive date/weekday/minutes from the same tz helper. Frontend "today" filters are browser-local — acceptable for the single-country company, but be careful near midnight.

Also: browser `getCurrentPosition`'s `timeout` option does NOT cover an undecided permission prompt — always race it with a hard `setTimeout` or the flow hangs forever (broke QR auto check-in in headless tests).
