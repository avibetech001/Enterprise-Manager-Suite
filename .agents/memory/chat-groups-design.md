---
name: Chat groups design
description: How team chat group membership and file auth work in the EMS
---

Group chat has NO membership table. Groups are derived at request time:
- `company` group id = every user in the company (satisfies "new employees are automatically in the group").
- `dept-<id>` group id = users whose department matches, plus super_admin users (bypass in both resolveGroup() and the storage attachment route — keep them in sync). An employee's department lives in `employment_info.department_id` — the `users.department_id` column exists but is NEVER written; do not read it for authorization. Creating a department implicitly creates its group (satisfies auto-group-per-department).

**Why:** derived membership means no sync hooks on employee creation/department assignment — it can never drift.

**How to apply:** any new chat feature (unread counts, more group kinds) must go through `resolveGroup()` in the chat routes for access checks; mentions must also be filtered to the resolved group member set, not just the company. Chat attachments are authorized in the storage download route by matching `chat_messages.file_path` with company + department scope. Messages query newest-200 desc then reversed. "Assign project to group" is frontend-only: the department select in the project dialog adds that department's active employees to memberIds.

Private management-to-employee conversations are intentionally separate from derived groups. Each conversation has exactly two explicit participants, and every message, reply, deletion, listing, and attachment download must verify participant membership plus company scope. Only management initiates; the employee participant may reply.

**Why:** a null department already means the company-wide General room, so overloading group rows for direct messages would expose private content.

**How to apply:** do not route private messages through `resolveGroup()` or `chat_messages`. Keep direct-message authorization participant-based and preserve management-only initiation.
