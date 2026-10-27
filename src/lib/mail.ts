import "server-only";
import nodemailer from "nodemailer";

// Sends the app's own emails (temporary passwords) over SMTP. Works with Gmail (app password),
// Zoho, Brevo, Resend or any SMTP provider. Supabase's auth emails can't carry a password.

export type MailResult = { sent: true } | { sent: false; reason: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function send(to: string, subject: string, text: string, html: string): Promise<MailResult> {
  if (!mailConfigured()) return { sent: false, reason: "Email isn’t set up on the server yet (SMTP settings)." };
  const port = Number(process.env.SMTP_PORT) || 465;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: process.env.SMTP_FROM || `Meld <${process.env.SMTP_USER}>`, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "The email server refused the message." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Welcome email (new account) or reset email (new temporary password set by an admin). */
export function sendTempPassword(v: { to: string; name: string; password: string; kind: "welcome" | "reset" }): Promise<MailResult> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const signin = `${site}/signin`;
  const first = v.name.trim().split(/\s+/)[0] || "there";
  const subject = v.kind === "welcome" ? "Your Meld Ops account" : "Your new Meld Ops password";
  const lead =
    v.kind === "welcome"
      ? "An account has been created for you on Meld Ops, Meld’s operations app."
      : "An admin has set a new temporary password for your Meld Ops account. Your old password no longer works.";

  const text = [
    `Hi ${first},`,
    "",
    lead,
    "",
    `Sign in: ${signin}`,
    `Email: ${v.to}`,
    `Temporary password: ${v.password}`,
    "",
    "When you sign in, you’ll be asked to choose your own password. The temporary one then stops working.",
    "Don’t share this email. If you weren’t expecting it, tell your Meld admin.",
    "",
    "Meld Logistics Company Ltd",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f0;font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#0c1410">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d3dcd2;border-radius:10px">
<tr><td style="background:#0c1410;border-radius:10px 10px 0 0;padding:18px 24px;font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:.06em;color:#ffffff">MELD</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 18px">${esc(lead)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f2f5f0;border-radius:6px;margin:0 0 18px"><tr><td style="padding:14px 16px;font-size:15px">
<div style="color:#4e6a5c;font-size:13px">Email</div><div style="margin-bottom:10px">${esc(v.to)}</div>
<div style="color:#4e6a5c;font-size:13px">Temporary password</div><div style="font-family:Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:.04em">${esc(v.password)}</div>
</td></tr></table>
<p style="margin:0 0 18px"><a href="${esc(signin)}" style="display:inline-block;background:#b6f542;color:#0c1410;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:6px">Sign in to Meld Ops</a></p>
<p style="margin:0 0 8px">When you sign in, you’ll be asked to choose your own password. The temporary one then stops working.</p>
<p style="margin:0;color:#4e6a5c;font-size:14px">Don’t share this email. If you weren’t expecting it, tell your Meld admin.</p>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #d3dcd2;color:#4e6a5c;font-size:13px">MELD Logistics Company Ltd · Lagos</td></tr>
</table></td></tr></table></body></html>`;

  return send(v.to, subject, text, html);
}
