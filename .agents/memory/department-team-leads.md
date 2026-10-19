---
name: Department team leads
description: Assignment and integrity rules for department Team Leads and team work reports.
---

Treat a department's Team Lead as an active employee assigned to that same department. Managed chat teams have their own explicit active employee membership and Team Lead; validate the lead as a member and enforce that assignment again when submitting team reports. Custom team reports retain a team-name snapshot. Clear lead assignments and memberships when an employee is archived or deleted; department leads remain supported for legacy department reports.

**Why:** a direct foreign key from departments to users creates a TypeScript inference cycle because users already reference departments. Management also needs teams that are not identical to departments, so custom chat teams own their membership and lead assignment.

**How to apply:** preserve server-side company, active-status, and team-membership checks when changing chat-team or report permissions. Keep archive/delete cleanup synchronized with both department and managed-team assignments.
