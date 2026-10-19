import { ReplitConnectors } from "@replit/connectors-sdk";

const FROM_EMAIL = "info@contentafrica.com";
const FROM_NAME = "5th Element HR";

/**
 * Sends the account activation email to a new employee's work email.
 * Returns true when SendGrid accepts the message; false on any failure
 * (failures are logged but must not block employee creation).
 */
export async function sendActivationEmail(options: {
  to: string;
  employeeName: string;
  activationLink: string;
}): Promise<boolean> {
  const { to, employeeName, activationLink } = options;
  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("sendgrid", "/v3/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: employeeName }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: "Activate your 5th Element employee account",
        content: [
          {
            type: "text/plain",
            value: [
              `Hi ${employeeName},`,
              "",
              "An employee account has been created for you at 5th Element.",
              "Click the link below to verify your email and set your password:",
              "",
              activationLink,
              "",
              "This link expires in 24 hours. If it has expired, ask HR to resend it.",
              "",
              "— 5th Element HR",
            ].join("\n"),
          },
          {
            type: "text/html",
            value: `
              <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">
                <h2 style="margin:0 0 16px;">Welcome to 5th Element</h2>
                <p>Hi ${escapeHtml(employeeName)},</p>
                <p>An employee account has been created for you. Click the button below to verify your email and set your password.</p>
                <p style="margin:28px 0;">
                  <a href="${activationLink}" style="background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;">Activate my account</a>
                </p>
                <p style="font-size:13px;color:#666;">Or copy this link into your browser:<br/><a href="${activationLink}">${activationLink}</a></p>
                <p style="font-size:13px;color:#666;">This link expires in 24 hours. If it has expired, ask HR to resend it.</p>
                <p style="font-size:13px;color:#666;">— 5th Element HR</p>
              </div>
            `,
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `Activation email to ${to} failed: ${response.status} ${detail}`,
      );
      return false;
    }
    // 202 Accepted with empty body — do not call .json().
    return true;
  } catch (error) {
    console.error(`Activation email to ${to} failed:`, error);
    return false;
  }
}

export async function sendQueryIssuedEmail(options: {
  to: string;
  employeeName: string;
  issuerName: string;
  category: string;
  amount?: string | null;
  reason: string;
}): Promise<boolean> {
  const { to, employeeName, issuerName, category, amount, reason } = options;
  const label =
    category === "deduction" ? "Deduction" : category === "fine" ? "Fine" : "Query";
  const details = [
    `${label} issued by: ${issuerName}`,
    amount ? `Amount: ${amount}` : "",
    "",
    "Reason:",
    reason,
  ].filter((line, index) => line !== "" || index >= 2).join("\n");

  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("sendgrid", "/v3/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: employeeName }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `A ${label.toLowerCase()} has been issued to you`,
        content: [
          {
            type: "text/plain",
            value: [
              `Hi ${employeeName},`,
              "",
              `Management has issued a ${label.toLowerCase()} to you.`,
              "",
              details,
              "",
              "You can review it in your employee portal and discuss it through your private chat.",
              "",
              "— 5th Element HR",
            ].join("\n"),
          },
          {
            type: "text/html",
            value: `
              <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
                <h2 style="margin:0 0 16px;">A ${label.toLowerCase()} has been issued to you</h2>
                <p>Hi ${escapeHtml(employeeName)},</p>
                <p>Management has issued a ${label.toLowerCase()} to you.</p>
                <p><strong>Issued by:</strong> ${escapeHtml(issuerName)}</p>
                ${amount ? `<p><strong>Amount:</strong> ${escapeHtml(amount)}</p>` : ""}
                <p><strong>Reason:</strong></p>
                <p style="white-space:pre-wrap;">${escapeHtml(reason)}</p>
                <p>You can review it in your employee portal and discuss it through your private chat.</p>
                <p style="font-size:13px;color:#666;">— 5th Element HR</p>
              </div>
            `,
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Query email to ${to} failed: ${response.status} ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Query email to ${to} failed:`, error);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
