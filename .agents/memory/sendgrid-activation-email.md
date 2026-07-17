---
name: SendGrid activation emails
description: How activation emails are sent and the constraints on the SendGrid connection
---

- Activation emails go through the Replit SendGrid connection (`@replit/connectors-sdk` proxy). The only verified sender is `info@contentafrica.com` — any other from-address will be rejected.
- **Why:** SendGrid requires sender verification; the connector account has exactly one verified sender.
- Sends must stay non-fatal: employee creation/resend succeed even if the email fails, with a company notification reporting success or failure.
- Known failure mode: SendGrid returns 401 "Maximum credits exceeded" when the user's SendGrid plan is out of email credits — code is fine; user must top up/upgrade in SendGrid.
- SendGrid `POST /v3/mail/send` returns 202 with an empty body — never call `.json()` on success.
- `listConnections("sendgrid")` in the CodeExecution sandbox can return `[]` even when the connection is added (credentials withheld); test connector calls from a script inside the workspace instead.
