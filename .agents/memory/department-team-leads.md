---
name: Department team leads
description: Assignment and integrity rules for department Team Leads and team work reports.
---

Treat a department's Team Lead as an active employee assigned to that same department. Managed chat teams have their own explicit active employee membership and Team Lead; validate the lead as a member and enforce that assignment again when submitting team reports. Custom team reports retain a team-name snapshot. Clear lead assignments and memberships when an employee is archived or deleted; department leads remain supported for legacy department reports.

Employees can read work reports only for managed teams they currently belong to; department membership must not grant access to reports from other teams. Management retains company-wide access.

**Why:** a department can contain multiple teams, so department-wide report visibility exposes work to employees outside the submitting team. The user explicitly requires team-only visibility.

**How to apply:** scope employee report reads to the employee's current managed-team memberships, not authorship or department membership. Preserve company and active-status checks; management retains company-wide access. Keep archive/delete cleanup synchronized with managed-team assignments.
