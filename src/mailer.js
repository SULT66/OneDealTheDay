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
 *
 * Every message also carries a plain-text part. HTML-only mail is one of the
 * clearest signals of a bulk campaign, and the drop emails were landing in
 * Gmail's Promotions tab.
 */
const sendEmail = async ({to, toName, subject, html, text, unsubscribeUrl, fromName = "OneDailyDrop"}) => {
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
      from: {email: fromEmail, name: fromName},
      reply_to: {email: replyTo, name: "OneDailyDrop"},
      subject,
      ...(unsubscribeUrl
        ? {
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
          }
        }
        : {}),
      /*
       * No tracking. SendGrid's defaults rewrite every link through a
       * redirect and add an invisible open pixel, and both are what bulk
       * marketing looks like to Gmail: the letter from Chloe went to
       * Promotions with them. Our own links already record the click
       * (/live/go, /go) on arrival, so nothing is lost.
       */
      tracking_settings: {
        click_tracking: {enable: false, enable_text: false},
        open_tracking: {enable: false},
        subscription_tracking: {enable: false},
        ganalytics: {enable: false},
      },
      /* SendGrid requires text/plain before text/html. */
      content: [
        {type: "text/plain", value: text || plainTextFrom(html)},
        {type: "text/html", value: html},
      ]
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

/* A readable text version of an HTML email, for when none was written. */
function plainTextFrom(html) {
  return String(html || "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => `${label.replace(/<[^>]+>/g, "").trim()} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------------
 * One design for every email.
 *
 * They were a dozen blocks of ad-hoc HTML, some orange on a site whose accent
 * is lime, and the drop emails were built like a sale banner: a dark header,
 * a full-width product photo, a struck-through price. That is exactly the
 * shape mailbox providers file under Promotions.
 *
 * So every email is now a well set letter: a small wordmark, a clear heading,
 * a few sentences written to one person, the product as a compact card rather
 * than a hero image, one button, and a signature. It still looks like
 * OneDailyDrop, and it reads like something a person sent.
 *
 * Table-based and inline-styled because that is what mail clients render;
 * Outlook has no flexbox and Gmail strips a stylesheet.
 * ---------------------------------------------------------------------- */
const LIME = "#b8ec44";
const INK = "#010101";
const MUTED = "#5f6368";
const FAINT = "#9aa0a6";
const OLIVE = "#557a00";

const paragraphHtml = (text) =>
  `<p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#2b2f33">${text}</p>`;

/**
 * @param {object} message
 * @param {string} message.preheader  the grey line an inbox shows after the subject
 * @param {string} [message.eyebrow]
 * @param {string} message.heading
 * @param {string[]} message.paragraphs  HTML allowed; escape anything user-supplied
 * @param {object} [message.product]  { title, brand, retailerName, retailPrice, currency, imageUrl }
 * @param {{label: string, href: string}} [message.cta]
 * @param {string} [message.after]  a sentence under the button
 * @param {string} [message.signature]
 * @param {string} [message.tip]
 * @param {object[]} [message.items]  a numbered list of listings; each is
 *   { title, href, price, imageUrl, category, reasons[] }
 * @param {string} [message.footer]  HTML
 * @param {boolean} [message.live]  the LIVE mark beside the wordmark
 */
function composeEmail({ preheader, eyebrow, heading, paragraphs = [], product, items = [], cta, after, signature, tip, footer, live = false }) {
  const productCard = product && product.title ? `
      <tr><td style="padding:6px 32px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f2;border-radius:16px">
          <tr>
            ${product.imageUrl ? `<td width="112" style="padding:14px 0 14px 14px;vertical-align:middle">
              <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" width="98" height="98"
                style="display:block;width:98px;height:98px;object-fit:contain;border-radius:12px;background:#ffffff;border:0">
            </td>` : ""}
            <td style="padding:16px 18px;vertical-align:middle">
              ${product.brand ? `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${FAINT};margin-bottom:4px">${escapeHtml(product.brand)}</div>` : ""}
              <div style="font-size:16px;line-height:1.35;font-weight:bold;color:${INK}">${escapeHtml(product.title)}</div>
              ${product.retailerName ? `<div style="font-size:13px;color:${MUTED};margin-top:5px">Available on ${escapeHtml(product.retailerName)}</div>` : ""}
              ${product.retailPrice ? `<div style="font-size:13px;color:${MUTED};margin-top:5px"><span style="text-decoration:line-through">${escapeHtml(product.currency || "")} ${escapeHtml(product.retailPrice)}</span> usual price</div>` : ""}
            </td>
          </tr>
        </table>
      </td></tr>` : "";

  /*
   * The digest's list.
   *
   * `product` above is one listing presented as a card; this is five of them
   * presented as a letter's numbered list — a row each, the picture small, the
   * reasons in words. Not a grid of tiles: a grid is what a sale flyer looks
   * like, and the whole point of the digest is that it reads like somebody
   * writing down what they found.
   *
   * Every row carries its evidence underneath rather than a badge, because a
   * badge in an email cannot be checked and a sentence can.
   */
  const itemList = (items || []).length ? `
      <tr><td style="padding:4px 32px 0">
        ${items.map((item, index) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;background:#f6f7f2;border-radius:16px">
          <tr>
            ${item.imageUrl ? `<td width="92" style="padding:14px 0 14px 14px;vertical-align:top">
              <a href="${escapeHtml(item.href || SITE)}" style="text-decoration:none">
                <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "")}" width="78" height="78"
                  style="display:block;width:78px;height:78px;object-fit:contain;border-radius:12px;background:#ffffff;border:0">
              </a>
            </td>` : ""}
            <td style="padding:14px 16px;vertical-align:top">
              <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${FAINT};margin-bottom:4px">
                ${index + 1}${item.category ? ` · ${escapeHtml(item.category)}` : ""}
              </div>
              <a href="${escapeHtml(item.href || SITE)}" style="font-size:15px;line-height:1.35;font-weight:bold;color:${INK};text-decoration:none">${escapeHtml(item.title || "")}</a>
              ${item.price ? `<div style="font-size:15px;font-weight:bold;color:${INK};margin-top:6px">${escapeHtml(item.price)}</div>` : ""}
              ${(item.reasons || []).length ? `<div style="font-size:13px;line-height:1.55;color:${MUTED};margin-top:5px">${(item.reasons || []).map(escapeHtml).join(" · ")}</div>` : ""}
            </td>
          </tr>
        </table>`).join("")}
      </td></tr>` : "";

  const html = `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader || "")}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f3ee;padding:28px 12px;font-family:Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:22px;border:1px solid #e6e8df">
        <tr><td style="padding:28px 32px 0">
          <span style="font-size:17px;font-weight:bold;letter-spacing:-.01em;color:${INK}">OneDailyDrop</span>
          ${live ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:6px;background:${LIME};color:${INK};font-size:12px;font-weight:bold;letter-spacing:.06em;vertical-align:2px">LIVE</span>` : ""}
        </td></tr>

        <tr><td style="padding:26px 32px 6px">
          ${eyebrow ? `<div style="font-size:12px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:${OLIVE};margin-bottom:10px">${escapeHtml(eyebrow)}</div>` : ""}
          <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;letter-spacing:-.01em;color:${INK}">${escapeHtml(heading)}</h1>
          ${paragraphs.map(paragraphHtml).join("")}
        </td></tr>

        ${productCard}
        ${itemList}

        ${cta ? `<tr><td style="padding:22px 32px 4px">
          <a href="${cta.href}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;padding:15px 30px;border-radius:999px;font-weight:bold;font-size:16px">${escapeHtml(cta.label)}</a>
          ${after ? `<div style="font-size:13px;color:${MUTED};margin-top:12px">${after}</div>` : ""}
        </td></tr>` : ""}

        ${signature ? `<tr><td style="padding:22px 32px 0;font-size:15px;line-height:1.5;color:#2b2f33">${signature}</td></tr>` : ""}

        ${tip ? `<tr><td style="padding:20px 32px 0">
          <div style="background:#f6f7f2;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.55;color:${MUTED}">${tip}</div>
        </td></tr>` : ""}

        <tr><td style="padding:24px 32px 28px;font-size:12px;line-height:1.6;color:${FAINT}">
          ${footer ? `${footer}<br>` : ""}
          OneDailyDrop · <a href="${SITE}" style="color:${FAINT}">onedailydrop.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  return { html, text: plainTextFrom(html) };
}

const CHLOE = `Chloe<br><span style="font-size:13px;color:${MUTED}">Your host at OneDailyDrop Live</span>`;
const PRIMARY_TIP = "To be sure the next drop reaches you, move this email to your <strong>Primary</strong> inbox or add us to your contacts.";

const dropUrl = (market) => `${SITE}/${encodeURIComponent(market || "us")}/live`;

/* The unsubscribe line. A reminder was asked for and has nothing to leave; an
   announcement is marketing and must always carry the way out. */
const unsubscribeFooter = (unsubscribeUrl, because) => (unsubscribeUrl
  ? `${escapeHtml(because)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:${FAINT}">Unsubscribe</a> in one click.`
  : "");

/* "Thursday, September 17 at 8:00 PM ET" rather than "Thu, 17 Sep 2026 00:00:00 GMT". */
function dropTime(startsAt, market = "us") {
  const time = Date.parse(String(startsAt || ""));
  if (!Number.isFinite(time)) return String(startsAt || "");
  const zones = { us: ["America/New_York", "ET"], ca: ["America/Toronto", "ET"], uk: ["Europe/London", "UK time"], fr: ["Europe/Paris", "Paris time"], de: ["Europe/Berlin", "Berlin time"] };
  const [timeZone, label] = zones[market] || ["UTC", "UTC"];
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(time));
  return `${formatted.replace(/, (\d{1,2}:\d{2})/, " at $1")} ${label}`;
}

const productOf = ({ title, brand, retailerName, retailPrice, currency, imageUrl }) =>
  ({ title, brand, retailerName, retailPrice, currency, imageUrl });

/* ------------------------------------------------------------ accounts */

const passwordResetEmail = ({name, email, token}) => {
  const message = composeEmail({
    preheader: "This link works for one hour.",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${escapeHtml(name || "there")},`,
      "Somebody asked to reset the password for your OneDailyDrop account. If that was you, choose a new one below. The link works for one hour.",
    ],
    cta: { label: "Choose a new password", href: `${SITE}/reset-password?token=${encodeURIComponent(token)}` },
    after: "If you did not ask for this, ignore this email and nothing will change.",
  });
  return sendEmail({ to: email, toName: name, subject: "Reset your OneDailyDrop password", ...message });
};

/*
 * The one email a new account gets, and the only moment the site has their
 * attention with nothing to sell yet. It proves the address is real on the
 * day it is given, and it asks the one question worth asking: do you want to
 * hear about Live Drops?
 *
 * Transactional, so no unsubscribe of its own: there is nothing to
 * unsubscribe from until they say yes.
 */
const welcomeEmail = ({ name, email, market = "us" }) => sendEmail({
  to: email,
  toName: name,
  subject: `Welcome to OneDailyDrop${name ? `, ${name}` : ""}`,
  ...composeEmail({
    preheader: "Your account is ready. Here is what it gets you.",
    eyebrow: "You're in",
    heading: `Welcome${name ? `, ${escapeHtml(name)}` : ""}!`,
    paragraphs: [
      `Your account for <strong>${escapeHtml(email)}</strong> is ready. Anything you save now stays with it, on your phone and your laptop.`,
      "The best part of OneDailyDrop is Live: one product, one price, revealed live for ten minutes. You can only buy in a Live Drop with an account, and now you have one.",
      "Want to be told before each one starts?",
    ],
    cta: { label: "Tell me before every Live Drop", href: `${SITE}/${encodeURIComponent(market)}#subscribe` },
    signature: "See you at the next drop,<br>The OneDailyDrop team",
    tip: PRIMARY_TIP,
    footer: "You are getting this because an account was created at OneDailyDrop with this address. If that was not you, ignore it and nothing else will be sent.",
  }),
});

/* Joining the Live Drop list, from any of its forms. */
const subscriptionEmail = ({email, market = "us", unsubscribeUrl}) => sendEmail({
  to: email,
  subject: "You're on the list for OneDailyDrop Live",
  unsubscribeUrl,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: "One product, one price, ten minutes. I'll let you know before each one.",
    eyebrow: "You're on the list",
    heading: "You won't miss a Live Drop",
    paragraphs: [
      "Hi, I'm Chloe, and I host OneDailyDrop Live.",
      "Every drop is one great product at one price, revealed live on the page and open for just ten minutes. I'll email you before each one, so you're there when the price appears.",
      "That's the only email this list sends. No daily newsletters, no noise.",
    ],
    cta: { label: "See the next drop", href: dropUrl(market) },
    signature: `See you there,<br>${CHLOE}`,
    tip: PRIMARY_TIP,
    footer: unsubscribeFooter(unsubscribeUrl, "You are receiving this because you signed up for Live Drop emails."),
  }),
});

const clubWaitlistEmail = ({email}) => sendEmail({
  to: email,
  subject: "You're on the OneDailyDrop Club waitlist",
  ...composeEmail({
    preheader: "We'll email you once when Club opens.",
    heading: "You're on the Club waitlist",
    paragraphs: [
      `We'll let <strong>${escapeHtml(email)}</strong> know when OneDailyDrop Club is ready.`,
      "Until then, Live Drops and every public pick stay free.",
    ],
    cta: { label: "Visit OneDailyDrop", href: SITE },
  }),
});

/* ---------------------------------------------------------- Live Drops */

/*
 * The drop price is in none of these before the drop opens, and is not
 * available to the sender either: giving it away removes the only reason to
 * arrive on time.
 */

/* To the subscriber list, one to three days ahead. Marketing: carries a way out. */
const liveDropAnnouncementEmail = ({ email, title, market, startsAt, unsubscribeUrl, ...product }) => sendEmail({
  to: email,
  subject: `Live Drop ${dropTime(startsAt, market).replace(/ at .*/, "")}: ${title}`,
  unsubscribeUrl,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: `The price is revealed live on ${dropTime(startsAt, market)}. Ten minutes only.`,
    eyebrow: "Coming up on Live",
    heading: "Our next Live Drop is set",
    paragraphs: [
      `Hi, it's Chloe. I've got something good lined up, and I wanted you to hear first.`,
      `On <strong>${escapeHtml(dropTime(startsAt, market))}</strong> I'll go live and reveal the drop price for this one. It stays open for ten minutes, and then it's gone.`,
    ],
    product: productOf({ title, ...product }),
    cta: { label: "Remind me when it starts", href: dropUrl(market) },
    after: "Tap the button, then press Remind me on the page.",
    signature: `See you there,<br>${CHLOE}`,
    footer: unsubscribeFooter(unsubscribeUrl, "You are receiving this because you signed up for Live Drop emails."),
  }),
});

/* To people who pressed Remind me, the day before. */
const liveDropSaveTheDateEmail = ({ email, title, market, startsAt, unsubscribeUrl, ...product }) => sendEmail({
  to: email,
  subject: `Tomorrow on Live: ${title}`,
  unsubscribeUrl,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: `${dropTime(startsAt, market)}. Put it in your calendar.`,
    eyebrow: "Tomorrow",
    heading: "Your Live Drop is tomorrow",
    paragraphs: [
      `Hi, it's Chloe. Just a heads-up: the drop you asked about goes live on <strong>${escapeHtml(dropTime(startsAt, market))}</strong>.`,
      "I'll reveal the price the moment we start, and it's only open for ten minutes, so it's worth putting in your calendar now.",
    ],
    product: productOf({ title, ...product }),
    cta: { label: "See the drop page", href: dropUrl(market) },
    signature: `See you tomorrow,<br>${CHLOE}`,
    footer: unsubscribeFooter(unsubscribeUrl, "You asked to be reminded about this drop."),
  }),
});

/* To people who pressed Remind me, about an hour before. Asked for: no unsubscribe. */
const liveDropStartingSoonEmail = ({ email, title, market, minutes, ...product }) => sendEmail({
  to: email,
  subject: `We go live in ${minutes} minutes`,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: `${title}. The price is revealed when we start.`,
    eyebrow: `In ${minutes} minutes`,
    heading: `We go live in ${minutes} minutes`,
    paragraphs: [
      "Hi, it's Chloe. Almost time!",
      "When we start, I'll reveal today's price right on the page, and you'll have ten minutes to grab it. Come a little early and ask me anything in the chat while we wait.",
    ],
    product: productOf({ title, ...product }),
    cta: { label: "Open the drop", href: dropUrl(market) },
    signature: `See you in a bit,<br>${CHLOE}`,
    footer: "You asked us for this reminder. There is nothing to unsubscribe from.",
  }),
});

/* To people who pressed Remind me, ten minutes before. */
const liveDropReminderEmail = ({ email, title, market, minutes }) => sendEmail({
  to: email,
  subject: `Starting in ${minutes} minutes: ${title}`,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: "Grab your spot. The price is revealed when we start.",
    eyebrow: `In ${minutes} minutes`,
    heading: "We're about to start",
    paragraphs: [
      `Hi, it's Chloe. <strong>${escapeHtml(title)}</strong> goes live in ${minutes} minutes.`,
      "Open the page now so you're there the second the price appears. It's only open for ten minutes.",
    ],
    cta: { label: "Join the Live Drop", href: dropUrl(market) },
    signature: CHLOE,
    footer: "You asked us for this reminder. There is nothing to unsubscribe from.",
  }),
});

/*
 * The drop is open right now, in its first minutes, to everyone who asked
 * about it and to the subscriber list: see sendLiveNowNotices.
 *
 * The price is not in it even though it is public by now: an email read ten
 * minutes later would quote a price that has already gone.
 */
const liveDropLiveNowEmail = ({ email, title, market, asked, unsubscribeUrl, ...product }) => sendEmail({
  to: email,
  subject: `We're live now: ${title}`,
  unsubscribeUrl,
  fromName: "Chloe from OneDailyDrop",
  ...composeEmail({
    live: true,
    preheader: "The price is on the page right now. Ten minutes only.",
    eyebrow: "Live now",
    heading: "We're live!",
    paragraphs: [
      "Hi, it's Chloe. The Live Drop just started and the price is revealed on the page right now.",
      "It's open for ten minutes only. Jump in, and ask me anything in the chat.",
    ],
    product: productOf({ title, ...product }),
    cta: { label: "Watch and buy now", href: dropUrl(market) },
    signature: CHLOE,
    footer: asked
      ? "You asked to be reminded about this drop. There is nothing to unsubscribe from."
      : unsubscribeFooter(unsubscribeUrl, "You are receiving this because you signed up for Live Drop emails."),
  }),
});

/* ------------------------------------------------------- price watches */

/*
 * Confirmation that we are now watching a price, with the number it is
 * measured against written down where the person can see it.
 */
const priceWatchStartedEmail = ({ email, title, market, dealPath, price, currency, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: `We're watching the price of ${title}`,
  unsubscribeUrl,
  ...composeEmail({
    preheader: "If it drops, you get one email. If not, you hear nothing more.",
    eyebrow: "Price watch",
    heading: "We're watching it for you",
    paragraphs: [
      `<strong>${escapeHtml(title)}</strong> is <strong>${escapeHtml(currency)} ${escapeHtml(price)}</strong> today. That's the price we'll measure against.`,
      "If it drops, you'll get one email. If it doesn't, you won't hear anything more about it.",
    ],
    cta: { label: "See the listing", href: `${SITE}${escapeHtml(dealPath)}` },
    footer: unsubscribeUrl
      ? `No account was created and you are not on any mailing list. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${FAINT}">Stop watching this</a>.`
      : "No account was created and you are not on any mailing list.",
  }),
});

/* A price this person was watching has fallen: both numbers, against the day they asked. */
const priceDropEmail = ({ email, title, market, dealPath, was, now, currency, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: `Good news: ${title} just got cheaper`,
  unsubscribeUrl,
  ...composeEmail({
    preheader: "The price you were watching went down.",
    eyebrow: "Price drop",
    heading: "The price just dropped",
    paragraphs: [
      `<strong>${escapeHtml(title)}</strong> is now <strong>${escapeHtml(currency)} ${escapeHtml(now)}</strong>, down from ${escapeHtml(currency)} ${escapeHtml(was)} when you asked us to watch it.`,
      "Prices move, so check the current one at the shop before you buy.",
    ],
    cta: { label: "See it now", href: `${SITE}${escapeHtml(dealPath)}` },
    footer: unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${FAINT}">Stop watching this</a>` : "",
  }),
});

/* --------------------------------------------------------------- admin */

/* A message whose only job is to prove the pipe works. */
const deliveryTestEmail = ({ to }) => sendEmail({
  to,
  subject: "OneDailyDrop delivery test",
  ...composeEmail({
    preheader: "If you can read this, email delivery works.",
    heading: "Delivery works",
    paragraphs: [
      "This message was sent from the OneDailyDrop admin console to prove that mail leaves the site and arrives. Nobody was subscribed to anything.",
      "Check the headers: DKIM and DMARC should both pass, and the signing domain should be onedailydrop.com rather than sendgrid.net.",
    ],
  }),
});

/*
 * The name both of these arrive under.
 *
 * Declared here rather than left to sendEmail's default so it is one line to
 * change, and so it is obvious that it was chosen. A person's name outperforms
 * a brand in an inbox — "Nijat at OneDailyDrop" would open better than this —
 * but whose name goes on the Sunday letter is the owner's call to make, not a
 * default to inherit quietly.
 *
 * Chloe is deliberately not used. She hosts the Live Drops; she does not host
 * this, and lending her to a weekly list makes her a mascot attached to
 * whatever is being sent.
 */
const DIGEST_FROM = "OneDailyDrop";

/*
 * The invitation to the second list.
 *
 * It exists because the signup form promised "Only Live Drop emails", and the
 * honest way past a promise is to ask rather than to quietly widen it. Both
 * answers are a link, and ignoring it is a third answer that keeps the
 * promise exactly as made — which is why the mail says so.
 */
const digestInviteEmail = ({ email, market = "us", joinUrl, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: "Want five finds every Sunday?",
  unsubscribeUrl,
  fromName: DIGEST_FROM,
  ...composeEmail({
    preheader: "A separate list, and only if you say so.",
    eyebrow: "One question",
    heading: "Five finds, every Sunday",
    paragraphs: [
      "You signed up for Live Drop alerts, and that is all you have been getting. That stays true unless you say otherwise.",
      "We are starting something separate: five listings every Sunday morning, each with what it costs, what we recorded about its price, and what to check before buying. One email a week. No daily mail, no deal of the hour.",
      "Only listings that clear our Score of 80 go in it, so some Sundays there will be three rather than five, and a quiet week gets no email at all.",
    ],
    cta: { label: "Yes, send me Sundays", href: joinUrl },
    after: "Ignore this and nothing changes — you will keep getting only Live Drop emails.",
    signature: "The OneDailyDrop team",
    footer: unsubscribeFooter(unsubscribeUrl, "You are receiving this because you signed up for Live Drop emails."),
  }),
});

/*
 * The Sunday digest.
 *
 * Five listings at most and fewer when that is all there is, because a
 * weekly email that always finds exactly five things has stopped looking.
 * The closing count is the one claim only this site can make: how many
 * listings printed a discount in the same week that our own sixty days of
 * observations could not confirm.
 */
const weeklyDigestEmail = ({ email, market = "us", items = [], unconfirmed = 0, unsubscribeUrl }) => sendEmail({
  to: email,
  subject: items.length === 1
    ? "One find this week"
    : `${items.length} finds this week`,
  unsubscribeUrl,
  fromName: DIGEST_FROM,
  ...composeEmail({
    preheader: items.length
      ? `${items[0].title}${items[0].price ? ` — ${items[0].price}` : ""}, and ${items.length - 1} more.`
      : "This week's finds.",
    eyebrow: "Sunday",
    heading: items.length === 1 ? "One find this week" : `${items.length} finds this week`,
    paragraphs: [
      "Everything below cleared a Score of 80. Prices were checked this morning and shops change them without telling us, so the shop's own page is always the last word.",
    ],
    items,
    cta: { label: "See everything we checked", href: `${SITE}/${encodeURIComponent(market)}` },
    after: unconfirmed > 0
      ? `We also found <strong>${unconfirmed}</strong> listings this week showing a crossed-out price we could not confirm. None of them are above. That is the whole job.`
      : "",
    signature: "Until Sunday,<br>The OneDailyDrop team",
    footer: unsubscribeFooter(unsubscribeUrl, "You are receiving this because you asked for the Sunday finds."),
  }),
});

module.exports = { digestInviteEmail, weeklyDigestEmail, welcomeEmail, liveDropLiveNowEmail, liveDropSaveTheDateEmail, liveDropStartingSoonEmail, liveDropAnnouncementEmail, priceDropEmail, priceWatchStartedEmail, passwordResetEmail, subscriptionEmail, clubWaitlistEmail, liveDropReminderEmail, deliveryTestEmail };
