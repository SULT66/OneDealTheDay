/*
 * What people came looking for.
 *
 * Nothing recorded it. The search box has been answering queries since the
 * site opened and every one of them vanished the moment the page rendered, so
 * two questions could not be asked at all: what do shoppers want most, and
 * what do they want that we do not stock. The second one is a shopping list —
 * somebody typed "standing desk" eleven times last month and left with
 * nothing, and that is worth more than any guess about what to buy next.
 *
 * What is kept: the words, the market, how many results came back, and when.
 * Not who typed them. No session, no address, no browser — a search is the
 * kind of thing people type private questions into, and none of the uses here
 * need to know whose search it was. The words are trimmed to a length a query
 * can plausibly be, and rows older than the retention window are deleted.
 *
 * Written on the server rather than from the browser, because that is where
 * every search passes through whatever the visitor's ad blocker thinks, and
 * because only the server knows how many results the query actually returned.
 */
const { normalizedTitle } = require("./ranker");

/* Long enough to see a monthly pattern, short enough that what people wanted
   in the spring does not decide what the box suggests today. */
const DEMAND_WINDOW_DAYS = 30;
/* Below this a "popular search" is one person pressing Enter twice. */
const MIN_DEMAND = 3;
/* A query nobody repeats is a typo or a passing thought, not a gap in stock. */
const MIN_MISSING = 2;
/* Half a year. Long enough to compare a season with the last one. */
const RETENTION_DAYS = 180;
const MAX_QUERY_LENGTH = 120;

/**
 * One search, as it was asked and as it will be counted.
 *
 * Silently does nothing for an empty query, and never throws: a page must not
 * fail because the thing that watches it did.
 */
function recordSearch(db, { market = "us", query = "", resultCount = 0, now = Date.now() } = {}) {
  const asked = String(query || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  const normalized = normalizedTitle(asked);
  if (!asked || !normalized) return false;
  try {
    db.prepare(
      "INSERT INTO search_queries(market,query,normalized,result_count,searched_at) VALUES(?,?,?,?,?)",
    ).run(String(market || "us"), asked, normalized, Math.max(0, Math.round(Number(resultCount) || 0)), new Date(now).toISOString());
    return true;
  } catch {
    /* A missing table on an old database, a disk that is full: the search
       still happened and the shopper still gets their answer. */
    return false;
  }
}

function since(now, days) {
  return new Date(now - days * 86400000).toISOString();
}

/**
 * How often each phrase was searched, for ranking suggestions by what people
 * want rather than by how much of it we happen to hold.
 */
function searchDemand(db, { market = "us", days = DEMAND_WINDOW_DAYS, minCount = MIN_DEMAND, now = Date.now() } = {}) {
  try {
    const rows = db.prepare(`
      SELECT normalized, COUNT(*) AS searches
      FROM search_queries
      WHERE market=? AND searched_at>=?
      GROUP BY normalized
      HAVING searches >= ?
    `).all(market, since(now, days), minCount);
    return new Map(rows.map(row => [row.normalized, Number(row.searches)]));
  } catch {
    return new Map();
  }
}

/**
 * What people asked for and did not find.
 *
 * The shopping list: every phrase that came back empty, most-wanted first,
 * with the last time somebody tried. A query that found something once and
 * nothing later still counts as missing — that is a listing that sold out or
 * went stale, which is the same gap wearing different clothes.
 */
function missingQueries(db, { market = "us", days = DEMAND_WINDOW_DAYS, limit = 50, minCount = MIN_MISSING, now = Date.now() } = {}) {
  try {
    return db.prepare(`
      SELECT normalized AS query,
             COUNT(*) AS searches,
             MAX(searched_at) AS last_searched_at,
             MAX(result_count) AS best_result_count
      FROM search_queries
      WHERE market=? AND searched_at>=? AND result_count=0
      GROUP BY normalized
      HAVING searches >= ?
      ORDER BY searches DESC, last_searched_at DESC
      LIMIT ?
    `).all(market, since(now, days), minCount, limit);
  } catch {
    return [];
  }
}

/**
 * The phrases worth pointing a retailer search at.
 *
 * A gap is only a buying instruction when it is asked for repeatedly and is
 * shaped like something a shop sells — one to three words, no punctuation
 * soup. The cap is deliberate: every keyword costs a slice of eBay's daily
 * allowance, which the catalogue refresh is already spending.
 */
function demandKeywords(db, { market = "us", days = DEMAND_WINDOW_DAYS, limit = 3, minCount = 5, now = Date.now() } = {}) {
  return missingQueries(db, { market, days, limit: limit * 5, minCount, now })
    .map(row => String(row.query || "").trim())
    .filter(query => query.split(" ").length <= 3 && query.length >= 3)
    .slice(0, Math.max(0, limit));
}

/** Housekeeping: the window is what is useful, the rest is just kept. */
function pruneSearches(db, { keepDays = RETENTION_DAYS, now = Date.now() } = {}) {
  try {
    return db.prepare("DELETE FROM search_queries WHERE searched_at < ?").run(since(now, keepDays)).changes;
  } catch {
    return 0;
  }
}

module.exports = {
  DEMAND_WINDOW_DAYS,
  MIN_DEMAND,
  MIN_MISSING,
  RETENTION_DAYS,
  demandKeywords,
  missingQueries,
  pruneSearches,
  recordSearch,
  searchDemand,
};
