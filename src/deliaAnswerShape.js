/*
 * Keeping what Delia says consistent with what she shows.
 *
 * Ten real questions were put to her and read back as a shopper would, and the
 * worst of what came back was not a bad product. It was the answer disagreeing
 * with itself: "I would choose the Dell XPS 13" above a list with no Dell in
 * it; "Delia's pick" on the eBay listing while the sentence above recommended
 * the one at Target; "Nothing matched exactly" over two 1TB drives under $100
 * for a request for a 1TB drive under $100. A shopper who catches an assistant
 * contradicting itself once stops believing the rest.
 *
 * Each function here answers one question about an answer that is about to be
 * shown, and none of them asks the model. The model has already had its say;
 * these check it against the screen.
 */

/* ------------------------------------------------------------ citations */

/*
 * "(walmart.com)" and "(target.com, bestbuy.com)" are web-search citations the
 * model leaves inline. The shop is already named on the card underneath, so in
 * the sentence they read as leftover machinery.
 */
function stripCitationDomains(text) {
  return String(text || "")
    .replace(/\s*\((?:\s*(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s),]*)?\s*,?)+\)/gi, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* ---------------------------------------------------------- vocabulary */

const tokens = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9Ѐ-ӿ]+/iu)
    .filter(Boolean);

/*
 * Words that are not evidence of anything: they appear in sentences about any
 * product and in the titles of most. A name that is only these words cannot be
 * told apart from ordinary description.
 */
const PLAIN_WORDS = new Set([
  "the", "and", "for", "with", "you", "your", "new", "best", "good", "great",
  "one", "two", "three", "set", "pack", "free", "fast", "more", "less", "than",
  "this", "that", "these", "those", "its", "are", "not", "but", "all", "any",
  "black", "white", "blue", "red", "grey", "gray", "silver", "green", "pink",
  "wireless", "smart", "series", "edition", "model", "inch", "size", "price",
  "shipping", "delivery", "stock", "sale", "deal", "option", "options",
  "pro", "max", "plus", "mini", "ultra", "lite", "air", "home", "kit",
]);

/*
 * Capitalised words that are not products: units, currencies, standards and
 * calendar names. Without these a sentence mentioning a ZIP code or Black
 * Friday would read as naming something that is not on the screen.
 */
const NOT_A_NAME = new Set([
  "i", "usd", "cad", "gbp", "eur", "aud", "azn", "zip", "ok", "us", "uk", "eu",
  "usa", "tv", "tvs", "hd", "uhd", "fhd", "led", "oled", "qled", "lcd", "hdr",
  "ssd", "hdd", "nvme", "usb", "gb", "tb", "mb", "wifi", "wi", "fi", "ai", "pc",
  "cpu", "gpu", "ram", "anc", "diy", "vs", "faq", "id",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "black", "prime", "day",
  "cyber", "christmas", "today",
]);

function vocabularyOf(items) {
  const words = new Set();
  for (const item of items || []) {
    for (const word of tokens(item?.title)) words.add(word);
    for (const word of tokens(item?.retailer)) words.add(word);
    for (const offer of item?.other_offers || []) {
      for (const word of tokens(offer?.retailer)) words.add(word);
    }
  }
  return words;
}

/* ------------------------------------------------ naming what isn't shown */

/**
 * Whether `text` names a product that is not on the screen.
 *
 * Two ways it can, checked separately. The first is a pick the model made that
 * did not survive to the shortlist: its distinctive words appear in the text.
 * That check existed and required words of five letters or more, to keep
 * "wireless" and "espresso" from counting — which excused exactly the words
 * that name products: Dell, XPS, Sony, Bose, JBL, TCL, Roku. Three letters now,
 * with ordinary description filtered by name instead of by length.
 *
 * The second is a name the model wrote that was never a pick at all: a
 * capitalised word, not starting a sentence, that appears in no title and no
 * shop on the screen. A false alarm here costs Delia her own words for one
 * answer — the plain template is used instead — and a missed one sends the
 * shopper looking for a product that is not there, so it errs toward alarm.
 *
 * @param {string} text
 * @param {{shown: object[], withheld?: object[]}} context
 */
function namesUnshownProduct(text, { shown = [], withheld = [] } = {}) {
  const value = String(text || "");
  if (!value.trim()) return false;
  const onScreen = vocabularyOf(shown);
  const said = new Set(tokens(value));

  const withheldHit = withheld.some((item) =>
    tokens(item?.title)
      .filter((word) => word.length >= 3 && !/^\d+$/.test(word))
      .filter((word) => !PLAIN_WORDS.has(word) && !onScreen.has(word))
      .some((word) => said.has(word)),
  );
  if (withheldHit) return true;

  const sentences = value.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let index = 1; index < words.length; index += 1) {
      const raw = words[index].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      /* A name starts with a capital, or is a model number mixing letters and
         digits. Hyphenated names are judged by their parts. */
      /* "I'd", "I'll" and "Sony's" are not names; "BLACK+DECKER" is judged as
         BLACK and DECKER, the way a title's words are counted. */
      for (const part of raw.replace(/['’](?:s|d|ll|m|re|ve)$/i, "").split(/[^A-Za-z0-9]+/)) {
        if (part.length < 2) continue;
        const looksLikeName = /^[A-Z]/.test(part) || (/[A-Za-z]/.test(part) && /\d/.test(part));
        if (!looksLikeName) continue;
        const word = part.toLowerCase();
        if (NOT_A_NAME.has(word) || PLAIN_WORDS.has(word) || /^\d/.test(word) && !/[a-z]/.test(word)) continue;
        if (!onScreen.has(word)) return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------ which one she meant */

/**
 * The index of the shown product the text recommends, or -1.
 *
 * "Delia's pick" was the first offer in ranking order, and her sentence was
 * written separately; nothing checked that they agreed. So the sentence above
 * could recommend the K-Supreme at Target while the badge sat on the one on
 * eBay.
 *
 * The first sentence that mentions any product decides. Each shown product
 * scores on the words that tell it apart — a word every product shares, like
 * the brand in a list of Keurigs, is worth little, and the shop's name counts
 * the same way — and the best score wins.
 */
function pickFromNarrative(text, items) {
  const list = items || [];
  if (!list.length) return -1;
  const itemWords = list.map((item) => {
    const words = new Set(
      [...tokens(item?.title), ...tokens(item?.retailer)].filter(
        (word) => word.length >= 2 && !PLAIN_WORDS.has(word) && !/^\d+$/.test(word),
      ),
    );
    return words;
  });
  const frequency = new Map();
  for (const words of itemWords) {
    for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  for (const sentence of String(text || "").split(/(?<=[.!?])\s+/)) {
    const said = new Set(tokens(sentence));
    const scores = itemWords.map((words) =>
      [...words].reduce((sum, word) => (said.has(word) ? sum + 1 / frequency.get(word) : sum), 0),
    );
    const best = Math.max(...scores);
    /* A sentence has to say something that tells products apart — a whole
       word's worth — before it counts as naming one. */
    if (best >= 1) {
      const winners = scores.filter((score) => score === best).length;
      if (winners === 1) return scores.indexOf(best);
    }
  }
  return -1;
}

/* ---------------------------------------------------------- condition */

/*
 * Restored, renewed and open-box stock is a real choice and a cheaper one, and
 * it was shown between new consoles with nothing to say it was not new — as the
 * second-cheapest answer to "cheapest PS5".
 */
/*
 * Which kind of not-new it is. "Pre-owned" was labelled "Refurbished", and they
 * are different promises: a refurbished console has been checked and usually
 * carries a warranty, a pre-owned one is simply second-hand.
 *
 * @returns {"" | "refurbished" | "pre_owned" | "open_box"}
 */
function offerCondition(item) {
  const title = String(item?.title || "");
  const stated = String(item?.condition || "");
  const text = `${title} ${stated}`;
  if (/\bopen[\s_-]?box\b/i.test(text)) return "open_box";
  if (/\b(refurbished|renewed|restored|reconditioned)\b/i.test(text)) return "refurbished";
  if (/\b(pre[\s_-]?owned|second[\s-]?hand)\b/i.test(text)) return "pre_owned";
  /* "Used" only where it describes the item, not "used for gaming". */
  if (/^used\b/i.test(title) || /[(\-–—:,]\s*used\s*[)\-–—:]?\s*$/i.test(title) || /\bused\b/i.test(stated)) {
    return "pre_owned";
  }
  return "";
}

function isRefurbishedOffer(item) {
  return offerCondition(item) !== "";
}

function wantsUsedCondition(request) {
  return /\b(used|refurbished|renewed|pre-?owned|open[\s-]?box|second[\s-]?hand)\b|б\/у|восстановлен/iu.test(
    String(request || ""),
  );
}

/* ------------------------------------------------------------- groups */

/**
 * The shortlist in three groups, then everything else.
 *
 * Delia's pick first — the product her sentence recommends when she wrote one,
 * otherwise the offer the ranking trusts most. Then a cheaper option: the most
 * trusted offer that costs less than the pick. Then the lowest price. Each is
 * a different product; a pick that is also the cheapest is marked as both
 * rather than shown twice. The rest follow in price order.
 *
 * "Cheaper option" rather than "best value", deliberately: a web result has no
 * reviews for this site to judge value from, and the label says only what is
 * known — it is well ranked and it costs less.
 *
 * Refurbished stock is never the lowest price unless the shopper asked for
 * used or refurbished, and a request for the cheapest has no pick at all unless
 * Delia named one: the question was about price, not about which is best.
 *
 * A comparison keeps the order the shopper named things in.
 *
 * @param {object[]} items in ranking order
 * @param {{request?: string, narrative?: string, landedPrice: (item: object) => number,
 *   isComparison?: boolean, lowerPriceRequested?: boolean}} options
 */
function arrangeRecommendations(items, options) {
  const list = [...(items || [])];
  if (!list.length) return [];
  const {
    request = "",
    narrative = "",
    landedPrice,
    isComparison = false,
    lowerPriceRequested = false,
    /* Set when Delia has already said which one she would take, by position in
       `items`. Wins over reading it out of her sentence. */
    pickIndex: chosenIndex = -1,
  } = options;
  const priceOf = (item) => {
    const price = Number(landedPrice(item));
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
  const allowUsed = wantsUsedCondition(request);
  const eligibleForPriceRoles = (item) => allowUsed || !isRefurbishedOffer(item);
  const withCondition = (item) => {
    const condition = offerCondition(item);
    return condition ? { ...item, condition } : item;
  };
  const anyNotNew = !allowUsed && list.some(isRefurbishedOffer);

  const cheapestIndex = () => {
    let found = -1;
    list.forEach((item, index) => {
      if (!priceOf(item) || !eligibleForPriceRoles(item)) return;
      if (found < 0 || priceOf(item) < priceOf(list[found])) found = index;
    });
    return found;
  };

  if (isComparison) {
    const lowest = cheapestIndex();
    return list.map((item, index) => ({
      ...withCondition(item),
      position_role: index === 0 && !lowerPriceRequested ? "best_overall" : index === lowest ? "lowest_price" : "alternative",
    }));
  }

  const named = Number.isInteger(chosenIndex) && chosenIndex >= 0 && chosenIndex < list.length
    ? chosenIndex
    : narrative ? pickFromNarrative(narrative, list) : -1;
  const pickIndex = named >= 0 ? named : lowerPriceRequested ? -1 : 0;
  const lowestIndex = cheapestIndex();
  /* A pre-owned console at $589 under a new one at $649 is the real lowest
     price, and hiding it among "Other options" made the new one look like a
     mistake. It gets its own group, named for what it is. */
  const lowestNewPrice = lowestIndex >= 0 ? priceOf(list[lowestIndex]) : Infinity;
  let lowestUsedIndex = -1;
  if (anyNotNew) {
    list.forEach((item, index) => {
      if (!isRefurbishedOffer(item) || !priceOf(item) || priceOf(item) >= lowestNewPrice) return;
      if (lowestUsedIndex < 0 || priceOf(item) < priceOf(list[lowestUsedIndex])) lowestUsedIndex = index;
    });
  }
  const pickPrice = pickIndex >= 0 ? priceOf(list[pickIndex]) : 0;
  const cheaperIndex = pickIndex >= 0 && pickPrice
    ? list.findIndex(
        (item, index) =>
          index !== pickIndex &&
          index !== lowestIndex &&
          priceOf(item) > 0 &&
          priceOf(item) < pickPrice &&
          eligibleForPriceRoles(item),
      )
    : -1;

  const leading = [pickIndex, cheaperIndex, lowestIndex, lowestUsedIndex].filter(
    (index, position, all) => index >= 0 && all.indexOf(index) === position,
  );
  const rest = list
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !leading.includes(index))
    .sort((left, right) => (priceOf(left.item) || Infinity) - (priceOf(right.item) || Infinity))
    .map(({ index }) => index);

  return [...leading, ...rest].map((index) => {
    const item = withCondition(list[index]);
    /* "Lowest price" over a list that also holds cheaper second-hand stock is
       not true, so it says new. */
    const newOnly = anyNotNew ? { lowest_new: true } : {};
    if (index === pickIndex) {
      return {
        ...item,
        position_role: "best_overall",
        lowest_price: index === lowestIndex,
        ...(index === lowestIndex ? newOnly : {}),
      };
    }
    if (index === cheaperIndex) return { ...item, position_role: "cheaper_option" };
    if (index === lowestIndex) return { ...item, position_role: "lowest_price", ...newOnly };
    if (index === lowestUsedIndex) return { ...item, position_role: "lowest_used_price" };
    return { ...item, position_role: "alternative" };
  });
}

/* -------------------------------------------------------- price facts */

/**
 * The arithmetic about a shortlist, done here rather than by the model.
 *
 * "Walmart is $24 cheaper, about 9.6% less" is what a shopper comparing prices
 * wants to read, and a language model asked to subtract two prices will now
 * and then get it wrong. So every number Delia says about prices is worked out
 * here and handed to her as a fact to repeat.
 *
 * @param {object[]} items in the order the shopper sees them
 * @param {(item: object) => number} landedPrice
 * @returns {{products: object[], facts: string[]}}
 */
function shortlistPriceFacts(items, landedPrice, { currency = "USD" } = {}) {
  const list = items || [];
  const money = (value) => {
    const amount = Number(value).toFixed(2);
    return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
  };
  const priceOf = (item) => {
    const price = Number(landedPrice(item));
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
  const products = list.map((item, index) => ({
    position: index + 1,
    title: String(item?.title || "").slice(0, 160),
    retailer: String(item?.retailer || "").slice(0, 60),
    price: priceOf(item) ? money(priceOf(item)) : "price not shown",
    condition: offerCondition(item) || "new",
    group: item?.position_role || "",
    also_at: (item?.other_offers || [])
      .slice(0, 3)
      .map((offer) =>
        [offer?.retailer, Number(offer?.price_value) > 0 ? money(offer.price_value) : ""].filter(Boolean).join(" "),
      ),
  }));
  const facts = [];
  const priceAt = (product) => priceOf(list[product.position - 1]);
  const priced = products.filter((product) => priceAt(product));
  const byPrice = [...priced].sort((left, right) => priceAt(left) - priceAt(right));
  const cheapestNew = byPrice.find((product) => product.condition === "new");
  const cheapestUsed = byPrice.find((product) => product.condition !== "new");
  if (cheapestNew) {
    facts.push(`Lowest new price: #${cheapestNew.position} at ${cheapestNew.retailer}, ${cheapestNew.price}.`);
  }
  if (cheapestUsed && (!cheapestNew || priceAt(cheapestUsed) < priceAt(cheapestNew))) {
    facts.push(
      `Lowest price overall is not new: #${cheapestUsed.position} (${cheapestUsed.condition.replace("_", "-")}) at ${cheapestUsed.retailer}, ${cheapestUsed.price}.`,
    );
  }
  for (let left = 0; left < priced.length; left += 1) {
    for (let right = left + 1; right < priced.length; right += 1) {
      const [a, b] = [priced[left], priced[right]];
      if (priceAt(a) === priceAt(b)) {
        facts.push(`#${a.position} and #${b.position} cost the same.`);
        continue;
      }
      const [cheap, dear] = priceAt(a) < priceAt(b) ? [a, b] : [b, a];
      const gap = priceAt(dear) - priceAt(cheap);
      const percent = (gap / priceAt(dear)) * 100;
      facts.push(
        `#${cheap.position} is ${money(gap)} cheaper than #${dear.position} (about ${percent.toFixed(percent < 10 ? 1 : 0)}% less).`,
      );
    }
  }
  return { products, facts: facts.slice(0, 24) };
}

/* ------------------------------------------------------------- counts */

/*
 * What a count of offers actually counts. "I found 6 shops selling it" was
 * said over six different chairs, five of them from eBay: neither six shops
 * nor one product.
 */
function outcomeCounts(offers) {
  const list = offers || [];
  const shops = new Set();
  for (const offer of list) {
    const name = String(offer?.retailer || "").trim().toLowerCase();
    if (name) shops.add(name);
    for (const other of offer?.other_offers || []) {
      const otherName = String(other?.retailer || "").trim().toLowerCase();
      if (otherName) shops.add(otherName);
    }
  }
  return {
    products: list.length,
    shops: shops.size,
    retailer: list.length ? String(list[0]?.retailer || "").trim() : "",
  };
}

/* -------------------------------------------------------------- sizes */

const UNIT_FAMILIES = [
  { pattern: "tb|terabytes?", family: "storage", factor: 1000 },
  { pattern: "gb|gigabytes?", family: "storage", factor: 1 },
  { pattern: "fl\\.?\\s*oz|oz|ounces?", family: "volume-oz", factor: 1 },
  { pattern: "ml|millilit(?:er|re)s?", family: "volume-l", factor: 1 },
  { pattern: "l|lit(?:er|re)s?", family: "volume-l", factor: 1000 },
  { pattern: "qt|quarts?", family: "quart", factor: 1 },
  { pattern: "lbs?|pounds?", family: "weight-lb", factor: 1 },
  { pattern: "kg|kilograms?", family: "weight-kg", factor: 1 },
  { pattern: "w|watts?", family: "power", factor: 1 },
  { pattern: "mah", family: "battery", factor: 1 },
  { pattern: "v|volts?", family: "voltage", factor: 1 },
  { pattern: "cups?", family: "cups", factor: 1 },
];

const UNIT_ALTERNATION = UNIT_FAMILIES.map((unit) => unit.pattern).join("|");

function measure(amount, unitText) {
  const unit = UNIT_FAMILIES.find((candidate) => new RegExp(`^(?:${candidate.pattern})$`, "i").test(unitText));
  if (!unit) return null;
  return { family: unit.family, value: Number(amount) * unit.factor };
}

/**
 * Whether a title states the size that was asked for, or null when the size
 * asked for is not a measurement this can read.
 *
 * "1TB" was being checked the way a shoe size is — against the list of sizes a
 * clothing listing publishes. A hard drive has no such list, so every drive
 * came back unconfirmed and Delia said nothing matched, over two drives that
 * matched exactly. A measurement is stated in the product's own name, so that
 * is where it is read: 1TB finds "1TB" and "1000GB", 32 oz finds "32 fl oz".
 */
function measurementSizeMatch(title, requestedSize) {
  const requested = String(requestedSize || "").trim();
  const bed = requested.match(/^(twin(?:\s*xl)?|full|queen|king|cal(?:ifornia)?\s*king)$/i);
  if (bed) {
    const word = bed[1].toLowerCase().replace(/\s+/g, "\\s*");
    return new RegExp(`\\b${word}\\b`, "i").test(String(title || ""));
  }
  const wanted = requested.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALTERNATION})$`, "i"));
  if (!wanted) return null;
  const target = measure(wanted[1], wanted[2]);
  if (!target) return null;
  const stated = String(title || "").matchAll(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*-?\\s*(${UNIT_ALTERNATION})(?![a-z])`, "gi"),
  );
  for (const match of stated) {
    const found = measure(match[1], match[2]);
    if (found && found.family === target.family && Math.abs(found.value - target.value) < 1e-6) return true;
  }
  return false;
}

module.exports = {
  arrangeRecommendations,
  isRefurbishedOffer,
  measurementSizeMatch,
  offerCondition,
  shortlistPriceFacts,
  namesUnshownProduct,
  outcomeCounts,
  pickFromNarrative,
  stripCitationDomains,
  wantsUsedCondition,
};
