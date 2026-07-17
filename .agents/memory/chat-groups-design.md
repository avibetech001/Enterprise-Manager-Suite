---
name: Chat groups design
description: How team chat group membership and file auth work in the EMS
---

Group chat has NO membership table. Groups are derived at request time:
- `company` group id = every user in the company (satisfies "new employees are automatically in the group").
- `dept-<id>` group id = users whose departmentId matches, plus all management users (role != employee). Creating a department implicitly creates its group (satisfies auto-group-per-department).

**Why:** derived membership means no sync hooks on employee creation/department assignment — it can never drift.

**How to apply:** any new chat feature (unread counts, more group kinds) must go through `resolveGroup()` in the chat routes for access checks; mentions must also be filtered to the resolved group member set, not just the company. Chat attachments are authorized in the storage download route by matching `chat_messages.file_path` with company + department scope. Messages query newest-200 desc then reversed. "Assign project to group" is frontend-only: the department select in the project dialog adds that department's active employees to memberIds.
