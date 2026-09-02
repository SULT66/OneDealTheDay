const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const {
  DEFAULT_TTL_MS,
  MAX_ROWS,
  cacheKey,
  normalizeQuestion,
  readCachedAnswer,
  worthCaching,
  writeCachedAnswer,
} = require("../src/deliaCache");

/*
 * A live search is thirty to forty seconds and a model call. Caching is worth
 * having, and is also the easiest way to make the product quietly worse: a
 * stale price, a remembered failure, or one shopper's follow-up answered with
 * another shopper's context. Most of this is about what is refused.
 */

/* ---------------------------------------------------------------- the key */

assert.strictEqual(normalizeQuestion("iPhone 17 Pro, 256GB!"), "iphone 17 pro 256gb");
assert.strictEqual(normalizeQuestion("  Headphones   under  100  "), "headphones under 100");
assert.strictEqual(
  cacheKey({ message: "iPhone 17 Pro 256GB!", marketCode: "us", language: "en" }),
  cacheKey({ message: "iphone 17 pro  256gb", marketCode: "us", language: "en" }),
  "the same question written differently produced two keys",
);

/* Word order carries meaning and is deliberately left alone. */
assert.notStrictEqual(
  cacheKey({ message: "tv under 500", marketCode: "us", language: "en" }),
  cacheKey({ message: "under 500 tv", marketCode: "us", language: "en" }),
);

/* A German shopper and an American one are not asking the same question, and
   an answer in English is not an answer for somebody writing in Russian. */
assert.notStrictEqual(
  cacheKey({ message: "a good tv", marketCode: "us", language: "en" }),
  cacheKey({ message: "a good tv", marketCode: "de", language: "en" }),
);
assert.notStrictEqual(
  cacheKey({ message: "a good tv", marketCode: "us", language: "en" }),
  cacheKey({ message: "a good tv", marketCode: "us", language: "ru" }),
);

/*
 * Only a first question may be shared. "Is it cheaper anywhere else?" means
 * something different after every previous answer, so serving one shopper's
 * follow-up from another's would answer about the wrong product entirely.
 */
assert.strictEqual(
  cacheKey({
    message: "is it cheaper anywhere else?",
    messages: [{ role: "user", content: "samsung tv" }],
    marketCode: "us",
    language: "en",
  }),
  null,
  "a follow-up was treated as a shareable question",
);
assert.strictEqual(
  cacheKey({ message: "a good tv", shoppingMission: { product_type: "tv" }, marketCode: "us", language: "en" }),
  null,
  "a carried mission was ignored, so the answer would not know what it was for",
);
assert.strictEqual(
  cacheKey({
    message: "a good tv",
    excludedOfferUrls: ["https://shop.example.com/p/one"],
    marketCode: "us",
    language: "en",
  }),
  null,
  "a request to skip offers already seen was answered with the ones already seen",
);
assert.strictEqual(cacheKey({ message: "hi", marketCode: "us", language: "en" }), null);

/* ------------------------------------------------------- what is kept */

/* The one answer that most deserves another attempt. Shops restock, a page
   comes back, the model has a bad run; serving a remembered "nobody sells
   that" for hours turns one bad run into a bad afternoon. */
assert.strictEqual(worthCaching({ result_state: "no_match", recommendations: [{}] }), false);
assert.strictEqual(worthCaching({ result_state: "exact_matches", recommendations: [] }), false);
assert.strictEqual(worthCaching({ error: "boom" }), false);
assert.strictEqual(worthCaching(null), false);
/* A question back costs seconds rather than tens of seconds, and the answer
   to it is a follow-up, which never reads this cache anyway. */
assert.strictEqual(
  worthCaching({ result_state: "exact_matches", clarifying_questions: ["What is your budget?"], recommendations: [{}] }),
  false,
);
assert.strictEqual(
  worthCaching({ result_state: "exact_matches", recommendations: [{ title: "A television" }] }),
  true,
);

/* ------------------------------------------------------------- the store */

const db = new Database(":memory:");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "src", "db.js"), "utf8");
/* Lifted from db.js rather than retyped, so a change there fails here. */
const schema = /CREATE TABLE IF NOT EXISTS delia_answers\([\s\S]*?\n  \);/.exec(dbSource);
assert(schema, "delia_answers is no longer declared where this test looks for it");
db.exec(schema[0]);

const now = Date.parse("2026-09-01T20:00:00Z");
const answer = { result_state: "exact_matches", recommendations: [{ title: "Sony WH-CH720N" }] };
assert.strictEqual(writeCachedAnswer(db, "us:en:headphones", answer, now), true);
assert.strictEqual(
  readCachedAnswer(db, "us:en:headphones", now)?.recommendations[0].title,
  "Sony WH-CH720N",
);

/* Prices move. A stale price is a worse failure than a slow answer, so the
   answer stops being served rather than being served wrong. */
assert.strictEqual(
  readCachedAnswer(db, "us:en:headphones", now + DEFAULT_TTL_MS + 1),
  null,
  "an answer older than its lifetime was still served",
);
assert.strictEqual(readCachedAnswer(db, "us:en:never-asked", now), null);
assert.strictEqual(readCachedAnswer(db, null, now), null);

/* Nothing is written for a request that was refused a key. */
assert.strictEqual(writeCachedAnswer(db, null, answer, now), false);
assert.strictEqual(writeCachedAnswer(db, "us:en:nothing", { result_state: "no_match" }, now), false);

/* The table is a cache, not a log: the oldest rows leave to make room. */
for (let index = 0; index < MAX_ROWS + 25; index += 1) {
  writeCachedAnswer(db, `us:en:question ${index}`, answer, now + index * 1000);
}
assert(
  db.prepare("SELECT COUNT(*) AS total FROM delia_answers").get().total <= MAX_ROWS,
  "the cache grew past its own limit",
);
assert.strictEqual(
  readCachedAnswer(db, "us:en:question 0", now + MAX_ROWS * 1000),
  null,
  "the oldest row survived while newer ones were written",
);
assert(
  readCachedAnswer(db, `us:en:question ${MAX_ROWS + 24}`, now + (MAX_ROWS + 24) * 1000),
  "the newest row was evicted instead of the oldest",
);

/*
 * A question asked from a product page belongs to that product.
 *
 * "Is this a good price?" is the same sentence on every listing on the site,
 * so without the product in the key one listing's answer would be handed to
 * every other one.
 */
const base = { message: "Is this a good price?", marketCode: "us", language: "en" };
const first = cacheKey({ ...base, productId: 218308 });
const second = cacheKey({ ...base, productId: 999001 });
assert(first && second, "a product question is no longer cacheable at all");
assert.notStrictEqual(first, second, "two different products share one cached answer");
assert.notStrictEqual(
  first,
  cacheKey(base),
  "a question about a product shares a key with the same words asked about nothing",
);
assert.strictEqual(
  cacheKey({ ...base, productId: 0 }),
  cacheKey(base),
  "an absent product id changed the key, so old cached answers are all missed",
);

/*
 * And the assistant has to be given the product rather than sent hunting for
 * it. Asked from a listing scoring 93, with its full retailer title pasted
 * into the question, Delia answered "I could not find a shop in the United
 * States selling that right now" — measured against production, as was the
 * same product coming back first when asked for in ordinary words.
 */
const assistant = fs.readFileSync(path.join(__dirname, "..", "src", "shoppingAssistant.js"), "utf8");
assert(
  /function catalogProductById\(/.test(assistant),
  "the assistant can no longer look a product up by id, only search for it",
);
assert(
  /const focusProduct = catalogProductById\(/.test(assistant),
  "the product the shopper is asking about is no longer put among the candidates",
);
const dealPage = fs.readFileSync(
  path.join(__dirname, "..", "app", "[market]", "deal", "[id]", "page.tsx"),
  "utf8",
);
assert(
  !/seed=\{`Is \$\{deal\.title\} a good price\?`\}/.test(dealPage),
  "the deal page seeds the full retailer title again, which is what made the question unanswerable",
);
assert(
  /productId=\{deal\.id\}/.test(dealPage),
  "the deal page no longer tells Delia which product it is",
);

console.log("Delia answer cache and product-page questions passed.");
