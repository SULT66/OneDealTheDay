/*
 * Visitors: the top of the funnel, which nothing used to record.
 *
 * The admin numbers started at "clicked out to a shop" and "arrived at a
 * drop", so the one question a paid campaign has to answer, how many people
 * did it bring, had no answer at all. And the only broad number there was,
 * 1,723 clicks out in a week, was 1,702 clicks with no session behind them:
 * crawlers walking every link.
 *
 * So a page view is sent by the browser, after the page has run, rather than
 * counted from server requests. A crawler that fetches HTML never runs the
 * script, which is most of them, and the few that do mostly announce
 * themselves in the user agent. It undercounts the handful of people with
 * JavaScript off; that is the right direction to be wrong in.
 *
 * Nothing here identifies anybody. The session id is the same anonymous
 * per-tab token the click and Live Drop counts use, the path is kept without
 * its query string, and the referrer is reduced to a source name.
 */

const BOT_AGENT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python|axios|node-fetch|go-http|java\/|phantom|puppeteer|playwright|selenium/i;

const SESSION = /^[A-Za-z0-9_-]{16,80}$/;

/* The names people know sources by, from the hosts referrers arrive with. */
const KNOWN_SOURCES = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\./, "yahoo"],
  [/(^|\.)yandex\./, "yandex"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)threads\.net$/, "threads"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)pinterest\./, "pinterest"],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "chatgpt"],
];

const token = (value, limit) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, limit);

function looksLikeBot(userAgent) {
  const agent = String(userAgent || "");
  return !agent || BOT_AGENT.test(agent);
}

/**
 * Where a visit came from, as one short name.
 *
 * A campaign's own label wins, because that is the one we wrote on purpose:
 * `?utm_source=tiktok` on the link in a bio says more than a referrer an app
 * may strip. Otherwise the referring site, by the name people know it by.
 * Our own pages, and no referrer at all, are "direct".
 */
function visitSource({ utmSource = "", referrer = "", ownHost = "" } = {}) {
  const tagged = token(utmSource, 40);
  if (tagged) return tagged;
  let host = "";
  try {
    host = new URL(String(referrer)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  const own = String(ownHost || "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  if (own && (host === own || host.endsWith(`.${own}`))) return "direct";
  if (host === "onedailydrop.com" || host.endsWith(".onedailydrop.com")) return "direct";
  const known = KNOWN_SOURCES.find(([pattern]) => pattern.test(host));
  return known ? known[1] : host.slice(0, 60);
}

/**
 * The row a page view becomes, or null when it should not be counted.
 */
function pageViewRow(body, { userAgent = "", ownHost = "", markets = ["us"], now = new Date() } = {}) {
  if (looksLikeBot(userAgent)) return null;
  const sessionId = String(body?.session_id || "");
  if (!SESSION.test(sessionId)) return null;
  const rawPath = String(body?.path || "");
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
  const path = rawPath.split(/[?#]/)[0].replace(/[^\x20-\x7e]/g, "").slice(0, 200) || "/";
  const firstSegment = path.split("/")[1] || "";
  const market = markets.includes(firstSegment) ? firstSegment : markets[0] || "us";
  const iso = now.toISOString();
  return {
    session_id: sessionId,
    day: iso.slice(0, 10),
    path,
    market,
    source: visitSource({ utmSource: body?.utm_source, referrer: body?.referrer, ownHost }),
    campaign: token(body?.utm_campaign, 60),
    viewed_at: iso,
  };
}

function recordPageView(db, row) {
  if (!row) return false;
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO page_views(session_id,day,path,market,source,campaign,viewed_at)
       VALUES(?,?,?,?,?,?,?)`,
    )
    .run(row.session_id, row.day, row.path, row.market, row.source, row.campaign, row.viewed_at);
  return Number(result?.changes || 0) > 0;
}

/*
 * A page by what kind of page it is. Two thousand product pages listed one by
 * one say nothing; "product pages: 340 visitors" does.
 */
function pageKind(path) {
  const parts = String(path || "/").split("/").filter(Boolean);
  const rest = parts.length && /^[a-z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
  if (!rest.length) return "Home";
  switch (rest[0]) {
    case "live": return "Live Drop";
    case "deal": return "Product pages";
    case "search": return "Search";
    case "category": case "categories": return "Categories";
    case "stores": case "store": return "Stores";
    case "delia": return "Delia";
    case "account": case "saved": return "Account";
    default: return `/${rest[0]}`;
  }
}

/**
 * The visitor numbers for the admin overview, over the same window as the rest.
 */
function visitorNumbers(db, since) {
  const one = (sql, ...params) => db.prepare(sql).get(...params) || {};
  const all = (sql, ...params) => db.prepare(sql).all(...params);

  const totals = one(
    `SELECT COUNT(DISTINCT session_id) AS visitors, COUNT(*) AS page_views,
            COUNT(DISTINCT CASE WHEN path LIKE '%/live' OR path LIKE '%/live/%' THEN session_id END) AS live_visitors
     FROM page_views WHERE viewed_at >= ?`,
    since,
  );
  const started = one("SELECT MIN(viewed_at) AS first FROM page_views");

  /* Where each visitor came from is where their first page came from: a
     person who arrived from TikTok and then clicked around is one TikTok
     visitor, not a TikTok visitor and five direct ones. */
  const sources = all(
    `SELECT source, COUNT(*) AS visitors, SUM(live) AS live_visitors FROM (
       SELECT p.session_id,
              (SELECT source FROM page_views f WHERE f.session_id = p.session_id AND f.viewed_at >= ?
                ORDER BY f.viewed_at, f.id LIMIT 1) AS source,
              MAX(CASE WHEN p.path LIKE '%/live' OR p.path LIKE '%/live/%' THEN 1 ELSE 0 END) AS live
       FROM page_views p WHERE p.viewed_at >= ? GROUP BY p.session_id
     ) GROUP BY source ORDER BY visitors DESC LIMIT 8`,
    since,
    since,
  );

  const campaigns = all(
    `SELECT campaign, COUNT(DISTINCT session_id) AS visitors FROM page_views
     WHERE viewed_at >= ? AND campaign <> '' GROUP BY campaign ORDER BY visitors DESC LIMIT 6`,
    since,
  );

  const byKind = new Map();
  for (const row of all(
    "SELECT path, session_id FROM page_views WHERE viewed_at >= ? GROUP BY path, session_id",
    since,
  )) {
    const kind = pageKind(row.path);
    if (!byKind.has(kind)) byKind.set(kind, new Set());
    byKind.get(kind).add(row.session_id);
  }
  const pages = [...byKind.entries()]
    .map(([kind, sessions]) => ({ page: kind, visitors: sessions.size }))
    .sort((left, right) => right.visitors - left.visitors)
    .slice(0, 8);

  const number = (value) => Math.max(0, Math.round(Number(value) || 0));
  return {
    visitors: number(totals.visitors),
    pageViews: number(totals.page_views),
    liveVisitors: number(totals.live_visitors),
    countingSince: started.first || null,
    sources: sources.map((row) => ({
      source: String(row.source || "direct"),
      visitors: number(row.visitors),
      liveVisitors: number(row.live_visitors),
    })),
    campaigns: campaigns.map((row) => ({ campaign: String(row.campaign), visitors: number(row.visitors) })),
    pages,
  };
}

module.exports = { looksLikeBot, pageKind, pageViewRow, recordPageView, visitSource, visitorNumbers };
