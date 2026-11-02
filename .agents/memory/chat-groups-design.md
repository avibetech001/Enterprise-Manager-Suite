---
name: Chat groups design
description: How team chat group membership and file auth work in the EMS
---

General and department chat membership is derived at request time:
- `company` includes every user in the company.
- `dept-<id>` includes employees whose department matches, plus active super_admin users. An employee's department lives in `employment_info.department_id`; never use `users.department_id` for authorization.
- Management-created team chats use explicit `chat_teams` and `chat_team_members` rows. Active, non-archived employee members can access assigned teams; active super_admin users can access all teams. Other management roles do not get automatic cross-team access. Archived employees are removed from memberships and lead assignments.
- Growth and Brand Social Creative are not automatic rooms; create them as managed team chats if needed.

**Why:** company and department rooms should automatically reflect employment changes, while user-managed teams need explicit membership and lead assignment. The user specified that only super admins should be included across every group.

**How to apply:** group access must go through `resolveGroup()`; mentions, unread counts, and team-report submissions must use the resolved/assigned member set. Include active super admins in every group's member list and `@all` recipients. Keep private team attachment checks in the storage route synchronized with group access. Messages query newest-200 desc then reverse. Team report rows retain a team-name snapshot if a managed team is deleted.

The `@management` group-chat mention targets active super admins only. It does not grant HR or other management roles new access; super admins already have access to all department and managed-team chats.

**Why:** the user specified that `@management` should mean “just super admin.”

**How to apply:** include only active `super_admin` users as recipients of this special mention and preserve existing group access rules for other roles.

Private management-to-employee conversations are intentionally separate from derived groups. Each conversation has exactly two explicit participants, and every message, reply, deletion, listing, and attachment download must verify participant membership plus company scope. Only management initiates; the employee participant may reply.

**Why:** a null department already means the company-wide General room, so overloading group rows for direct messages would expose private content.

**How to apply:** do not route private messages through `resolveGroup()` or `chat_messages`. Keep direct-message authorization participant-based and preserve management-only initiation.
