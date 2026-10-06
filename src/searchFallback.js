/*
 * What to do with a search that finds nothing.
 *
 * An empty results page is read as an empty shop. It almost never is: the
 * catalogue holds two thousand listings and the query missed by one letter, or
 * by one word that means the same thing on the other side of an ocean. Three
 * of the commonest ways to miss, in the order they are tried:
 *
 *   - a letter out of place — "chiar", "wireles", "matress";
 *   - a different word for the same thing — sofa and couch, earbuds and
 *     earphones, trainers and sneakers;
 *   - both at once.
 *
 * The replacement is never invented. It is always a phrase the catalogue can
 * answer today, taken from the same vocabulary the suggestions are built from
 * (src/searchSuggest.js), so a rescued search cannot land on another empty
 * page. What the shopper typed is kept and shown, because a search box that
 * quietly answers a different question than the one asked is worse than one
 * that finds nothing.
 */
const { normalizedTitle } = require("./ranker");

/* One letter's grace for a short word, two for a long one. Wider than that and
   "tent" rescues "rent", "dent" and "tenth", which is not a correction — it is
   a guess wearing a correction's clothes. */
const SHORT_WORD = 6;

/*
 * Words for the same thing.
 *
 * Each line is a set: any member may be swapped for any other. Two kinds are
 * here on purpose — plain synonyms, and the pairs where British and American
 * English disagree, because the site sells into both and a shopper in
 * Manchester types "trainers" for what the catalogue calls sneakers.
 */
const SYNONYM_SETS = [
  ["earbuds", "earphones", "headphones"],
  ["sofa", "couch", "settee"],
  ["sneakers", "trainers"],
  ["torch", "flashlight"],
  ["cooker", "stove"],
  ["hoover", "vacuum"],
  ["mobile", "cellphone", "smartphone"],
  ["tv", "television"],
  ["fridge", "refrigerator"],
  ["laptop", "notebook"],
  ["trousers", "pants"],
  ["pram", "stroller"],
  ["nappy", "diaper"],
  ["dummy", "pacifier"],
  ["lorry", "truck"],
  ["boot", "trunk"],
  ["tap", "faucet"],
  ["bin", "trash can"],
  ["cot", "crib"],
  ["duvet", "comforter"],
  ["jumper", "sweater"],
  ["spanner", "wrench"],
  ["mattress", "bed"],
  ["monitor", "display"],
  ["speaker", "loudspeaker"],
  ["backpack", "rucksack"],
];

const SYNONYMS = new Map();
for (const set of SYNONYM_SETS) {
  for (const word of set) {
    SYNONYMS.set(word, [...new Set([...(SYNONYMS.get(word) || []), ...set.filter(other => other !== word)])]);
  }
}

/**
 * The same query said the other way round.
 *
 * One word is swapped at a time: two swaps in one query is no longer the same
 * question. Multi-word replacements ("trash can") are allowed, which is why
 * this works on the string rather than on a token list.
 */
function synonymVariants(query) {
  const words = normalizedTitle(query).split(" ").filter(Boolean);
  const variants = [];
  for (let index = 0; index < words.length; index += 1) {
    for (const replacement of SYNONYMS.get(words[index]) || []) {
      variants.push([...words.slice(0, index), replacement, ...words.slice(index + 1)].join(" "));
    }
  }
  return [...new Set(variants)];
}

/**
 * How many single-letter edits apart two words are, giving up past `limit`.
 *
 * Two rows rather than a full matrix: this runs against a few thousand phrases
 * while somebody is typing, and the whole grid is memory nobody reads twice.
 */
function editDistance(left, right, limit = 2) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let beforePrevious = null;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      /* Two neighbours the wrong way round is one mistake, not two. It is the
         commonest typo there is — "chiar", "recieve" — and counting it as two
         puts every one of them out of reach of a one-letter correction. */
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
      if (current[j] < best) best = current[j];
    }
    /* Every remaining row can only add, so a row that is already too far
       cannot come back. */
    if (best > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

const allowedDistance = word => (word.length <= SHORT_WORD ? 1 : 2);

/** Every phrase the catalogue can answer, longest-standing first. */
function vocabulary(index) {
  return [
    ...(index?.keywords ? [...index.keywords.entries()] : []),
    ...(index?.titles ? [...index.titles.entries()] : []),
  ];
}

/**
 * The phrase in the catalogue's vocabulary closest to what was typed.
 *
 * Compared word count first: "offce chair" should reach "office chair" and not
 * "chair", which is closer by letters but answers a different question.
 */
function closestPhrase(index, query) {
  const typed = normalizedTitle(query);
  if (typed.length < 3) return null;
  const typedWords = typed.split(" ");
  let best = null;
  for (const [phrase, count] of vocabulary(index)) {
    const words = phrase.split(" ");
    if (words.length !== typedWords.length) continue;
    let distance = 0;
    for (let index_ = 0; index_ < words.length && distance <= 2; index_ += 1) {
      distance += editDistance(typedWords[index_], words[index_], allowedDistance(typedWords[index_]));
    }
    if (distance === 0 || distance > 2) continue;
    if (!best || distance < best.distance || (distance === best.distance && count > best.count)) {
      best = { phrase, count, distance };
    }
  }
  return best;
}

/**
 * What to search instead, or nothing.
 *
 * Only ever called when the query as typed found nothing. A synonym is
 * preferred over a spelling correction: swapping "couch" for "sofa" answers
 * the question that was asked, while changing a letter assumes the shopper
 * made a mistake, and one of those two is a smaller thing to assume.
 */
function rescueQuery(index, query, { hasResults } = {}) {
  const typed = normalizedTitle(query);
  if (!typed) return null;

  for (const variant of synonymVariants(typed)) {
    if (typeof hasResults === "function" ? hasResults(variant) : true) {
      return { query: variant, reason: "synonym" };
    }
  }

  const closest = closestPhrase(index, typed);
  if (closest && (typeof hasResults !== "function" || hasResults(closest.phrase))) {
    return { query: closest.phrase, reason: "spelling" };
  }
  return null;
}

module.exports = {
  SYNONYMS,
  SYNONYM_SETS,
  closestPhrase,
  editDistance,
  rescueQuery,
  synonymVariants,
};
