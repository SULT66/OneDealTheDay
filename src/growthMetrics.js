/*
 * Is the business growing: the same numbers for any stretch of time, and a
 * frozen copy of them every week.
 *
 * The admin numbers answered "how many in the last 30 days" and never "more
 * or fewer than before", which is the only question that says whether
 * anything is working. Growth is a comparison. So everything here is computed
 * for a window with a start and an end, which makes the previous window a
 * second call rather than a second set of queries, and makes a weekly
 * snapshot the same call with the week's dates.
 *
 * Snapshots are stored rather than recomputed on demand for two reasons.
 * Some of these numbers are standing counts that only exist in the present
 * (who is subscribed right now), and a record of last week should not quietly
 * change when a row is corrected or restored today.
 *
 * The owner's own visits are left out. While real visitors number in single
 * figures, one person testing the site is most of the traffic, and a chart of
 * it says nothing. A browser that has unlocked the admin console tags its
 * anonymous session id with INTERNAL_PREFIX (lib/analyticsSession.ts), and
 * every count here skips those sessions.
 */

const INTERNAL_PREFIX = "internal_";

/* SQL for "this session is not the owner's". The id format allows no other
   underscore-led prefix, so a plain LIKE with an escaped underscore is exact. */
const notInternal = (column) => `${column} NOT LIKE 'internal\\_%' ESCAPE '\\'`;

/* The week closes at Friday 00:00 New York time, just after the Thursday
   8 PM Live Drop, so each week's snapshot includes that week's drop. */
const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || "America/New_York";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEK_CLOSES_ON = Math.max(0, WEEKDAYS.indexOf(String(process.env.REPORT_WEEK_CLOSES_ON || "friday").toLowerCase()));

/**
 * Counts for [from, to). Standing counts (subscribers) are as they stood at `to`.
 */
function periodMetrics(db, fromIso, toIso) {
  const one = (sql, ...params) => db.prepare(sql).get(...params) || {};
  const n = (value) => Math.max(0, Math.round(Number(value) || 0));
  const tableExists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

  const visits = tableExists("page_views")
    ? one(
        `SELECT COUNT(DISTINCT session_id) AS visitors, COUNT(*) AS page_views,
                COUNT(DISTINCT CASE WHEN path LIKE '%/live' OR path LIKE '%/live/%' THEN session_id END) AS live_visitors
         FROM page_views WHERE viewed_at >= ? AND viewed_at < ? AND ${notInternal("session_id")}`,
        fromIso,
        toIso,
      )
    : {};

  const shop = one(
    `SELECT COUNT(DISTINCT NULLIF(session_id, '')) AS people
     FROM clicks
     WHERE destination_type = 'retailer' AND clicked_at >= ? AND clicked_at < ? AND ${notInternal("session_id")}`,
    fromIso,
    toIso,
  );

  const subscribers = one(
    `SELECT
       SUM(CASE WHEN created_at < ?
                 AND NOT (status = 'unsubscribed' AND COALESCE(unsubscribed_at, updated_at) < ?)
                THEN 1 ELSE 0 END) AS at_end,
       SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS joined,
       SUM(CASE WHEN status = 'unsubscribed' AND unsubscribed_at >= ? AND unsubscribed_at < ? THEN 1 ELSE 0 END) AS left_list
     FROM subscribers`,
    toIso, toIso, fromIso, toIso, fromIso, toIso,
  );

  const accounts = one(
    "SELECT SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS at_end, SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS joined FROM users",
    toIso, fromIso, toIso,
  );

  const drop = one(
    `SELECT COUNT(DISTINCT session_id) AS people,
            COUNT(DISTINCT CASE WHEN event_type = 'reveal' THEN session_id END) AS saw_price,
            COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN session_id END) AS pressed_buy
     FROM live_drop_events
     WHERE occurred_at >= ? AND occurred_at < ? AND session_id <> '' AND ${notInternal("session_id")}`,
    fromIso,
    toIso,
  );

  const reminders = one(
    "SELECT COUNT(DISTINCT lower(email)) AS people FROM live_drop_reminders WHERE created_at >= ? AND created_at < ?",
    fromIso,
    toIso,
  );

  const saved = one("SELECT COUNT(*) AS total FROM saved_offers WHERE saved_at >= ? AND saved_at < ?", fromIso, toIso);
  const watches = one("SELECT COUNT(*) AS total FROM price_watches WHERE created_at >= ? AND created_at < ?", fromIso, toIso);
  const countingSince = tableExists("page_views") ? one("SELECT MIN(viewed_at) AS first FROM page_views").first : null;

  return {
    from: fromIso,
    to: toIso,
    /* Visitors were not recorded before page views were: a zero from before
       then is "unknown", not "nobody", and must not read as a collapse. */
    visitorsCounted: Boolean(countingSince && countingSince <= fromIso),
    visitors: n(visits.visitors),
    pageViews: n(visits.page_views),
    liveVisitors: n(visits.live_visitors),
    peopleToShop: n(shop.people),
    subscribers: n(subscribers.at_end),
    subscribersJoined: n(subscribers.joined),
    subscribersLeft: n(subscribers.left_list),
    accounts: n(accounts.at_end),
    accountsJoined: n(accounts.joined),
    dropPagePeople: n(drop.people),
    dropSawPrice: n(drop.saw_price),
    dropPressedBuy: n(drop.pressed_buy),
    reminderPeople: n(reminders.people),
    productsSaved: n(saved.total),
    priceWatches: n(watches.total),
  };
}

/* ------------------------------------------------------------ the week */

function zonedParts(time, timeZone = REPORT_TIMEZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(String(parts.weekday).toLowerCase()),
  };
}

/* The instant a calendar day begins in the report timezone, daylight saving
   included. */
function zonedMidnight(year, month, day, timeZone = REPORT_TIMEZONE) {
  const guess = Date.UTC(year, month - 1, day);
  const offsetAt = (time) => {
    const p = zonedParts(time, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - time;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

function shiftDay(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * The most recent completed report week: it ends at the last week-close
 * midnight at or before `now`, and starts seven local days earlier.
 */
function lastCompletedWeek(now = Date.now(), { timeZone = REPORT_TIMEZONE, closesOn = WEEK_CLOSES_ON } = {}) {
  const today = zonedParts(now, timeZone);
  const back = (today.weekday - closesOn + 7) % 7;
  const endDay = shiftDay(today.year, today.month, today.day, -back);
  const startDay = shiftDay(endDay.year, endDay.month, endDay.day, -7);
  const lastDay = shiftDay(endDay.year, endDay.month, endDay.day, -1);
  const iso = (d) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  return {
    start: new Date(zonedMidnight(startDay.year, startDay.month, startDay.day, timeZone)).toISOString(),
    end: new Date(zonedMidnight(endDay.year, endDay.month, endDay.day, timeZone)).toISOString(),
    firstDay: iso(startDay),
    lastDay: iso(lastDay),
  };
}

/* When the next snapshot will be taken, for the admin to show. */
function nextWeekClose(now = Date.now(), options = {}) {
  const week = lastCompletedWeek(now, options);
  const end = new Date(week.end);
  const parts = zonedParts(end.getTime(), options.timeZone || REPORT_TIMEZONE);
  const next = shiftDay(parts.year, parts.month, parts.day, 7);
  return new Date(zonedMidnight(next.year, next.month, next.day, options.timeZone || REPORT_TIMEZONE)).toISOString();
}

/**
 * Freezes the last completed week, once. Safe to call as often as you like.
 * Returns true when a new snapshot was written.
 */
function ensureWeeklySnapshot(db, now = Date.now(), options = {}) {
  const week = lastCompletedWeek(now, options);
  const exists = db.prepare("SELECT 1 FROM weekly_snapshots WHERE week_end = ?").get(week.end);
  if (exists) return false;
  const metrics = periodMetrics(db, week.start, week.end);
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO weekly_snapshots(week_start, week_end, first_day, last_day, metrics, created_at)
       VALUES(?,?,?,?,?,?)`,
    )
    .run(week.start, week.end, week.firstDay, week.lastDay, JSON.stringify(metrics), new Date(now).toISOString());
  return Number(result?.changes || 0) > 0;
}

function listWeeklySnapshots(db, limit = 52) {
  return db
    .prepare("SELECT week_start, week_end, first_day, last_day, metrics, created_at FROM weekly_snapshots ORDER BY week_end DESC LIMIT ?")
    .all(limit)
    .map((row) => ({
      weekStart: row.week_start,
      weekEnd: row.week_end,
      firstDay: row.first_day,
      lastDay: row.last_day,
      takenAt: row.created_at,
      metrics: JSON.parse(row.metrics || "{}"),
    }));
}

module.exports = {
  INTERNAL_PREFIX,
  REPORT_TIMEZONE,
  WEEK_CLOSES_ON,
  ensureWeeklySnapshot,
  lastCompletedWeek,
  listWeeklySnapshots,
  nextWeekClose,
  notInternal,
  periodMetrics,
};
