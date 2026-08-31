/**
 * Remembering an answer Delia has already worked out.
 *
 * A live search takes thirty to forty seconds and costs a model call every
 * time. Two shoppers asking for headphones under a hundred on the same evening
 * were each made to wait for the same work, and the second one paid for it
 * twice: once in time, once on the bill.
 *
 * Three rules decide what is worth keeping, and each of them exists to stop a
 * cache making the product worse rather than faster.
 */

/** Prices move. A stale price is a worse failure than a slow answer. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
/** Enough rows to cover a busy evening without the table becoming a landfill. */
const MAX_ROWS = 500;

/**
 * The question, reduced to what it is actually asking.
 *
 * "iPhone 17 Pro 256GB", "iphone 17 pro 256gb" and "iPhone 17 Pro, 256gb!"
 * are one question. Punctuation and case are noise; word order is not, so it
 * is left alone.
 */
function normalizeQuestion(message) {
  return String(message || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The key for a request, or null when this request must not be served from a
 * cache at all.
 *
 * Only a first question qualifies. "Is it cheaper anywhere else?" means
 * something different after every previous answer, and an excluded-offers list
 * or a carried mission is the shopper telling us this run is not like the last
 * one.
 */
function cacheKey({ message, messages, shoppingMission, excludedOfferUrls, marketCode, language }) {
  const question = normalizeQuestion(message);
  if (question.length < 3) return null;
  if (Array.isArray(messages) && messages.length) return null;
  if (shoppingMission) return null;
  if (Array.isArray(excludedOfferUrls) && excludedOfferUrls.length) return null;
  return `${marketCode}:${language}:${question}`;
}

/**
 * Whether an answer is worth keeping.
 *
 * A search that found nothing is the one answer that most deserves a second
 * attempt: shops restock, the model has a bad run, a page comes back. Serving
 * a remembered "no shop sells that" instantly, for hours, would turn one bad
 * run into a bad afternoon.
 *
 * A clarifying question is not kept either. It costs seconds rather than
 * tens of seconds, and it is about to be answered, which makes the next
 * request a follow-up that does not read this cache anyway.
 */
function worthCaching(result) {
  if (!result || result.error) return false;
  if (result.result_state === "no_match") return false;
  if (Array.isArray(result.clarifying_questions) && result.clarifying_questions.length) return false;
  return Array.isArray(result.recommendations) && result.recommendations.length > 0;
}

function readCachedAnswer(db, key, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  if (!key) return null;
  const row = db.prepare("SELECT payload, created_at FROM delia_answers WHERE cache_key=?").get(key);
  if (!row) return null;
  if (now - Date.parse(row.created_at) > ttlMs) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function writeCachedAnswer(db, key, result, now = Date.now()) {
  if (!key || !worthCaching(result)) return false;
  db.prepare(`INSERT INTO delia_answers(cache_key,payload,created_at)
    VALUES(?,?,?)
    ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`)
    .run(key, JSON.stringify(result), new Date(now).toISOString());
  /* Oldest out first, so the table stays a cache rather than a log. */
  db.prepare(`DELETE FROM delia_answers WHERE cache_key IN (
    SELECT cache_key FROM delia_answers ORDER BY created_at DESC LIMIT -1 OFFSET ?
  )`).run(MAX_ROWS);
  return true;
}

module.exports = {
  DEFAULT_TTL_MS,
  MAX_ROWS,
  cacheKey,
  normalizeQuestion,
  readCachedAnswer,
  worthCaching,
  writeCachedAnswer,
};
