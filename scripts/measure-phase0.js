#!/usr/bin/env node
/**
 * Phase 0 measurement — the numbers the plan says must exist before anything
 * else is built. Read-only: it opens the database, counts, and prints.
 *
 *   node scripts/measure-phase0.js [path-to-site.db]
 *
 * The two questions it answers:
 *   1. How many catalog products can ever become a Daily Drop, and which gate
 *      rejects the rest. Gates are evaluated in the same order as
 *      isDailyPickEligible, and each product is attributed to the FIRST gate it
 *      fails — so the counts add up to the catalog and name the real bottleneck
 *      rather than every reason a product is unsuitable.
 *   2. Price-history coverage, GTIN coverage, and audience size.
 */
const path = require("path");
const Database = require("better-sqlite3");

const ranker = require(path.join(__dirname, "..", "src", "ranker.js"));

const dbPath = process.argv[2] || process.env.SITE_DB;
if (!dbPath) {
  console.error("usage: node scripts/measure-phase0.js <path-to-site.db>");
  process.exit(2);
}
const db = new Database(dbPath, { readonly: true });

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "—");

function table(rows, columns) {
  const widths = columns.map(c =>
    Math.max(c.label.length, ...rows.map(r => String(c.value(r)).length)),
  );
  const line = cells => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  console.log(line(columns.map(c => c.label)));
  console.log(line(widths.map(w => "-".repeat(w))));
  rows.forEach(r => console.log(line(columns.map(c => c.value(r)))));
}

/* ------------------------------------------------------------------ catalog */

const products = db.prepare("select * from products where status = 'published'").all();
const allProducts = db.prepare("select * from products").all();

console.log("=".repeat(72));
console.log("CATALOG");
console.log("=".repeat(72));
console.log(`rows in products    : ${allProducts.length}`);
db.prepare("select coalesce(status,'(null)') s, count(*) c from products group by s order by c desc")
  .all()
  .forEach(r => console.log(`  status ${String(r.s).padEnd(12)} ${r.c}`));
console.log(`live catalog        : ${products.length}`);

const byMarket = {};
products.forEach(p => {
  const key = p.market || "(none)";
  byMarket[key] = (byMarket[key] || 0) + 1;
});
console.log(`by market        : ${JSON.stringify(byMarket)}`);

/* --------------------------------------------------- daily-pick gate funnel */

/**
 * The gates, in the order isDailyPickEligible applies them. Each returns true
 * when the product PASSES. Kept as data so the funnel and the code stay in
 * step: if a gate moves in ranker.js, this list is the one place to follow it.
 */
const paidShipping = ranker.paidShippingCost;
const landed = ranker.landedCost;

const retailerOf = p => String(p.source || "").toLowerCase();
const returnsRefused = p => /not accepted|no returns|nicht|non accept/i.test(String(p.return_summary || ""));
const shipRatio = p => {
  const ship = paidShipping(p);
  const price = number(p.current_price);
  if (ship == null || price <= 0) return 0;
  return ship / price;
};

const GATES = [
  ["has title and image", p => Boolean(p.title && p.image_url)],
  ["affiliate link is a URL", p => /^https?:\/\//i.test(String(p.affiliate_url || ""))],
  ["in stock", p => !/out of stock|unavailable/i.test(String(p.availability || ""))],
  ["price above zero", p => number(p.current_price) > 0],
  ["shipping known (not null)", p => paidShipping(p) != null],
  ["shipping <= 25% of price", p => shipRatio(p) <= 0.25],
  ["returns accepted", p => !returnsRefused(p)],
  ["rating >= 4.3 (or none)", p => {
    const rating = number(p.rating);
    return !(rating > 0 && rating < 4.3);
  }],
  ["eBay seller >= 4.8 and >= 100 ratings", p => {
    if (retailerOf(p) !== "ebay") return true;
    return number(p.seller_rating) >= 4.8 && number(p.seller_feedback_count) >= 100;
  }],
  ["commerce quality >= 0.45", p => {
    const scored = ranker.scoreProduct(p);
    const quality = p.commerce_quality != null
      ? number(p.commerce_quality) / 100
      : ranker.commerceQuality(p, scored.breakdown);
    return quality >= 0.45;
  }],
  ["evidence confidence >= 55", p => {
    const scored = ranker.scoreProduct(p);
    return number(p.evidence_confidence ?? scored.evidenceConfidence) >= 55;
  }],
];

const rejected = new Map(GATES.map(([name]) => [name, 0]));
let passed = 0;
const survivors = [];

for (const product of products) {
  let failedAt = null;
  for (const [name, test] of GATES) {
    let ok = false;
    try {
      ok = test(product);
    } catch {
      ok = false;
    }
    if (!ok) {
      failedAt = name;
      break;
    }
  }
  if (failedAt) rejected.set(failedAt, rejected.get(failedAt) + 1);
  else {
    passed += 1;
    survivors.push(product);
  }
}

console.log();
console.log("=".repeat(72));
console.log("DAILY DROP — WHERE THE CATALOG DIES");
console.log("=".repeat(72));
console.log("Each product is counted against the FIRST gate it fails.");
console.log();

const funnel = GATES.map(([name]) => ({
  gate: name,
  lost: rejected.get(name),
}));
table(
  funnel.filter(r => r.lost > 0),
  [
    { label: "gate", value: r => r.gate },
    { label: "rejected", value: r => r.lost },
    { label: "of catalog", value: r => pct(r.lost, products.length) },
  ],
);
console.log();
console.log(`PASSES ALL GATES : ${passed}  (${pct(passed, products.length)} of the catalog)`);

/* Cross-check against the real ranker so the funnel above cannot silently
   drift away from the function it is modelling. */
const truth = products.filter(p => {
  try {
    return ranker.isDailyPickEligible(p);
  } catch {
    return false;
  }
}).length;
console.log(`ranker says      : ${truth}${truth === passed ? "  (funnel agrees)" : "  <-- FUNNEL DISAGREES, fix the gate list"}`);

if (survivors.length) {
  console.log();
  console.log("survivors by retailer:");
  const bySource = {};
  survivors.forEach(p => {
    const key = p.source || "(none)";
    bySource[key] = (bySource[key] || 0) + 1;
  });
  Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => console.log(`  ${source.padEnd(24)} ${count}`));

  console.log();
  console.log("survivors by market:");
  const byM = {};
  survivors.forEach(p => {
    const key = p.market || "(none)";
    byM[key] = (byM[key] || 0) + 1;
  });
  Object.entries(byM)
    .sort((a, b) => b[1] - a[1])
    .forEach(([market, count]) => console.log(`  ${market.padEnd(24)} ${count}`));

  const prices = survivors.map(p => landed(p)).filter(v => v > 0).sort((a, b) => a - b);
  if (prices.length) {
    const median = prices[Math.floor(prices.length / 2)];
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    console.log();
    console.log(`survivor price   : median ${median.toFixed(2)}, mean ${mean.toFixed(2)}, max ${prices[prices.length - 1].toFixed(2)}`);
  }
}

/* -------------------------------------------------- the 60-candidate window */

console.log();
console.log("=".repeat(72));
console.log("THE 60-CANDIDATE WINDOW");
console.log("=".repeat(72));
console.log("refresh.js only ever considers the top 60 by score. Everything");
console.log("below is invisible to the drop no matter how good it is.");
console.log();

for (const market of Object.keys(byMarket).sort()) {
  const inMarket = products
    .filter(p => (p.market || "(none)") === market)
    .sort((a, b) => number(b.ranking_score) - number(a.ranking_score));
  const window = inMarket.slice(0, 60);
  const eligibleInWindow = window.filter(p => {
    try {
      return ranker.isDailyPickEligible(p);
    } catch {
      return false;
    }
  }).length;
  const eligibleOverall = inMarket.filter(p => {
    try {
      return ranker.isDailyPickEligible(p);
    } catch {
      return false;
    }
  }).length;
  console.log(
    `${market.padEnd(8)} catalog ${String(inMarket.length).padStart(5)}   ` +
    `eligible ${String(eligibleOverall).padStart(4)}   ` +
    `eligible inside top-60 ${String(eligibleInWindow).padStart(3)}   ` +
    `needed for a top-10 ${eligibleInWindow >= 10 ? "yes" : "NO — falls back to repeats"}`,
  );
}

/* ------------------------------------------------------- price-history depth */

console.log();
console.log("=".repeat(72));
console.log("PRICE HISTORY");
console.log("=".repeat(72));

const historyRows = db.prepare("select count(*) c from price_history").get().c;
const withHistory = db.prepare(
  "select count(distinct product_id) c from price_history",
).get().c;
const distinctDays = db.prepare(
  "select count(*) c from (select distinct substr(observed_at,1,10) d from price_history)",
).get().c;
const span = db.prepare(
  "select min(substr(observed_at,1,10)) lo, max(substr(observed_at,1,10)) hi from price_history",
).get();
const distribution = db.prepare(`
  select points, count(*) products from (
    select product_id, count(distinct substr(observed_at,1,10)) points
    from price_history group by product_id
  ) group by points order by points
`).all();
const changed = db.prepare(`
  select count(*) c from (
    select product_id from price_history group by product_id having count(distinct price) > 1
  )
`).get().c;

console.log(`rows                    : ${historyRows}`);
console.log(`products with any point : ${withHistory} of ${allProducts.length} (${pct(withHistory, allProducts.length)})`);
console.log(`distinct observation days: ${distinctDays}  (${span.lo} .. ${span.hi})`);
console.log(`products whose price ever moved: ${changed} (${pct(changed, withHistory)} of those tracked)`);
console.log();
console.log("days of history per product:");
table(distribution, [
  { label: "days", value: r => r.points },
  { label: "products", value: r => r.products },
  { label: "share", value: r => pct(r.products, withHistory) },
]);

/* ---------------------------------------------------------- GTIN by source */

console.log();
console.log("=".repeat(72));
console.log("IDENTIFIERS BY RETAILER (can we compare the same item across shops?)");
console.log("=".repeat(72));

const identifiers = db.prepare(`
  select
    coalesce(source,'(none)') source,
    count(*) total,
    sum(case when coalesce(gtin,'')  <> '' then 1 else 0 end) gtin,
    sum(case when coalesce(ean,'')   <> '' then 1 else 0 end) ean,
    sum(case when coalesce(upc,'')   <> '' then 1 else 0 end) upc,
    sum(case when coalesce(mpn,'')   <> '' then 1 else 0 end) mpn,
    sum(case when coalesce(brand,'') <> '' then 1 else 0 end) brand,
    round(max(current_price), 2) max_price,
    round(avg(current_price), 2) avg_price
  from products group by source order by total desc
`).all();

table(identifiers, [
  { label: "retailer", value: r => r.source },
  { label: "items", value: r => r.total },
  { label: "gtin", value: r => `${r.gtin} (${pct(r.gtin, r.total)})` },
  { label: "ean", value: r => r.ean },
  { label: "upc", value: r => r.upc },
  { label: "mpn", value: r => r.mpn },
  { label: "brand", value: r => `${r.brand} (${pct(r.brand, r.total)})` },
  { label: "avg $", value: r => r.avg_price },
  { label: "max $", value: r => r.max_price },
]);

const anyIdentifier = db.prepare(`
  select count(*) c from products
  where coalesce(gtin,'') <> '' or coalesce(ean,'') <> '' or coalesce(upc,'') <> ''
`).get().c;
console.log();
console.log(`products with ANY of gtin/ean/upc: ${anyIdentifier} of ${allProducts.length} (${pct(anyIdentifier, allProducts.length)})`);
console.log("Without one of these, two shops selling the same item cannot be matched,");
console.log("so 'cheapest across retailers' and external ratings are both impossible.");

/* ------------------------------------------------------------- categories */

console.log();
console.log("=".repeat(72));
console.log("CATEGORIES");
console.log("=".repeat(72));
const categories = db.prepare(`
  select coalesce(nullif(normalized_category,''), coalesce(category,'(none)')) name,
         count(*) c
  from products where status='published' group by name order by c desc
`).all();
table(categories, [
  { label: "category", value: r => r.name },
  { label: "items", value: r => r.c },
  { label: "share", value: r => pct(r.c, products.length) },
]);

/* --------------------------------------------------------------- audience */

console.log();
console.log("=".repeat(72));
console.log("AUDIENCE");
console.log("=".repeat(72));

const count = (sql, fallback = "n/a") => {
  try {
    return db.prepare(sql).get().c;
  } catch {
    return fallback;
  }
};

console.log(`subscribers                    : ${count("select count(*) c from subscribers")}`);
console.log(`users                          : ${count("select count(*) c from users")}`);
console.log(`clicks, all time               : ${count("select count(*) c from clicks")}`);
console.log(`clicks, last 30 days           : ${count("select count(*) c from clicks where created_at >= date('now','-30 day')")}`);
console.log(`analytics events, all time     : ${count("select count(*) c from analytics_events")}`);
console.log(`distribution_queue rows waiting: ${count("select count(*) c from distribution_queue")}`);
console.log(`  (nothing reads this queue — the daily email has never been sent)`);

const dropDays = count("select count(distinct drop_date) c from daily_drops");
const dropRows = count("select count(*) c from daily_drops");
console.log(`daily_drops rows / days        : ${dropRows} / ${dropDays}`);

/* Repeats: how often the same product came back inside 14 days. */
try {
  const repeats = db.prepare(`
    select product_id, market, count(*) times, min(drop_date) first, max(drop_date) last
    from daily_drops
    where drop_date >= date('now','-30 day')
    group by product_id, market
    having times > 1
    order by times desc
    limit 10
  `).all();
  if (repeats.length) {
    console.log();
    console.log("most repeated products in the last 30 days:");
    table(repeats, [
      { label: "product", value: r => r.product_id },
      { label: "market", value: r => r.market },
      { label: "times", value: r => r.times },
      { label: "from", value: r => r.first },
      { label: "to", value: r => r.last },
    ]);
  }
} catch { /* older schema */ }

db.close();
