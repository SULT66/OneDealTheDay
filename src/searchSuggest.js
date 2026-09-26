/*
 * What to offer while someone is still typing.
 *
 * The search box asked for the whole query and gave nothing back until it was
 * submitted, so a shopper had to already know both what the catalogue calls a
 * thing and whether we carry it. Type "off", wait, press Enter, read a page,
 * find out. The catalogue is two thousand listings wide and almost nobody
 * guesses its vocabulary on the first try.
 *
 * Everything offered comes from the catalogue itself, from two sources that
 * are not equally good and are not treated as if they were.
 *
 * The first is the phrase each listing was found by — "office chair", "robot
 * vacuum", "wireless earbuds". These are already search terms: somebody chose
 * them, retailers answered them, and the number beside one is the number of
 * listings it holds. Nothing beats them as suggestions, so they go first.
 *
 * The second is the titles. Cut into windows of one to three words they cover
 * far more ground, but most of what comes out is a fragment of somebody's
 * headline rather than a thing to search for: "chair ergonomic", "chair
 * black", "wireless bluetooth". So a title phrase is only offered when it ends
 * on a word the first list ends on — a head word, the name of a thing rather
 * than a description of one. That rule is what separates "mesh office chair"
 * from "office chair mesh".
 *
 * The rule underneath both: a suggestion must never be a dead end. Every
 * phrase is taken verbatim from listings we currently carry and is only kept
 * when at least two of them share it, so the term a shopper picks is a term
 * the results page can answer. A suggestion that leads to "no matches" is
 * worse than no suggestion at all — it reads as an empty shop.
 */
const { normalizedTitle } = require("./ranker");

/* Three words is where a phrase stops being a thing and starts being a
   listing: "office chair" and "mesh office chair" are searches, "mesh office
   chair with lumbar" is one seller's headline. */
const MAX_PHRASE_WORDS = 3;
/* Two listings, not one. A phrase only one product uses is that product's
   wording, and offering it as a search term promises a shelf where there is a
   single item. */
const MIN_PHRASE_PRODUCTS = 2;
const MAX_TERMS = 6;

/*
 * Words a phrase may not contain.
 *
 * Not a general stop list — these are the joints of a headline. Cutting a
 * title into windows produces "chair with flip", "for office" and "set of 2"
 * in quantity, and every one of them reads as a broken suggestion.
 */
const EDGE_WORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "plus",
  "up", "over", "under", "per", "pcs", "pc", "x", "inc", "incl", "including",
]);

/* Model numbers, SKUs and dimension soup: nobody searches "b09xk2" and a
   suggestion made of it looks like a bug. Short numbers stay — "65 inch" and
   "4k" are how people actually type. */
function isNoise(word) {
  return word.length > 18 || /^\d{5,}$/.test(word) || /^[a-z]*\d[a-z0-9]{6,}$/.test(word);
}

function phraseWords(value) {
  return normalizedTitle(value).split(" ").filter(word => word.length > 1 && !isNoise(word));
}

/** Every one-to-three word phrase in a title, without the broken ones. */
function productPhrases(title) {
  const words = phraseWords(title);
  const phrases = new Set();
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 1; size <= MAX_PHRASE_WORDS && start + size <= words.length; size += 1) {
      const window = words.slice(start, start + size);
      if (window.some(word => EDGE_WORDS.has(word))) break;
      /* "chair desk chair" — a window that straddles the place a headline
         repeats itself. It reads as a stutter, never as a search. */
      if (new Set(window).size !== window.length) continue;
      phrases.add(window.join(" "));
    }
  }
  return phrases;
}

/* Both spellings of a head word, because a title says "desk chairs" where the
   search term said "desk chair" and neither should lose the other. */
function headForms(word) {
  const forms = new Set([word]);
  if (word.endsWith("es") && word.length > 4) forms.add(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 3) forms.add(word.slice(0, -1));
  else forms.add(`${word}s`);
  return forms;
}

function countInto(counts, phrase) {
  counts.set(phrase, (counts.get(phrase) || 0) + 1);
}

function keepFrequent(counts) {
  const kept = new Map();
  for (const [phrase, count] of counts) {
    if (count >= MIN_PHRASE_PRODUCTS) kept.set(phrase, count);
  }
  return kept;
}

/**
 * The catalogue's own vocabulary.
 *
 * Counted once per listing, so a title that repeats "chair" three times still
 * counts as one — the number is shown to a shopper as how many things they
 * would find, so it has to be that.
 */
function buildSuggestIndex(rows = []) {
  const keywordCounts = new Map();
  const titleCounts = new Map();
  const heads = new Set();

  for (const row of rows) {
    /*
     * Only the short ones. Most shops record the phrase a listing was found
     * by — "office chair", "robot vacuum" — but a feed records its own shelf
     * label instead, and "general office supplies paper products" is a filing
     * system, not something anybody types into a search box.
     */
    const keywordWords = phraseWords(row?.category);
    const keyword = keywordWords.length <= MAX_PHRASE_WORDS ? keywordWords.join(" ") : "";
    if (keyword) {
      countInto(keywordCounts, keyword);
      const last = keyword.split(" ").pop();
      for (const form of headForms(last)) heads.add(form);
    }
    for (const phrase of productPhrases(row?.title)) countInto(titleCounts, phrase);
  }

  const keywords = keepFrequent(keywordCounts);
  /* A title phrase has to end on the name of a thing, and the first list is
     where we know those names from. Without this the box offers "chair
     ergonomic" above "ergonomic chair", which is how nobody types. */
  const titles = new Map();
  for (const [phrase, count] of keepFrequent(titleCounts)) {
    if (keywords.has(phrase)) continue;
    if (!heads.has(phrase.split(" ").pop())) continue;
    titles.set(phrase, count);
  }

  return { keywords, titles, heads };
}

const containsPhrase = (haystack, needle) => haystack !== needle && ` ${haystack} `.includes(` ${needle} `);

/*
 * "thermostat" alongside "smart thermostat", both saying 13, is one suggestion
 * printed twice: the two phrases hold the same listings. When the counts are
 * equal the longer phrase says everything the shorter one does and names the
 * thing more exactly, so the shorter goes.
 */
function isRedundant(candidate, pool) {
  return pool.some(other => {
    if (other === candidate || other.count !== candidate.count) return false;
    const related = containsPhrase(other.phrase, candidate.phrase) ||
      containsPhrase(candidate.phrase, other.phrase);
    if (!related) return false;
    /* Between two of a kind, the longer phrase names the thing more exactly. */
    if (other.kind === candidate.kind) return other.phrase.length > candidate.phrase.length;
    /* Between the two lists, the phrase somebody actually searched for wins,
       long or short: it is why "coffee table" survives and "top coffee table"
       — the middle of "lift top coffee table" — does not. */
    return other.kind === "keyword";
  });
}

/* Most listings first — a suggestion is a promise about a shelf, and the
   fullest shelf is the best promise. Ties go to the shorter phrase, which is
   the more general search. */
function byUsefulness(left, right) {
  return right.count - left.count ||
    left.phrase.length - right.phrase.length ||
    (left.phrase < right.phrase ? -1 : 1);
}

/*
 * Phrases that begin with what has been typed come first: that is the word the
 * shopper is in the middle of writing. Phrases that carry it later ("ergonomic
 * office chair" for "office") come after, because they answer a different
 * question — not what you are typing, but what you might have meant.
 */
function matchesIn(source, typed, kind) {
  const starts = [];
  const carries = [];
  for (const [phrase, count] of source) {
    if (phrase === typed) continue;
    if (phrase.startsWith(typed)) starts.push({ phrase, count, kind });
    else if (phrase.includes(` ${typed}`)) carries.push({ phrase, count, kind });
  }
  starts.sort(byUsefulness);
  carries.sort(byUsefulness);
  return [...starts, ...carries];
}

/** What the box should propose for what has been typed so far. */
function suggestTerms(index, query, { limit = MAX_TERMS } = {}) {
  const typed = normalizedTitle(query);
  if (typed.length < 2 || !index) return [];

  /* Search terms before headline fragments, whatever the counts say: one of
     the two lists is made of questions people ask and the other of answers
     somebody wrote. */
  const pool = [
    ...matchesIn(index.keywords || new Map(), typed, "keyword"),
    ...matchesIn(index.titles || new Map(), typed, "catalogue"),
  ];
  const seen = new Set();
  return pool
    .filter(candidate => !isRedundant(candidate, pool))
    .filter(candidate => (seen.has(candidate.phrase) ? false : seen.add(candidate.phrase)))
    .slice(0, limit);
}

module.exports = {
  EDGE_WORDS,
  MAX_PHRASE_WORDS,
  MIN_PHRASE_PRODUCTS,
  buildSuggestIndex,
  productPhrases,
  suggestTerms,
};
