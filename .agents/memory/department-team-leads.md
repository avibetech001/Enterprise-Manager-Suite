---
name: Department team leads
description: Assignment and integrity rules for department Team Leads and team work reports.
---

Treat a department's Team Lead as an active employee assigned to that same department. Validate the relationship in management APIs and enforce it again when submitting reports. Clear assignments when an employee changes department, is deactivated, archived, or deleted.

**Why:** a direct foreign key from departments to users creates a TypeScript inference cycle because users already reference departments; the database schema push/typecheck failed with recursive-initializer errors.

**How to apply:** preserve the server-side membership/company checks and employee lifecycle cleanup if changing team-lead schema or report permissions.
