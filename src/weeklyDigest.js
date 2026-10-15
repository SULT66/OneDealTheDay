/*
 * The Sunday email: who gets it, what is in it, and what stops it going twice.
 *
 * The site has twelve kinds of email and every one of them is a reaction —
 * you made an account, you asked about a drop, a price you watched moved.
 * Nothing arrived unless the reader had just done something, so a subscriber
 * who signed up between Live Drops heard nothing for weeks, and the first mail
 * after that silence reads as spam even to the person who asked for it.
 *
 * This is the one email that arrives because it is Sunday.
 */

const {
  REPEAT_WINDOW_DAYS,
  chooseDigestItems,
  digestEvidence,
  unconfirmedDiscountCount,
} = require("./digestSelection");

/*
 * Sunday morning where the readers are.
 *
 * The market is the United States and the server runs on UTC, so "Sunday" has
 * to be asked of a timezone or the mail goes out on Saturday evening for half
 * the list through the winter and at a different hour of the morning after
 * every clock change. Intl does the arithmetic, including the clock changes.
 */
const DIGEST_TIME_ZONE = "America/New_York";

/* A drop is the better email. Somebody told about one in the last three days
   is not also told about five listings. */
const DROP_QUIET_DAYS = 3;

const iso = (value) => new Date(value).toISOString();

const daysAgo = (days, now) => iso(new Date(now).getTime() - days * 24 * 3600 * 1000);

/**
 * The date in New York, as YYYY-MM-DD.
 *
 * This is the edition key: one row in digest_runs per market per day, with a
 * unique index behind it, so a restart in the middle of a send cannot produce
 * a second copy of the same Sunday.
 */
function editionFor(now = Date.now(), timeZone = DIGEST_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Is it Sunday where the readers are? */
function isDigestDay(now = Date.now(), timeZone = DIGEST_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(now)) === "Sun";
}

/** The ids the digest has used recently, so a week is never a repeat of the last. */
function recentlySentIds(db, { market = "us", now = Date.now(), windowDays = REPEAT_WINDOW_DAYS } = {}) {
  const rows = db
    .prepare("SELECT DISTINCT product_id FROM digest_items WHERE market = ? AND sent_at >= ?")
    .all(market, daysAgo(windowDays, now));
  return new Set(rows.map((row) => String(row.product_id)));
}

/**
 * Who asked for this email.
 *
 * `digest_opt_in` and not `status` alone: somebody on the Live Drop list has
 * not agreed to this one, and the form they filled in says so in as many
 * words. Anybody told about a drop in the last few days is left out of this
 * week rather than written to twice.
 */
function digestRecipients(db, { market = "us", now = Date.now(), quietDays = DROP_QUIET_DAYS } = {}) {
  return db
    .prepare(
      `SELECT s.id, s.email, s.market, s.unsubscribe_token
         FROM subscribers s
        WHERE s.status = 'active'
          AND s.digest_opt_in = 1
          AND s.market = ?
          AND NOT EXISTS (
            SELECT 1 FROM live_drop_announcements a
             WHERE a.subscriber_id = s.id AND a.sent_at >= ?
          )
        ORDER BY s.id`,
    )
    .all(market, daysAgo(quietDays, now));
}

/** A listing as the email renders it. */
function digestItemFor(product, { market = "us", siteOrigin = "https://www.onedailydrop.com" } = {}) {
  const price = Number(product?.current_price);
  const currency = String(product?.currency || "USD").toUpperCase();
  return {
    id: product.id,
    title: String(product.title || "").slice(0, 110),
    href: `${siteOrigin}${product.deal_url || `/${market}/deal/${product.id}`}`,
    price: Number.isFinite(price) && price > 0
      ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price)
      : "",
    imageUrl: product.image_url || "",
    category: product.public_category || "",
    reasons: digestEvidence(product),
    score: product.display_score == null ? null : Math.round(Number(product.display_score)),
  };
}

/**
 * Send this Sunday's digest.
 *
 * Returns what happened rather than a bare count, because "nothing was sent"
 * has several very different causes and a log line saying 0 hides all of them.
 *
 * Nothing is sent when no listing clears the floor. That is deliberate: an
 * email that goes out every week whatever the catalogue holds is an email
 * whose contents nobody chose.
 */
async function sendWeeklyDigest({
  db,
  market = "us",
  products = [],
  sendDigest,
  unsubscribeUrlFor = () => "",
  siteOrigin = "https://www.onedailydrop.com",
  now = Date.now(),
  force = false,
} = {}) {
  if (typeof sendDigest !== "function") throw new TypeError("sendWeeklyDigest needs a sendDigest function");
  if (!force && !isDigestDay(now)) return { status: "not-sunday", sent: 0, items: 0 };

  const edition = editionFor(now);
  const already = db
    .prepare("SELECT id FROM digest_runs WHERE market = ? AND edition = ?")
    .get(market, edition);
  if (already) return { status: "already-sent", sent: 0, items: 0, edition };

  const recipients = digestRecipients(db, { market, now });
  if (!recipients.length) return { status: "nobody-opted-in", sent: 0, items: 0, edition };

  const chosen = chooseDigestItems(products, { recentlySent: recentlySentIds(db, { market, now }) });
  if (!chosen.length) return { status: "nothing-cleared-the-floor", sent: 0, items: 0, edition };

  const items = chosen.map((product) => digestItemFor(product, { market, siteOrigin }));
  const unconfirmed = unconfirmedDiscountCount(products);
  const sentAt = iso(now);

  /*
   * The run is recorded before the first message goes out.
   *
   * If the process dies halfway through, the week is marked done and some
   * readers miss one Sunday. The other order loses the record and every reader
   * who already had it gets it again on restart, which is the failure that
   * costs a list.
   */
  db.prepare(
    "INSERT INTO digest_runs(market,edition,item_count,recipients,sent_at) VALUES(?,?,?,?,?)",
  ).run(market, edition, items.length, recipients.length, sentAt);

  const record = db.prepare(
    "INSERT INTO digest_items(product_id,market,position,score,sent_at) VALUES(?,?,?,?,?)",
  );
  items.forEach((item, index) => record.run(item.id, market, index + 1, item.score, sentAt));

  let sent = 0;
  for (const recipient of recipients) {
    try {
      await sendDigest({
        email: recipient.email,
        market,
        items,
        unconfirmed,
        unsubscribeUrl: unsubscribeUrlFor(recipient),
      });
      sent += 1;
    } catch (error) {
      /* One bad address must not cost everybody else their Sunday. */
      console.error(`[digest] ${recipient.email}: ${error.message}`);
    }
  }

  return { status: "sent", sent, items: items.length, edition, unconfirmed };
}

/**
 * Ask the Live Drop list whether they want the Sunday one.
 *
 * Once per subscriber, ever. A second ask is a newsletter nobody agreed to,
 * which is the thing this whole arrangement exists to avoid.
 */
async function sendDigestInvitations({
  db,
  sendInvite,
  joinUrlFor,
  unsubscribeUrlFor = () => "",
  now = Date.now(),
  minimumAgeHours = 0,
  limit = 200,
} = {}) {
  if (typeof sendInvite !== "function") throw new TypeError("sendDigestInvitations needs a sendInvite function");
  if (typeof joinUrlFor !== "function") throw new TypeError("sendDigestInvitations needs a joinUrlFor function");

  const waiting = db
    .prepare(
      `SELECT id, email, market, unsubscribe_token
         FROM subscribers
        WHERE status = 'active'
          AND digest_opt_in = 0
          AND digest_invited_at IS NULL
          AND unsubscribe_token <> ''
          AND created_at <= ?
        ORDER BY id
        LIMIT ?`,
    )
    .all(daysAgo(minimumAgeHours / 24, now), limit);

  const mark = db.prepare("UPDATE subscribers SET digest_invited_at = ? WHERE id = ?");
  let sent = 0;
  for (const subscriber of waiting) {
    try {
      await sendInvite({
        email: subscriber.email,
        market: subscriber.market || "us",
        joinUrl: joinUrlFor(subscriber),
        unsubscribeUrl: unsubscribeUrlFor(subscriber),
      });
      mark.run(iso(now), subscriber.id);
      sent += 1;
    } catch (error) {
      /* Left unmarked, so the next sweep tries again. */
      console.error(`[digest-invite] ${subscriber.email}: ${error.message}`);
    }
  }
  return sent;
}

module.exports = {
  DIGEST_TIME_ZONE,
  DROP_QUIET_DAYS,
  digestItemFor,
  digestRecipients,
  editionFor,
  isDigestDay,
  recentlySentIds,
  sendDigestInvitations,
  sendWeeklyDigest,
};
