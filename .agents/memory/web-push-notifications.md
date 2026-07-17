---
name: Web push notifications
description: How phone/device push notifications work in this app and the rules to keep them safe
---
Push piggybacks on `notify()` — every in-app notification also fires a best-effort web push to the same audience (specific user, or all management users when userId is null). Never make push failures fatal.

**Rules:**
- VAPID keys are server-generated and stored in a singleton DB row (fixed id=1, insert with onConflictDoNothing) — not env secrets, since the user can't supply them.
- Unsubscribe must be scoped to the current user (`endpoint AND user_id`); subscribe upserts by endpoint so a shared device rebinds to whoever logs in — that's intentional.
- Service worker lives at `public/sw.js`, registered with `import.meta.env.BASE_URL` prefix.
- iPhone requires Add to Home Screen before notifications work — mentioned in the UI card copy.
