---
name: Chat groups design
description: How team chat group membership and file auth work in the EMS
---

General and department chat membership is derived at request time:
- `company` includes every user in the company.
- `dept-<id>` includes employees whose department matches, plus super_admin users. An employee's department lives in `employment_info.department_id`; never use `users.department_id` for authorization.
- Management-created team chats use explicit `chat_teams` and `chat_team_members` rows. Only active, non-archived employee members and management with `manage_departments` can access them. Archived employees are removed from memberships and lead assignments.
- Growth and Brand Social Creative are not automatic rooms; create them as managed team chats if needed.

**Why:** company and department rooms should automatically reflect employment changes, while user-managed teams need explicit membership and lead assignment. The fixed Growth and Creative rooms were removed so management can create the desired teams manually.

**How to apply:** group access must go through `resolveGroup()`; mentions and team-report submissions must use the resolved/assigned member set. Keep private team attachment checks in the storage route synchronized with group access, including manager permission and active team membership. Messages query newest-200 desc then reverse. Team report rows retain a team-name snapshot if a managed team is deleted.

Private management-to-employee conversations are intentionally separate from derived groups. Each conversation has exactly two explicit participants, and every message, reply, deletion, listing, and attachment download must verify participant membership plus company scope. Only management initiates; the employee participant may reply.

**Why:** a null department already means the company-wide General room, so overloading group rows for direct messages would expose private content.

**How to apply:** do not route private messages through `resolveGroup()` or `chat_messages`. Keep direct-message authorization participant-based and preserve management-only initiation.
