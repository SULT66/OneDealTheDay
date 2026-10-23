/*
 * The first week: three letters, then silence until there is something to say.
 *
 * Confirming a subscription and then saying nothing is how a list forgets who
 * you are. Somebody who signs up on a Monday can wait weeks for the next Live
 * Drop, and the email that finally arrives reads as spam even to the person
 * who asked for it. These three say who we are while the reader still
 * remembers signing up:
 *
 *   day 1  what we actually check — the one idea the site rests on
 *   day 3  how to read the Score, including what it does not mean
 *   day 7  would you also like the Sunday list?
 *
 * One letter per subscriber per sweep, in order. The sweep runs every minute,
 * so without that a list of people who all joined a month ago would receive
 * the whole sequence at once, which is three emails in a minute from a sender
 * they have heard from twice.
 */

/*
 * The order is the schedule. `afterDays` is counted from the subscription,
 * not from the previous letter, so a sweep that was down for a day catches up
 * rather than pushing everything back by a day.
 */
const WELCOME_STEPS = [
  { key: "intro", afterDays: 1 },
  { key: "score", afterDays: 3 },
  { key: "digest_invite", afterDays: 7 },
];

const iso = (value) => new Date(value).toISOString();

/** Which letters this subscriber has already had. */
function stepsSentTo(db, subscriberId) {
  return new Set(
    db.prepare("SELECT step FROM subscriber_sequence WHERE subscriber_id = ?")
      .all(subscriberId)
      .map((row) => row.step),
  );
}

/**
 * Every letter this subscriber is owed, earliest first.
 *
 * Exported alongside nextStepFor because the rule — unsent steps whose day has
 * arrived — is the whole of the scheduling, and it is worth being able to ask
 * it directly rather than inferring it from what a sweep happened to send.
 *
 * The sweep sends at most one of these. It needs the rest because the day
 * three letter can be unsendable — it shows a listing, and a market with
 * nothing worth showing has none to give it. Offering only the first owed
 * step meant an unsendable one stood in front of the day seven invitation
 * for as long as it stayed unsendable, which in practice was for ever: the
 * invitation is the only door to the Sunday list, so a missing card closed
 * the list rather than skipping a letter.
 */
function dueStepsFor({ createdAt, sent = new Set(), now = Date.now(), steps = WELCOME_STEPS }) {
  const joined = new Date(createdAt).getTime();
  if (!Number.isFinite(joined)) return [];
  const due = [];
  for (const step of steps) {
    if (sent.has(step.key)) continue;
    /* The steps are in order, so the first one whose day has not arrived ends
       the list: nothing later than it can be due either. */
    if (now - joined < step.afterDays * 24 * 3600 * 1000) break;
    due.push(step);
  }
  return due;
}

/**
 * The next letter owed to this subscriber, or null.
 */
function nextStepFor(options) {
  return dueStepsFor(options)[0] || null;
}

/**
 * Send whatever the first week owes, one letter per subscriber.
 *
 * @param {object} options
 * @param {object} options.db
 * @param {object} options.senders   { intro, score, digest_invite } — async
 * @param {function} [options.featuredFor]  returns the listing the day-three
 *   letter shows, for a market. Passed in rather than queried here so this
 *   module stays about scheduling; a market with nothing to show skips that
 *   letter rather than sending an empty one.
 * @returns {object} how many of each step went out
 */
async function sendWelcomeSequence({
  db,
  senders = {},
  featuredFor = () => null,
  unsubscribeUrlFor = () => "",
  joinUrlFor = () => "",
  now = Date.now(),
  limit = 200,
} = {}) {
  const candidates = db
    .prepare(
      `SELECT id, email, market, created_at, unsubscribe_token
         FROM subscribers
        WHERE status = 'active' AND unsubscribe_token <> '' AND drop_opt_in = 1
        ORDER BY id
        LIMIT ?`,
    )
    .all(limit);

  const record = db.prepare(
    "INSERT OR IGNORE INTO subscriber_sequence(subscriber_id,step,sent_at) VALUES(?,?,?)",
  );
  const sent = {};

  for (const subscriber of candidates) {
    const due = dueStepsFor({
      createdAt: subscriber.created_at,
      sent: stepsSentTo(db, subscriber.id),
      now,
    });

    const market = subscriber.market || "us";

    /*
     * The first owed letter that can actually be built, not simply the first
     * owed letter. Still one per subscriber per sweep — the loop stops at the
     * first one it sends — but a letter that cannot be built steps aside for
     * the next instead of standing in front of it indefinitely.
     */
    let step = null;
    let message = null;
    for (const candidate of due) {
      if (typeof senders[candidate.key] !== "function") continue;

      const draft = {
        email: subscriber.email,
        market,
        unsubscribeUrl: unsubscribeUrlFor(subscriber),
      };
      if (candidate.key === "digest_invite") draft.joinUrl = joinUrlFor(subscriber);
      if (candidate.key === "score") {
        draft.product = featuredFor(market);
        /* Nothing worth showing means nothing worth claiming: rather than go
           out with an empty card or an invented example, this letter waits.
           It keeps its place — the step stays unsent, so it is still owed and
           still tried first on the next sweep — but it no longer holds back
           the letters behind it. */
        if (!draft.product) {
          console.warn(`[welcome] ${subscriber.email}: no listing for the day-three letter, trying the next one`);
          continue;
        }
      }
      step = candidate;
      message = draft;
      break;
    }
    if (!step) continue;

    /*
     * Recorded first, for the same reason the digest records its run first: a
     * failure after sending costs one reader one letter, while a failure
     * before recording sends the whole list a second copy on the next sweep —
     * and this sweep runs every minute.
     */
    const written = record.run(subscriber.id, step.key, iso(now));
    if (!Number(written?.changes || 0)) continue;

    try {
      await senders[step.key](message);
      sent[step.key] = (sent[step.key] || 0) + 1;
    } catch (error) {
      /* The row stays. A letter that could not be delivered is not retried
         forever at one attempt a minute against the same bad address. */
      console.error(`[welcome] ${subscriber.email} (${step.key}): ${error.message}`);
    }
  }

  return sent;
}

module.exports = { WELCOME_STEPS, dueStepsFor, nextStepFor, sendWelcomeSequence, stepsSentTo };
