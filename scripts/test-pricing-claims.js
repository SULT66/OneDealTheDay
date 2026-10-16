/*
 * Whose number the percentage is.
 *
 * The reference beside a listing is the seller's own "was" price. A storage
 * cabinet selling at $124 carried a $939 reference and the page printed "87%
 * below reference" as a fact of ours. The first fix only stopped the
 * extraordinary ones, and that drew the line in the wrong place: fifty per
 * cent off a doubled list price is exactly as unchecked as eighty-seven, and
 * far more common. Measured on 2026-10-13, 344 of 2,380 listings printed a
 * saving worked out from the seller's figure, not one of them carried an
 * independent comparison behind it, and the drops the site had actually
 * measured itself came to 111.
 *
 * So the rule this file guards is simple and total: the only percentage the
 * site prints is the one it measured. The seller's figure still shows, named
 * as theirs, with no arithmetic of ours performed on it.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function load(file, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = new Module(file);
  mod.require = (request) => (stubs[request] ? stubs[request] : require(request));
  mod._compile(outputText, `${file}.js`);
  return mod.exports;
}

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
/* Comments describe what the code used to do; they must not satisfy a check
   that the code no longer does it. */
const codeOf = (file) => read(file)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const { trackedSaving } = load("lib/pricing.ts", { "./types": {} });

/* --- The one number we may put a percent sign on. --- */
assert.strictEqual(trackedSaving(12), 12);
assert.strictEqual(trackedSaving(11.6), 12, "the nightly figure arrives rounded; never trust that twice");
assert.strictEqual(trackedSaving(0), null, "a price that has not moved claims nothing");
assert.strictEqual(trackedSaving(null), null);
assert.strictEqual(trackedSaving(undefined), null);
assert.strictEqual(trackedSaving(-5), null, "a rise is not a saving");

/*
 * --- Nothing computes a saving from the seller's figure. ---
 *
 * The old helper took (price, referencePrice) and returned a percentage; its
 * absence is the whole point, so this looks for the shape as well as the name.
 */
assert.ok(
  !/referencePrice/.test(codeOf("lib/pricing.ts")),
  "lib/pricing.ts is working arithmetic on the seller's reference again",
);
for (const file of [
  "components/deal/PriceBlock.tsx",
  "components/deal/DealCard.tsx",
  "components/deal/FeaturedDeal.tsx",
  "app/[market]/deal/[id]/page.tsx",
]) {
  const source = codeOf(file);
  assert(!/displayDiscount\(/.test(source), `${file} still computes the seller's discount`);
  assert(!/discountPercent\(/.test(source), `${file} prints the raw seller discount again`);
}

/* The price block shows their figure, and says it is theirs. */
const block = codeOf("components/deal/PriceBlock.tsx");
assert(/trackedSaving\(/.test(block), "the price block no longer asks what it may claim");
assert(/app\.price\.sellerList/.test(block), "the struck-through figure is no longer attributed to the seller");
assert(/app\.card\.trackedDropShort/.test(block), "the pill beside the price is no longer our own measurement");

/* --- The strings themselves, in every language the site speaks. --- */
const { PRICE_CONFIDENT_HOURS } = require("../src/productPresentation");
const { appCopy } = require("../src/i18n-app");
for (const language of ["en", "es", "fr", "de"]) {
  const words = appCopy[language];
  assert.strictEqual(words["app.card.percentBelowRef"], undefined, `${language} can still say "% below seller's list"`);
  assert.strictEqual(words["app.deal.belowReference"], undefined, `${language} can still claim the reference as a saving`);
  assert.ok(words["app.price.sellerList"], `${language} has no way to name the seller's figure`);
  assert.ok(
    !/%|\{percent\}/.test(words["app.price.sellerList"]),
    `${language} attaches a percentage to the seller's figure`,
  );
  assert.ok(
    /list|liste|lista|verkäufer|vendeur|vendedor/i.test(words["app.price.sellerList"]),
    `${language} does not say whose figure it is`,
  );
  assert.ok(words["app.card.trackedDrop"] && words["app.card.trackedDropShort"], `${language} cannot state our own drop`);
}

/* --- And the same on the server, which feeds the API and Delia. --- */
const { copy } = require("../src/i18n");
for (const language of ["en", "es", "fr", "de"]) {
  const strings = copy[language];
  for (const gone of ["product.belowReference", "product.belowReferencePercent", "product.off"]) {
    assert.strictEqual(strings[gone], undefined, `${language} still carries ${gone}`);
  }
  for (const needed of ["product.priceDropped", "product.trackedDropPercent", "product.trackedDropShort"]) {
    assert.ok(strings[needed], `${language} is missing ${needed}`);
  }
}

/*
 * --- The listing that started this. ---
 *
 * The Hecef knife set: $25.99 against a $51.98 reference, exactly double, three
 * reviews, and no price we ever recorded moving. It was Today's #1 Pick on
 * 2026-10-12 under a pill reading "50% BELOW SELLER'S LIST". Nothing on the
 * page may say fifty per cent about it.
 */
const { presentProduct } = require("../src/productPresentation");
const fresh = new Date().toISOString();
const knives = {
  id: 1, market: "us", source: "ebay", retailer_name: "eBay",
  title: "Hecef Kitchen Knife Set 5Pcs Stonewashed Chef Knife Cutlery Set",
  image_url: "https://example.test/knives.jpg", affiliate_url: "https://www.ebay.com/itm/1",
  current_price: 25.99, original_price: 51.98, currency: "USD", checked_at: fresh,
  rating: 5, review_count: 3, tracked_drop_percent: 0, tracked_low: 0,
  shipping_summary: "Free shipping", return_summary: "Returns accepted within 30 days",
  availability: "In stock", seller_name: "hecef_official", seller_rating: 4.975, seller_feedback_count: 4542,
};
const shownKnives = presentProduct(knives, "en");
assert.strictEqual(shownKnives.display_save_label, "", "the seller's doubled list price is a saving again");
assert.strictEqual(shownKnives.display_off_label, "", "the seller's doubled list price is a percentage again");
assert.notStrictEqual(shownKnives.display_badge, "BELOW REFERENCE", "the badge is back to repeating the seller");
assert.ok(shownKnives.display_original_price, "their figure should still show — attributed, not computed from");

/* A price we watched fall says so, in our own words. */
const watched = presentProduct({ ...knives, id: 2, tracked_drop_percent: 18, tracked_low: 25.99 }, "en");
assert.ok(/18/.test(watched.display_save_label), "a drop we measured prints nothing");
assert.strictEqual(watched.display_badge, "PRICE DROPPED");

/*
 * --- The badge order: what buyers said outranks what the price did. ---
 *
 * The discount test used to come first, so 4.8 stars from three thousand
 * buyers were labelled BELOW REFERENCE. The badge advertised the weakest thing
 * known about a listing and hid the strongest.
 */
const reviewed = presentProduct({
  ...knives, id: 3, rating: 4.8, review_count: 3000, tracked_drop_percent: 22,
}, "en");
assert.strictEqual(reviewed.display_badge, "STRONG REVIEWS", "reviews lost their place to the price again");

/*
 * The badge has to say whose observation it is.
 *
 * "DOWN 9%" was the wording, and a shopper reads that as a shop taking 9% off
 * — the one thing it is not. The number compares today's price with the
 * highest price we recorded ourselves; nobody is discounting anything. On
 * 2026-10-15 the day's top pick carried that badge over a price the seller had
 * already raised to $6.98, which is what made the ambiguity worth settling
 * rather than arguing about.
 */
const OBSERVER = /\bwe\b|nous|wir|registramos|visto|relevé|notiert|erfasst|recorded|saw/i;
const DISCOUNT_WORD = /\b(off|discount|rabatt|descuento|remise|sale|baja|down)\b/i;

for (const language of ["en", "es", "fr", "de"]) {
  for (const key of ["app.card.trackedDrop", "app.card.trackedDropShort"]) {
    const phrase = String(appCopy[language][key] || "");
    assert.ok(phrase, `${language} is missing ${key}`);
    assert.ok(
      OBSERVER.test(phrase),
      `${language} ${key} does not say who saw the higher price: "${phrase}"`,
    );
    assert.ok(
      !DISCOUNT_WORD.test(phrase),
      `${language} ${key} reads as a retailer's discount rather than our own measurement: "${phrase}"`,
    );
  }
  for (const key of ["product.trackedDropPercent", "product.trackedDropShort"]) {
    const phrase = String(copy[language][key] || "");
    assert.ok(phrase, `${language} is missing ${key}`);
    assert.ok(
      OBSERVER.test(phrase),
      `${language} ${key} does not say who saw the higher price: "${phrase}"`,
    );
    assert.ok(
      !DISCOUNT_WORD.test(phrase),
      `${language} ${key} reads as a retailer's discount: "${phrase}"`,
    );
  }
}

/*
 * The window named in the copy is the window actually measured.
 *
 * The long badge says "in the last 60 days" in four languages, and WINDOW_DAYS
 * in src/trackedPrice.js is what the measurement uses. They live far enough
 * apart to drift silently, and the drift would simply start telling people the
 * wrong period.
 */
const { WINDOW_DAYS } = require("../src/trackedPrice");
for (const language of ["en", "es", "fr", "de"]) {
  const phrase = String(appCopy[language]["app.card.trackedDrop"] || "");
  assert.ok(
    phrase.includes(String(WINDOW_DAYS)),
    `${language} promises a window that is not ${WINDOW_DAYS} days: "${phrase}"`,
  );
}

/*
 * How long a price may have been confirmed before we stop doing arithmetic on it.
 *
 * This assertion used to demand eight hours or fewer, on the belief that the
 * catalogue re-checks every listing every six. It does not: six hours is how
 * often a sweep starts, and the sweep works through the catalogue over more
 * than a day. Measured with the narrow window live, 208 of 3,072 listings were
 * current, the Daily Drop had nothing to show, and production verification
 * failed. The assertion was wrong and it passed, which is the worse kind.
 *
 * A day is what a daily pick needs and what this catalogue sustains. The
 * ceiling below is the real limit: past it, "checked recently" stops meaning
 * anything to a shopper.
 */
assert.ok(
  PRICE_CONFIDENT_HOURS <= 24,
  `a price confirmed ${PRICE_CONFIDENT_HOURS} hours ago is still treated as current, `
    + "which is no longer a price anyone would call checked",
);
assert.ok(
  PRICE_CONFIDENT_HOURS >= 12,
  `a ${PRICE_CONFIDENT_HOURS}-hour window silences most of the catalogue: the sweep takes `
    + "longer than that to come round, so the Daily Drop empties and almost nothing carries a badge",
);

console.log("pricing claims: ok");
