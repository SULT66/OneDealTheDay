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

/*
 * The two reminders that come before the ten-minute one.
 *
 * A drop lasts ten minutes on a fixed clock. A single warning ten minutes
 * ahead reaches whoever happens to be holding their phone; it cannot reach
 * somebody who would have arranged an evening around it. The day before is
 * when a plan gets made and the hour before is when it gets kept.
 *
 * The price is in none of them, and is not available to the sender either:
 * it is revealed when the drop opens, and giving it away removes the only
 * reason to arrive on time.
 */
/*
 * One shape for every Live Drop email.
 *
 * They were four separate blocks of ad-hoc HTML: a heading, the product's
 * name as bare text, and an orange button — orange, on a site whose accent
 * has been lime for months. Nothing showed the thing being sold. An email
 * announcing a ten minute event for one product, with no picture of the
 * product, is asking somebody to care on trust.
 *
 * Table-based and inline-styled because that is what mail clients render;
 * Outlook has no flexbox and Gmail strips a stylesheet.
 */
const LIME = "#b8ec44";
const INK = "#010101";
const GRAPHITE = "#434343";

const dropEmailLayout = ({ eyebrow, heading, title, brand, retailerName, retailPrice, currency, imageUrl, line, ctaLabel, ctaHref, footer }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f6;padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="background:${GRAPHITE};padding:18px 24px">
        <span style="color:#ffffff;font-size:15px;font-weight:bold;letter-spacing:.02em">OneDailyDrop</span>
        <span style="color:${LIME};font-size:15px;font-weight:bold"> LIVE</span>
        ${eyebrow ? `<div style="color:rgba(255,255,255,.72);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-top:6px">${escapeHtml(eyebrow)}</div>` : ""}
      </td></tr>

      ${imageUrl ? `<tr><td style="padding:0">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" width="560"
          style="display:block;width:100%;max-width:560px;height:auto;border:0;background:#f6f6f6">
      </td></tr>` : ""}

      <tr><td style="padding:24px">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:${INK}">${escapeHtml(heading)}</h1>
        ${brand ? `<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin-bottom:4px">${escapeHtml(brand)}</div>` : ""}
        <div style="font-size:17px;font-weight:bold;color:${INK}">${escapeHtml(title)}</div>
        ${retailerName ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">Sold and shipped by ${escapeHtml(retailerName)}</div>` : ""}

        ${retailPrice ? `<div style="margin-top:14px">
          <span style="font-size:15px;color:#6b7280;text-decoration:line-through">${escapeHtml(currency || "")} ${escapeHtml(retailPrice)}</span>
          <span style="font-size:13px;color:#6b7280;margin-left:8px">usual price</span>
        </div>` : ""}

        <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#374151">${line}</p>

        <p style="margin:24px 0 0">
          <a href="${ctaHref}" style="background:${LIME};color:${INK};text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block">${escapeHtml(ctaLabel)}</a>
        </p>
      </td></tr>

      ${footer ? `<tr><td style="padding:0 24px 22px;font-size:12px;line-height:1.6;color:#9ca3af">${footer}</td></tr>` : ""}
    </table>
  </div>`;

const dropUrl = (market) => `${SITE}/${encodeURIComponent(market)}/live`;

/* The unsubscribe line, in the two forms these emails need. A reminder was
   asked for and has nothing to leave; an announcement is marketing and must
   always carry the way out. */
const unsubscribeFooter = (unsubscribeUrl, because) => (unsubscribeUrl
  ? `${escapeHtml(because)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af">Unsubscribe</a> — one click, no sign-in.`
  : "");

const liveDropSaveTheDateEmail = ({ email, title, market, startsAt, unsubscribeUrl, brand, retailerName, retailPrice, currency, imageUrl }) => sendEmail({
  to: email,
  subject: `Tomorrow: ${title}`,
  unsubscribeUrl,
  html: dropEmailLayout({
    eyebrow: "Tomorrow",
    heading: "Your Live Drop is tomorrow",
    title, brand, retailerName, retailPrice, currency, imageUrl,
    line: `One product, one price, ten minutes. It opens <strong>${escapeHtml(startsAt)}</strong>. The price is revealed when it opens, not before.`,
    ctaLabel: "See the drop page",
    ctaHref: dropUrl(market),
    footer: unsubscribeFooter(unsubscribeUrl, "You asked to be reminded about this drop."),
  }),
});

const liveDropStartingSoonEmail = ({ email, title, market, minutes, brand, retailerName, retailPrice, currency, imageUrl }) => sendEmail({
  to: email,
  subject: `Opens in ${minutes} minutes: ${title}`,
  html: dropEmailLayout({
    eyebrow: `In ${minutes} minutes`,
    heading: `It opens in ${minutes} minutes`,
    title, brand, retailerName, retailPrice, currency, imageUrl,
    line: "Ten minutes, then it is gone. The price appears the moment it opens.",
    ctaLabel: "Open the drop",
    ctaHref: dropUrl(market),
    /* Nothing to unsubscribe from: this is the thing they asked for, and
       offering an exit from a one-off they requested reads as a mistake. */
    footer: "You asked us for this one. There is nothing else to unsubscribe from.",
  }),
});

/*
 * The announcement to the subscriber list.
 *
 * Different from a reminder in the one way that matters: these people never
 * asked about this drop. They subscribed to the site, so this is marketing and
 * carries a way out — and it is sent once, well ahead, never chased.
 */
const liveDropAnnouncementEmail = ({ email, title, market, startsAt, unsubscribeUrl, brand, retailerName, retailPrice, currency, imageUrl }) => sendEmail({
  to: email,
  subject: `A Live Drop is coming: ${title}`,
  unsubscribeUrl,
  html: dropEmailLayout({
    eyebrow: "One product. One price. Ten minutes.",
    heading: "A Live Drop is coming",
    title, brand, retailerName, retailPrice, currency, imageUrl,
    line: `Opens <strong>${escapeHtml(startsAt)}</strong>. The price is revealed the moment it does — press the button and we will remind you.`,
    ctaLabel: "Remind me when it opens",
    ctaHref: dropUrl(market),
    footer: unsubscribeFooter(unsubscribeUrl, "You are receiving this because you subscribed at OneDailyDrop."),
  }),
});
/*
 * A price this person was watching has fallen.
 *
 * Both numbers are in it, because "cheaper" without them is an advertisement
 * and this is supposed to be information. The comparison is against the price
 * on the day they asked, not against a reference price somebody else set.
 */
/*
 * Confirmation that we are now watching a price.
 *
 * Leaving a form and receiving nothing reads as a form that did not work.
 * The watch was being saved correctly and silently, which is the same thing
 * as broken from the other side of the screen: the first person to use it
 * assumed it had failed, and was right to.
 *
 * It also says the price it will compare against, because "we will tell you
 * if it gets cheaper" is only a promise if the number it is measured from
 * is written down somewhere the person can see.
 */
const priceWatchStartedEmail = ({ email, title, market, dealPath, price, currency, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: `Watching the price of ${title}`,
  unsubscribeUrl,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">We are watching it</h1>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p style="font-size:20px"><strong>${escapeHtml(currency)} ${escapeHtml(price)}</strong></p>
      <p style="color:#6b7280;font-size:14px">That is today&rsquo;s price, and the one we will measure against.
      If it drops, you get one email. If it does not, you hear nothing more about it.</p>
      <p style="margin:28px 0"><a href="${SITE}${escapeHtml(dealPath)}" style="background:#ff6b00;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">See the listing</a></p>
      <p style="color:#6b7280;font-size:13px">No account was created and you are not on any mailing list.</p>
      ${unsubscribeUrl ? `<p style="margin-top:20px;font-size:13px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Stop watching this</a></p>` : ""}
    </div>`
});
const priceDropEmail = ({ email, title, market, dealPath, was, now, currency, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: `${title} is cheaper than when you looked`,
  unsubscribeUrl,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17191d">
      <h1 style="font-size:24px">The price dropped</h1>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p style="font-size:20px"><strong>${escapeHtml(currency)} ${escapeHtml(now)}</strong>
      <span style="color:#6b7280;text-decoration:line-through;margin-left:8px">${escapeHtml(currency)} ${escapeHtml(was)}</span></p>
      <p style="color:#6b7280;font-size:14px">That is against the price on the day you asked us to watch it.</p>
      <p style="margin:28px 0"><a href="${SITE}${escapeHtml(dealPath)}" style="background:#ff6b00;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">See it</a></p>
      <p style="color:#6b7280;font-size:13px">Prices move. Check the current one at the shop before buying.</p>
      ${unsubscribeUrl ? `<p style="margin-top:20px;font-size:13px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Stop watching this</a></p>` : ""}
    </div>`
});

module.exports = { welcomeEmail, liveDropSaveTheDateEmail, liveDropStartingSoonEmail, liveDropAnnouncementEmail, priceDropEmail, priceWatchStartedEmail, passwordResetEmail, subscriptionEmail, clubWaitlistEmail, liveDropReminderEmail, deliveryTestEmail };
