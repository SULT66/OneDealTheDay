/*
 * What a discount badge is allowed to claim (lib/pricing.ts).
 *
 * The reference beside a listing is the seller's own "was" price. A storage
 * cabinet selling at $124 carried a $939 reference and the page printed "87%
 * below reference" as a fact of ours. It was the seller's number, and at that
 * size it is the kind of number that has to be earned.
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

const format = load("lib/format.ts", {});
const { displayDiscount, EXTRAORDINARY_DISCOUNT } = load("lib/pricing.ts", { "./format": format, "./types": {} });

const point = (date, price) => ({ date, price });

/* An everyday saving is shown as it always was. */
assert.strictEqual(displayDiscount(80, 100), 20);
assert.strictEqual(displayDiscount(50, 100), 50);
assert.strictEqual(displayDiscount(100, 100), null, "no saving against an equal reference");
assert.strictEqual(displayDiscount(100, null), null, "no reference, no claim");

/* The line itself, and just under it. */
assert.strictEqual(displayDiscount(31, 100), 69);
assert.strictEqual(EXTRAORDINARY_DISCOUNT, 70);

/* Above it, the seller's word alone is not enough — which is all a catalogue
   card ever has. */
assert.strictEqual(displayDiscount(124.18, 939.99), null, "the Sterilite claim went out unchecked");
assert.strictEqual(displayDiscount(30, 100), null);
assert.strictEqual(displayDiscount(30, 100, []), null);

/* Unless we ourselves recorded a price near that reference. */
assert.strictEqual(
  displayDiscount(30, 100, [point("2026-09-01", 95), point("2026-09-10", 30)]),
  70,
  "our own observation supports the reference",
);
assert.strictEqual(
  displayDiscount(30, 100, [point("2026-09-01", 60), point("2026-09-10", 30)]),
  null,
  "a history that never came near the reference does not support it",
);

/* The pages ask pricing, not the raw arithmetic. */
for (const file of ["components/deal/DealCard.tsx", "components/deal/PriceBlock.tsx", "app/[market]/deal/[id]/page.tsx"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert(/displayDiscount\(/.test(source), `${file} no longer goes through the claim check`);
  assert(!/discountPercent\(/.test(source), `${file} prints the raw seller discount again`);
}

/* And the badge says whose number it is. */
const { appCopy } = require("../src/i18n-app");
for (const language of ["en", "es", "fr", "de"]) {
  const copy = `${appCopy[language]["app.card.percentBelowRef"]} ${appCopy[language]["app.deal.belowReference"]}`.toLowerCase();
  assert(/list|liste|vendeur|verkäufer|lista/.test(copy), `${language} still claims the reference as ours`);
}

console.log("pricing claims: ok");
