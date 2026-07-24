const SITE = "https://www.onedailydrop.com";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

const sendEmail = async ({to, toName, subject, html}) => {
  const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const fromEmail = String(process.env.EMAIL_FROM || process.env.PASSWORD_RESET_FROM_EMAIL || "account@onedailydrop.com").trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || "info@onedailydrop.com").trim();
  if (!apiKey) {
    const error = new Error("Email delivery is not configured.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{to: [{email: to, name: toName || undefined}]}],
      from: {email: fromEmail, name: "OneDailyDrop"},
      reply_to: {email: replyTo, name: "OneDailyDrop Support"},
      subject,
      content: [{type: "text/html", value: html}]
    })
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    const error = new Error(`Email provider rejected the message (${response.status}).`);
    error.code = "EMAIL_PROVIDER_ERROR";
    error.details = details;
    throw error;
  }
};

const passwordResetEmail = ({name, email, token}) => sendEmail({
  to: email,
  toName: name,
  subject: "Reset your OneDailyDrop password",
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">Reset your password</h1>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received a request to reset your OneDailyDrop password. This secure link expires in one hour.</p>
      <p style="margin:28px 0"><a href="${SITE}/reset-password?token=${encodeURIComponent(token)}" style="background:#ff6b00;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">Choose a new password</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>`
});

const subscriptionEmail = ({email, categories}) => sendEmail({
  to: email,
  subject: "You’re subscribed to OneDailyDrop",
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">Your Daily Drop is on the way</h1>
      <p>We’ll send new OneDailyDrop updates to <strong>${escapeHtml(email)}</strong>.</p>
      ${categories.length ? `<p>Your interests: ${categories.map(escapeHtml).join(", ")}.</p>` : ""}
      <p><a href="${SITE}" style="color:#d95600;font-weight:bold">Visit OneDailyDrop</a></p>
    </div>`
});

module.exports = { passwordResetEmail, subscriptionEmail };
