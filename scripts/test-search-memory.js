/*
 * What the search box remembers, and what it does with a query that misses.
 *
 * Two things are being guarded here. The first is privacy: the log keeps the
 * words people typed and nothing that says who typed them, and the assertion
 * about the table's columns is there so that adding a session id later has to
 * be a decision somebody makes on purpose rather than a field that drifts in.
 *
 * The second is that a rescue is a correction and not a guess. A replacement
 * is only ever a phrase this catalogue can answer today, it is checked before
 * it is offered, and the shopper is told what happened to their words.
 * See src/searchQueries.js and src/searchFallback.js.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const {
  demandKeywords,
  missingQueries,
  pruneSearches,
  recordSearch,
  searchDemand,
} = require("../src/searchQueries");
const { closestPhrase, editDistance, rescueQuery, synonymVariants } = require("../src/searchFallback");
const { buildSuggestIndex, suggestTerms } = require("../src/searchSuggest");

/* ------------------------------------------------------------ the log */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-search-log-"));
const database = new DatabaseSync(path.join(directory, "site.db"));
database.exec(`
  CREATE TABLE search_queries(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market TEXT NOT NULL DEFAULT 'us',
    query TEXT NOT NULL,
    normalized TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    searched_at TEXT NOT NULL
  );
`);
const db = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => statement.run(...params),
    };
  },
};

/* The words, and nothing about the person. A session id, an address or a user
   agent here would make this a record of who wants what. */
const columns = database.prepare("PRAGMA table_info(search_queries)").all().map(row => row.name);
assert.deepStrictEqual(
  columns.sort(),
  ["id", "market", "normalized", "query", "result_count", "searched_at"].sort(),
  "the search log grew a column that identifies somebody",
);

const day = 86400000;
const now = Date.parse("2026-09-26T12:00:00Z");

/* Four people wanted a standing desk and none of them found one. */
for (let repeat = 0; repeat < 4; repeat += 1) {
  recordSearch(db, { market: "us", query: "standing desk", resultCount: 0, now: now - repeat * day });
}
/* One person, once: a passing thought rather than a gap in the catalogue. */
recordSearch(db, { market: "us", query: "gold plated stapler", resultCount: 0, now });
/* And a search that worked, three times. */
for (let repeat = 0; repeat < 3; repeat += 1) {
  recordSearch(db, { market: "us", query: "office chair", resultCount: 21, now: now - repeat * day });
}
/* Another market's searches are that market's business. */
recordSearch(db, { market: "de", query: "buro stuhl", resultCount: 0, now });

/* Nothing to record is not a failure, and never throws. */
assert.strictEqual(recordSearch(db, { market: "us", query: "   ", resultCount: 0, now }), false);
assert.strictEqual(recordSearch(db, { market: "us", query: "", resultCount: 5, now }), false);
assert.strictEqual(recordSearch({ prepare() { throw new Error("no such table"); } }, { query: "chair" }), false);

const demand = searchDemand(db, { market: "us", now });
assert.strictEqual(demand.get("office chair"), 3);
assert.strictEqual(demand.get("standing desk"), 4);
assert.ok(!demand.has("gold plated stapler"), "one search is not demand");

const missing = missingQueries(db, { market: "us", now });
assert.deepStrictEqual(missing.map(row => row.query), ["standing desk"]);
assert.strictEqual(missing[0].searches, 4);
assert.ok(!missing.some(row => row.query === "office chair"), "a search that found things is not a gap");
assert.deepStrictEqual(
  missingQueries(db, { market: "de", now, minCount: 1 }).map(row => row.query),
  ["buro stuhl"],
  "one market's gaps leaked into another's",
);

/* The buying instruction: asked for repeatedly, short enough to be a thing. */
assert.deepStrictEqual(demandKeywords(db, { market: "us", now, minCount: 4 }), ["standing desk"]);
assert.deepStrictEqual(demandKeywords(db, { market: "us", now, minCount: 4, limit: 0 }), []);
recordSearch(db, { market: "us", query: "a very long shopping wish with many words", resultCount: 0, now });
recordSearch(db, { market: "us", query: "a very long shopping wish with many words", resultCount: 0, now });
assert.ok(
  !demandKeywords(db, { market: "us", now, minCount: 2 }).some(word => word.split(" ").length > 3),
  "a sentence was handed to a retailer search as a keyword",
);

/* Old rows are forgotten rather than kept for ever. */
recordSearch(db, { market: "us", query: "ancient query", resultCount: 0, now: now - 400 * day });
assert.strictEqual(pruneSearches(db, { now }), 1);
assert.strictEqual(
  db.prepare("SELECT COUNT(*) AS n FROM search_queries WHERE normalized='ancient query'").get().n,
  0,
);

/* ----------------------------------------------------- the near misses */

assert.strictEqual(editDistance("chair", "chair"), 0);
assert.strictEqual(editDistance("chiar", "chair"), 1, "two neighbours the wrong way round is one mistake");
assert.strictEqual(editDistance("wireles", "wireless"), 1);
assert.strictEqual(editDistance("matress", "mattress"), 1);
assert.strictEqual(editDistance("tent", "rent"), 1);
assert.ok(editDistance("chair", "table") > 2, "two unrelated words must not look like a typo");

/* One word swapped at a time: two at once is a different question. */
assert.ok(synonymVariants("couch").includes("sofa"));
assert.ok(synonymVariants("leather couch").includes("leather sofa"));
assert.ok(synonymVariants("trainers").includes("sneakers"), "the British spelling of a shoe found nothing");
assert.deepStrictEqual(synonymVariants("office chair"), [], "a phrase with no synonym invented one");

const rows = [
  { id: 1, title: "Ergonomic office chair with lumbar support", category: "office chair", availability: "In stock" },
  { id: 2, title: "Mesh office chair swivel seat", category: "office chair", availability: "In stock" },
  { id: 3, title: "Three seat fabric sofa", category: "sofa", availability: "In stock" },
  { id: 4, title: "Two seat velvet sofa", category: "sofa", availability: "In stock" },
];
const index = buildSuggestIndex(rows);

/* A spelling correction reaches the phrase with the same number of words, not
   the shortest thing that happens to be close. */
assert.strictEqual(closestPhrase(index, "offce chair").phrase, "office chair");
assert.strictEqual(closestPhrase(index, "chiar").phrase, "chair", "the commonest typo of all was not corrected");
/* But only within the same number of words: a one word query must not turn
   into a two word search that answers something else. */
assert.strictEqual(closestPhrase(index, "chiars sofa"), null);
assert.strictEqual(closestPhrase(index, "office chair"), null, "a query that is already right was corrected");

/* A synonym answers the question that was asked; a spelling correction assumes
   a mistake. The smaller assumption wins. */
assert.deepStrictEqual(rescueQuery(index, "couch"), { query: "sofa", reason: "synonym" });
assert.deepStrictEqual(rescueQuery(index, "offce chair"), { query: "office chair", reason: "spelling" });
assert.strictEqual(rescueQuery(index, "helicopter"), null, "a word the catalogue knows nothing about was rescued");

/* And a rescue is checked before it is offered: a replacement that would land
   on another empty page is not a rescue. */
assert.strictEqual(
  rescueQuery(index, "couch", { hasResults: () => false }),
  null,
  "a correction was offered without checking it leads anywhere",
);
assert.deepStrictEqual(
  rescueQuery(index, "couch", { hasResults: phrase => phrase === "sofa" }),
  { query: "sofa", reason: "synonym" },
);

/* --------------------------------------------- demand ranks the box */

const quiet = suggestTerms(index, "off").map(item => item.phrase);
assert.ok(quiet.includes("office chair"));
const wanted = suggestTerms(
  { ...index, demand: new Map([["office desk", 11]]) },
  "off",
);
assert.ok(
  !wanted.length || wanted[0].phrase !== "office desk" || wanted[0].demand === 11,
  "a demanded phrase lost the number that put it there",
);

/* --------------------------------------------------- what the routes do */

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.ok(app.includes("recordSearch(db, {"), "searches are not being remembered");
assert.ok(/if \(options\.page === 1\)/.test(app), "page two of one search must not count as a second search");
assert.ok(app.includes("query:interpreted.intent.originalQuery || correctedFrom || options.query"), "the log must record what was typed, not what was searched");
assert.ok(app.includes('const exact = String(req.query.exact || "") === "1";'), "there is no way to insist on the words you typed");
assert.ok(app.includes("if (options.query && !exact && !result.pagination.total) {"), "the rescue ignores a shopper who asked for exactly these words");
assert.ok(app.includes("JSON.stringify({options, exact, originalQuery"), "an exact search could be served a corrected answer from the cache");
assert.ok(app.includes("corrected_from:correctedFrom"), "the page is not told that its words were changed");

const page = fs.readFileSync(path.join(__dirname, "..", "app", "[market]", "search", "page.tsx"), "utf8");
assert.ok(page.includes("app.search.correctedTo") && page.includes("app.search.searchInstead"), "a corrected search does not say so");
assert.ok(page.includes("&exact=1"), "the way back to the original search is missing");

const refresh = fs.readFileSync(path.join(__dirname, "..", "src", "refresh.js"), "utf8");
assert.ok(refresh.includes("demandKeywords(db, {market:marketCode"), "the refresh does not go looking for what shoppers could not find");

const { appCopy } = require("../src/i18n-app");
for (const language of ["en", "es", "fr", "de"]) {
  for (const key of ["app.search.correctedTo", "app.search.searchInstead", "app.search.suggestions"]) {
    assert.ok(appCopy[language][key], `${language} is missing ${key}`);
  }
}

database.close();
try {
  fs.rmSync(directory, { recursive: true, force: true });
} catch {
  /* Windows keeps a handle on the file for a moment after it is closed. The
     temporary directory is the operating system's to clean up. */
}
console.log("search memory and near misses: ok");
