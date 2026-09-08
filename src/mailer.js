const SITE = "https://www.onedailydrop.com";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

/*
 * `unsubscribeUrl` is not decoration on a marketing email.
 *
 * A bulk message with no way out breaks CAN-SPAM in the United States, and
 * mailbox providers read the List-Unsubscribe header directly: without it the
 * only way a recipient can stop the mail is to mark it as spam, which is the
 * one action that damages the sending domain for everybody else.
 *
 * List-Unsubscribe-Post is RFC 8058 one-click. Gmail and Outlook then show an
 * Unsubscribe button of their own and POST to the URL; the route accepts that
 * as well as a plain visit.
 */
const sendEmail = async ({to, toName, subject, html, unsubscribeUrl}) => {
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
      ...(unsubscribeUrl
        ? {
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
          }
        }
        : {}),
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

const subscriptionEmail = ({email, categories, unsubscribeUrl}) => sendEmail({
  to: email,
  subject: "You’re subscribed to OneDailyDrop",
  unsubscribeUrl,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">Your Daily Drop is on the way</h1>
      <p>We’ll send new OneDailyDrop updates to <strong>${escapeHtml(email)}</strong>.</p>
      ${categories.length ? `<p>Your interests: ${categories.map(escapeHtml).join(", ")}.</p>` : ""}
      <p><a href="${SITE}" style="color:#d95600;font-weight:bold">Visit OneDailyDrop</a></p>
      ${unsubscribeUrl ? `<p style="margin-top:28px;font-size:13px;color:#6b7280">
        You are receiving this because you subscribed at OneDailyDrop.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a> — one click, no sign-in.
      </p>` : ""}
    </div>`
});

const clubWaitlistEmail = ({email}) => sendEmail({
  to: email,
  subject: "You’re on the OneDailyDrop Club waitlist",
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">You’re on the Club waitlist</h1>
      <p>We’ll let <strong>${escapeHtml(email)}</strong> know when OneDailyDrop Club is ready.</p>
      <p>Until then, the Daily Drop and all public product picks remain free.</p>
      <p><a href="${SITE}" style="color:#d95600;font-weight:bold">Visit OneDailyDrop</a></p>
    </div>`
});

/*
 * The reminder somebody asked for when they could not stay on the page.
 *
 * The price is not in it, and is not available to the sender either: the drop
 * price is withheld until the drop opens. An email that gave it away would
 * remove the only reason to arrive on time.
 *
 * Sent ahead of the start rather than at it, so there is time to open it. The
 * link goes to the market the reminder was asked for from — a shopper in
 * Germany sent to the American page would see the wrong currency for a product
 * they cannot buy.
 */
const liveDropReminderEmail = ({ email, title, market, minutes }) => sendEmail({
  to: email,
  subject: `Your Live Drop opens in ${minutes} minutes`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">It opens in ${minutes} minutes</h1>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p>Limited stock, ten minutes, one price. The price is revealed the moment it opens.</p>
      <p style="margin:28px 0"><a href="${SITE}/${encodeURIComponent(market)}/live" style="background:#ff6b00;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">Open the drop</a></p>
      <p>You asked us for this one reminder. There is nothing else to unsubscribe from.</p>
    </div>`
});

/*
 * A message whose only job is to prove the pipe works.
 *
 * Mail delivery was unconfigured for weeks and the only way to find out was to
 * schedule a drop, collect a reminder, and notice nothing arrived — by which
 * point the drop had happened. This fails in ten seconds instead, and the
 * caller passes the provider's own words back rather than a shrug.
 */
const deliveryTestEmail = ({ to }) => sendEmail({
  to,
  subject: "OneDailyDrop delivery test",
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:20px">Delivery works</h1>
      <p>This message was sent from the OneDailyDrop admin console to prove that
      mail leaves the site and arrives. Nobody was subscribed to anything.</p>
      <p style="color:#6b7280;font-size:13px">Check the headers: DKIM and DMARC
      should both pass, and the signing domain should be onedailydrop.com rather
      than sendgrid.net.</p>
    </div>`
});

/*
 * The one email a new account gets, and the only moment the site has their
 * attention with nothing to sell yet.
 *
 * Registration used to send nothing at all — not through Google, not through
 * the form — so a typo in an address went unnoticed until somebody tried to
 * reset a password they could never receive. That is the first job here:
 * proving the address is real, on the day it is given.
 *
 * The second is that signing up and subscribing are different things, and the
 * site had no way to turn one into the other. Somebody who made an account is
 * the warmest person it will ever have; asking them here costs nothing and is
 * the only place the question gets asked at all.
 *
 * Transactional, so it carries no unsubscribe of its own — there is nothing
 * to unsubscribe from until they say yes.
 */
const welcomeEmail = ({ name, email, market = "us" }) => sendEmail({
  to: email,
  toName: name,
  subject: "Your OneDailyDrop account is ready",
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">Welcome${name ? `, ${escapeHtml(name)}` : ""}</h1>
      <p>Your account at <strong>${escapeHtml(email)}</strong> is ready. Anything you save
      now stays with it, so it is still there on your phone tomorrow.</p>

      <p style="margin-top:24px">Two things worth knowing:</p>
      <ul style="padding-left:18px;line-height:1.7">
        <li>Every listing is checked before it is shown, and where a signal is
        missing we say so rather than filling the gap.</li>
        <li>A <strong>Live Drop</strong> is one product at one price for ten
        minutes. There is no way to hear about one unless you ask.</li>
      </ul>

      <p style="margin:28px 0"><a href="${SITE}/${encodeURIComponent(market)}#subscribe" style="background:#ff6b00;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">Tell us what you shop for</a></p>

      <p style="color:#6b7280;font-size:13px">You are getting this because an
      account was created at OneDailyDrop with this address. If that was not
      you, ignore this and nothing else will be sent.</p>
    </div>`
});

module.exports = { welcomeEmail, passwordResetEmail, subscriptionEmail, clubWaitlistEmail, liveDropReminderEmail, deliveryTestEmail };
