/**
 * What state a Live Drop is in, and what a shopper is allowed to see of it.
 *
 * The state is derived from the clock and the stock rather than stored. A
 * status column needs something running to move it, and the moment that
 * process is not running the drop sits at "upcoming" past its own start, or at
 * "live" long after it closed. Deriving it means the page is right even if
 * nothing has touched the database since the drop was created.
 *
 * Pure functions on purpose: the whole state machine can be tested against a
 * fixed clock, which is the only way to be sure a ten minute window that
 * happens once behaves correctly before it happens.
 */

/** The doc's T-05:00: the waiting room opens five minutes before the start. */
const WAITING_ROOM_SECONDS = 5 * 60;

const parseTime = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * upcoming, waiting, live, sold_out or ended.
 *
 * sold_out outranks ended once the drop has opened, because "we sold every
 * one" and "time ran out" are different things to arrive at, and the first is
 * the one worth telling somebody who missed it.
 *
 * `earlyAccessSeconds` lets a Drop Pass member in before the public start. It
 * is a parameter rather than a lookup so the lane can be built and tested now
 * and sold later.
 */
function dropState(drop, now = Date.now(), earlyAccessSeconds = 0) {
  const startAt = parseTime(drop?.start_at);
  const endAt = parseTime(drop?.end_at);
  if (startAt == null || endAt == null) return "ended";

  const opensAt = startAt - Math.max(0, number(earlyAccessSeconds)) * 1000;
  const remaining = number(drop?.quantity_remaining, 0);
  const hasStock = number(drop?.quantity_total, 0) <= 0 || remaining > 0;

  if (now >= opensAt && !hasStock) return "sold_out";
  if (now >= endAt) return "ended";
  if (now >= opensAt) return "live";
  if (now >= startAt - WAITING_ROOM_SECONDS * 1000) return "waiting";
  return "upcoming";
}

/**
 * The saving, as a figure and a percentage.
 *
 * Returns nothing rather than zero when there is no honest comparison to make.
 * A "SAVE $0 (0%)" badge is worse than no badge, and a claimed saving against
 * a retail price nobody can point at is the kind of thing that turns a
 * promotion into a complaint.
 */
function dropSaving(drop) {
  const retail = number(drop?.retail_price, 0);
  const price = number(drop?.drop_price, 0);
  if (!(retail > 0 && price > 0 && retail > price)) return null;
  const amount = Math.round((retail - price) * 100) / 100;
  return { amount, percent: Math.round((amount / retail) * 100) };
}

/**
 * The drop as the browser gets it.
 *
 * `server_now` travels with it so the countdown can run off our clock rather
 * than the visitor's. Half of any audience has a machine minutes out, and a
 * countdown reading from the browser would open the drop early for some people
 * and late for others, which for a ten minute event is the whole event.
 *
 * The price is withheld until the drop opens. That is the mechanic the whole
 * format rests on, and leaking it in the JSON while the page shows a teaser
 * would give it away to anybody who opened developer tools.
 */
function presentDrop(drop, now = Date.now(), { earlyAccessSeconds = 0 } = {}) {
  if (!drop) return null;
  const state = dropState(drop, now, earlyAccessSeconds);
  const startAt = parseTime(drop.start_at);
  const endAt = parseTime(drop.end_at);
  const revealed = state === "live" || state === "sold_out" || state === "ended";
  const saving = revealed ? dropSaving(drop) : null;

  return {
    drop_key: drop.drop_key,
    market: drop.market,
    title: drop.title,
    brand: drop.brand,
    retailer_name: drop.retailer_name,
    image_url: drop.image_url,
    /* The product in use, shown under the product itself. The presenter cannot
       hold it up, so this is where a shopper actually sees the thing. */
    secondary_image_url: drop.secondary_image_url || "",
    currency: drop.currency,
    retail_price: number(drop.retail_price, 0) || null,
    /* Before the start this is deliberately null, not the real number. */
    drop_price: revealed ? number(drop.drop_price, 0) || null : null,
    saving,
    quantity_total: number(drop.quantity_total, 0),
    quantity_remaining: Math.max(0, number(drop.quantity_remaining, 0)),
    state,
    start_at: drop.start_at,
    end_at: drop.end_at,
    /* Seconds, not a target timestamp, so a browser with a wrong clock still
       counts down the right length of time. */
    seconds_until_start: startAt == null ? null : Math.max(0, Math.round((startAt - now) / 1000)),
    seconds_until_end: endAt == null ? null : Math.max(0, Math.round((endAt - now) / 1000)),
    member_early_access_seconds: number(drop.member_early_access_seconds, 0),
    /* Only once it can actually be used: a live link before the start is an
       invitation to buy at the ordinary price and blame us for the difference. */
    affiliate_url: state === "live" ? drop.affiliate_url || "" : "",
    /* A drop can run with no broadcast at all: the event is the time and the
       limit, not the picture. The slot takes a recorded file or an embed when
       there is one. */
    video_url: drop.video_url || "",
    stream_embed_url: drop.stream_embed_url || "",
    terms: drop.terms || "",
    server_now: new Date(now).toISOString(),
  };
}

/**
 * What Chloe says when she arrives, built from the drop itself.
 *
 * She used to open with "Welcome to OneDailyDrop Live! Ask me about today's
 * verified live deal" — the same sentence at every drop, naming nothing. A
 * shopper who came to see a monitor was greeted by a host who appeared not to
 * know what she was presenting, and had to ask before anything happened.
 *
 * The price is the one thing this may not say early. Before the drop opens the
 * server has not even sent it, and the whole mechanic is that it appears at a
 * particular second; a host who reads it out in the waiting room gives away
 * the event. So the opening names the product and the saving only once it is
 * live, and before that says plainly that the price is still to come.
 *
 * Facts only, and only ones already on the page. Anything beyond this she has
 * to look up through get_product_details, which withholds the same things for
 * the same reasons.
 */
function hostGreeting(view) {
  if (!view) return "Welcome to OneDailyDrop Live. I'm Chloe, your AI shopping host.";
  /* A retailer title usually opens with the brand already, so putting the
     brand in front of it had her say "the ASUS ASUS 32in UHD 4K Monitor" out
     loud, on air. */
  const brand = String(view.brand || "").trim();
  const title = String(view.title || "").trim();
  const alreadyNamed =
    brand && new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title);
  const product =
    [alreadyNamed ? "" : brand, title].filter(Boolean).join(" ").trim() || "today's drop";
  const shop = view.retailer_name ? ` It's sold and shipped by ${view.retailer_name}.` : "";
  const opening = `Hi, I'm Chloe and this is OneDailyDrop Live. Today's drop is the ${product}.${shop}`;

  if (view.state !== "live") {
    return `${opening} The price opens in a moment — stay with me and I'll tell you the second it does. Ask me anything about it while we wait.`;
  }
  const saving = view.saving
    ? ` That's ${view.saving.percent} percent below its usual price.`
    : "";
  return `${opening} It's live now at ${view.currency} ${view.drop_price}.${saving} Ask me anything about it, and the buy button is right below me.`;
}

/**
 * What the host is told the moment the price opens.
 *
 * A greeting is fixed when the conversation is created, so somebody who
 * started chatting in the waiting room and stayed for the reveal heard "the
 * price opens in a moment" while the price was already on the screen beside
 * her. The opening is the one moment of a Live Drop that the host must not
 * miss.
 *
 * Composed on the server for the same reason everything else here is: the page
 * cannot be trusted to work out what may be said, and by the time this exists
 * the price is public anyway — it is only produced once the drop is live.
 */
function hostRevealLine(view) {
  if (!view || view.state !== "live" || view.drop_price == null) return "";
  const saving = view.saving ? `, ${view.saving.percent} percent below its usual price` : "";
  return `The drop just opened at ${view.currency} ${view.drop_price}${saving}. Announce it to the viewers now, in one or two sentences, and tell them the buy button is below you.`;
}

/**
 * Sends the reminders people asked for, shortly before a drop opens.
 *
 * Lives here rather than in the server so it can be tested against a fixed
 * clock and a fake mailer. A ten minute event that happens once cannot be
 * debugged while it is running, and an email that arrives after it closed is
 * worse than no email at all.
 *
 * Ten minutes of lead by default: the waiting room opens at T-05:00, so this
 * gives somebody time to read the message and still arrive before the room
 * does.
 *
 * The window has a floor as well as a ceiling. Without one, a drop that ran
 * while the mailer was down would have its reminders sent hours later, to
 * people who would arrive at an empty page.
 *
 * reminded_at is stamped only after a send succeeds, so an outage leaves the
 * row for the next sweep instead of silently consuming it, and one bad address
 * never stops the rest of the queue.
 */
const REMINDER_LEAD_MINUTES = 10;

async function sendDueReminders({
  db,
  sendReminder,
  now = Date.now(),
  leadMinutes = REMINDER_LEAD_MINUTES,
  batch = 200,
  logger = console,
}) {
  const due = db.prepare(`
    SELECT r.id, r.email, d.title, d.market, d.start_at
    FROM live_drop_reminders r
    JOIN live_drops d ON d.id = r.drop_id
    WHERE r.reminded_at IS NULL AND d.published = 1
      AND d.start_at > ? AND d.start_at <= ?
    ORDER BY d.start_at
    LIMIT ?
  `).all(
    new Date(now).toISOString(),
    new Date(now + leadMinutes * 60000).toISOString(),
    batch,
  );

  const stamp = db.prepare("UPDATE live_drop_reminders SET reminded_at=? WHERE id=?");
  let sent = 0;
  for (const reminder of due) {
    const minutes = Math.max(1, Math.round((Date.parse(reminder.start_at) - now) / 60000));
    try {
      await sendReminder({
        email: reminder.email,
        title: reminder.title,
        market: reminder.market,
        minutes,
      });
      stamp.run(new Date(now).toISOString(), reminder.id);
      sent += 1;
    } catch (error) {
      logger.error(`[live-drop] reminder to ${reminder.email} failed: ${error.message}`);
    }
  }
  return sent;
}

module.exports = {
  REMINDER_LEAD_MINUTES,
  WAITING_ROOM_SECONDS,
  dropSaving,
  hostGreeting,
  hostRevealLine,
  dropState,
  presentDrop,
  sendDueReminders,
};
