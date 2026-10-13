/*
 * What the homepage's "Best right now" shelf holds.
 *
 * The shelf had two faults at once, and the second hid behind the first. It
 * walked the catalogue in the backend's ranking order, applied its caps as it
 * went, and only then sorted what it had taken — so the caps filled up on
 * whatever happened to rank early and the highest-scoring listings were never
 * considered. And the per-retailer cap, there to stop one shop filling the
 * grid, could not do that job at all: only eBay sends product reviews, without
 * reviews there is no published Score, so every candidate comes from one shop
 * and the cap simply cut the shelf short.
 *
 * Measured on production on 2026-10-13: the grid showed 86, 85, 85, 85 — three
 * of them the same watch in different colours — while 92, 91, 91, 90 and 90
 * sat in the same catalogue, unconsidered. With both faults fixed the same
 * data fills all twelve places, 92 down to 86, across eight categories.
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

const { chooseTopPicks } = load("lib/topPicks.ts", { "./types": {} });

const deal = (score, category, retailer, id = `${score}-${category}-${retailer}`) =>
  ({ id, score, category, retailer, title: `${category} at ${score}` });

/* --- It chooses by the number it prints. --- */
{
  /* Deliberately in the wrong order: the backend's ranking is not the shelf's
     ranking, and the best listings used to arrive last and be turned away. */
  const catalogue = [
    deal(70, "Office", "eBay"),
    deal(72, "Office", "eBay"),
    deal(74, "Office", "eBay"),
    deal(76, "Fashion", "eBay"),
    deal(92, "Toys & Games", "eBay"),
    deal(91, "Tools & DIY", "eBay"),
  ];
  const picked = chooseTopPicks(catalogue, { limit: 3 });
  assert.deepStrictEqual(
    picked.map(p => p.score),
    [92, 91, 76],
    "the shelf is filling on the order it reads rather than on the score it prints",
  );
}

/* --- An unscored listing is not offered as one of the best. --- */
{
  const picked = chooseTopPicks([
    deal(null, "Office", "eBay", "unscored"),
    deal(80, "Office", "eBay"),
  ], { limit: 5 });
  assert.deepStrictEqual(picked.map(p => p.id), ["80-Office-eBay"]);
}

/* --- Short rather than padded. --- */
{
  const picked = chooseTopPicks([deal(80, "Office", "eBay")], { limit: 12 });
  assert.strictEqual(picked.length, 1, "the grid is being padded back out with what the rules rejected");
}

/*
 * --- The per-retailer cap applies when there is a second shop, and not when
 * there is only one. ---
 */
{
  /* One shop in the running: the cap has nothing to spread across, so it must
     not shrink the shelf. This is today's catalogue. */
  const oneShop = Array.from({ length: 12 }, (_, i) =>
    deal(90 - i, `Category ${i}`, "eBay", `one-${i}`));
  assert.strictEqual(
    chooseTopPicks(oneShop, { limit: 12, perRetailer: 4 }).length,
    12,
    "the retailer cap is still cutting the shelf to four when only one shop can earn a Score",
  );

  /* Two shops: the cap means what it says again, by itself, with no setting to
     change on the day another source starts sending reviews. */
  const twoShops = [
    ...Array.from({ length: 8 }, (_, i) => deal(90 - i, `Category ${i}`, "eBay", `ebay-${i}`)),
    deal(60, "Late", "Newegg", "newegg-1"),
  ];
  const mixed = chooseTopPicks(twoShops, { limit: 12, perRetailer: 4 });
  assert.strictEqual(
    mixed.filter(p => p.retailer === "eBay").length,
    4,
    "with two shops in the running one of them may fill the grid again",
  );
  assert.ok(mixed.some(p => p.retailer === "Newegg"), "the second shop was shut out");
}

/* --- And one category still cannot take the whole grid. --- */
{
  const sameCategory = Array.from({ length: 10 }, (_, i) =>
    deal(90 - i, "Office", "eBay", `office-${i}`));
  assert.strictEqual(
    chooseTopPicks(sameCategory, { limit: 12, perCategory: 3 }).length,
    3,
    "twelve desk gadgets from one category is back",
  );
}

/* --- The order out is the order printed. --- */
{
  const picked = chooseTopPicks([
    deal(81, "A", "eBay"), deal(89, "B", "eBay"), deal(85, "C", "eBay"),
  ], { limit: 12 });
  assert.deepStrictEqual(picked.map(p => p.score), [89, 85, 81], "a 90 is listed below an 88 again");
}

console.log("top picks: ok");
