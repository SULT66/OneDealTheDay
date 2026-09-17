/*
 * The price verdict on a product page (lib/priceTrend.ts).
 *
 * The sentence above the chart is the thing a shopper actually reads, so it
 * must never claim more than the history supports: no "lowest price" from two
 * days of data, and every check of the same day counted once.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "..", "lib", "priceTrend.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const mod = new Module("priceTrend");
mod._compile(outputText, "priceTrend.js");
const { dailyPrices, priceVerdict, recentChange } = mod.exports;

const money = (value) => `$${value.toFixed(2)}`;
const day = (date) => date;
const series = (pairs) => pairs.map(([date, price]) => ({ date, price }));

/* Six checks on one day are one point: the last price that day. */
const days = dailyPrices(series([
  ["2026-09-15", 127.58], ["2026-09-15", 124.18],
  ["2026-09-16", 124.18], ["2026-09-16", 123.99],
  ["2026-09-13", 138.09],
]));
assert.deepStrictEqual(days, series([["2026-09-13", 138.09], ["2026-09-15", 124.18], ["2026-09-16", 123.99]]));
assert.deepStrictEqual(dailyPrices(series([["bad", 5], ["2026-09-16", 0]])), [], "junk points reached the chart");

/* Too new to judge, whatever the numbers say. */
let verdict = priceVerdict(series([["2026-09-15", 50], ["2026-09-16", 40]]), money, day);
assert.strictEqual(verdict.tone, "neutral");
assert.match(verdict.headline, /started tracking this price on 2026-09-15/);
assert.doesNotMatch(`${verdict.headline} ${verdict.detail}`, /lowest/i, "two days of history called a low");

/* At the low. */
verdict = priceVerdict(days, money, day);
assert.strictEqual(verdict.tone, "good");
assert.match(verdict.headline, /lowest price since we started tracking on 2026-09-13/);
assert.strictEqual(verdict.suggestWatch, false);
assert.match(verdict.detail, /Down \$14\.10 \(10%\) in the last 3 days/);

/* At the high: say so, and name the low. */
verdict = priceVerdict(series([["2026-09-01", 100], ["2026-09-05", 80], ["2026-09-10", 110]]), money, day);
assert.strictEqual(verdict.tone, "high");
assert.match(verdict.headline, /highest price/);
assert.match(verdict.detail, /\$80\.00 on 2026-09-05, 38% less than today/);
assert.strictEqual(verdict.suggestWatch, true);

/* In between. */
verdict = priceVerdict(series([["2026-09-01", 100], ["2026-09-05", 80], ["2026-09-10", 88]]), money, day);
assert.match(verdict.headline, /^10% above the lowest price/);

/* Flat. */
verdict = priceVerdict(series([["2026-09-01", 20], ["2026-09-09", 20]]), money, day);
assert.match(verdict.headline, /hasn't changed in 9 days/);

/* The change compares against a week back, not the day before. */
const change = recentChange(series([["2026-09-01", 100], ["2026-09-08", 90], ["2026-09-15", 81]]), 7);
assert.deepStrictEqual(change, { amount: -9, percent: -10, days: 7 });

assert.strictEqual(priceVerdict([], money, day), null);

/* The page uses it. */
const chart = fs.readFileSync(path.join(__dirname, "..", "components", "deal", "PriceHistory.tsx"), "utf8");
assert(/dailyPrices\(history\)/.test(chart) && /priceVerdict\(/.test(chart), "the chart plots raw checks again");
assert(/daysBetween\(first\.date, date\)/.test(chart), "the chart spaces points by check instead of by date");

console.log("price trend: ok");
