#!/usr/bin/env node
/**
 * Proposes the ten products for the Black Friday price diary.
 *
 * The diary is the one claim no competitor can copy on the day: a price we
 * have been writing down since October, against the price the shop calls a
 * Black Friday deal in November. That only works if the watching starts early
 * and the list does not change, so this script proposes and a human commits
 * the result to src/priceDiary.js. It is not run by the site.
 *
 * A candidate needs three things: a category that actually discounts in
 * November, enough observations that a line already exists, and a shop that
 * will still be selling it in six weeks.
 *
 * Examples
 *   node scripts/choose-price-diary.js
 *   node scripts/choose-price-diary.js --market=us --candidates=60
 */
const BASE = process.env.DIARY_BASE || "https://www.onedailydrop.com";
const num = (v) => Number(v) || 0;
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MARKET = arg("market", "us");
const CANDIDATES = Number(arg("candidates", 60));

/* What November actually marks down. Groceries and phone cases do not. */
const WATCHED = [
  { bucket: "Laptops", match: /\b(laptop|notebook|macbook|chromebook|thinkpad|ideapad|inspiron|vivobook|zenbook)\b/i },
  { bucket: "Headphones", match: /\b(headphones?|headset|earbuds?|airpods)\b/i },
  { bucket: "Monitors", match: /\b(monitor|display)\b/i, exclude: /\b(stand|riser|arm|mount|cable|adapter)\b/i },
  { bucket: "TV & projectors", match: /\b(tv|television|projector)\b/i, exclude: /\b(mount|stand|bracket|antenna)\b/i },
  { bucket: "Kitchen", match: /\b(air fryer|coffee maker|espresso|blender|instant pot|stand mixer)\b/i },
  { bucket: "Vacuums", match: /\b(robot vacuum|vacuum cleaner|cordless vacuum)\b/i },
  { bucket: "Storage", match: /\b(ssd|nvme|external drive|hard drive|micro ?sd)\b/i },
  { bucket: "Tools", match: /\b(drill|impact driver|tool set|circular saw|multi-?tool)\b/i },
  { bucket: "Outdoors", match: /\b(tent|sleeping bag|cooler|binoculars|trail camera)\b/i },
  { bucket: "Toys", match: /\b(lego|board game|puzzle|nerf)\b/i },
];

/* Seasonal stock is the wrong thing to watch into November: a Halloween
   projector has no price history worth the name and will not be on sale on the
   27th, which makes it a blank line in the diary rather than a reading. */
const SEASONAL = /\b(halloween|christmas|xmas|pumpkins?|spooky|santa|advent|costumes?)\b/i;

/* Fourteen days is the shortest history that can show anything: a single
   observation is a price, not a line, and the whole point is the line. */
const MINIMUM_DAYS = 14;

const bucketOf = (title) => {
  if (SEASONAL.test(title)) return null;
  for (const entry of WATCHED) {
    if (entry.match.test(title) && !(entry.exclude && entry.exclude.test(title))) return entry.bucket;
  }
  return null;
};

(async () => {
  const body = await (await fetch(`${BASE}/api/products?market=${MARKET}&compact=1`, { headers: { accept: "application/json" } })).json();
  const all = (Array.isArray(body) ? body : body.products || [])
    .filter((p) => p.image_url && p.deal_url && num(p.current_price) >= 25);

  const pool = all
    .map((p) => ({ ...p, bucket: bucketOf(String(p.title)) }))
    .filter((p) => p.bucket)
    /* Reviews and a Score are not the point of the diary, but they are a decent
       proxy for a listing that will still exist in six weeks. */
    .sort((a, b) => (num(b.review_count) >= 5 ? 1 : 0) - (num(a.review_count) >= 5 ? 1 : 0)
      || (b.display_score != null ? 1 : 0) - (a.display_score != null ? 1 : 0)
      || num(b.review_count) - num(a.review_count))
    .slice(0, CANDIDATES);

  console.log(`${all.length} listings, ${pool.length} candidates in the watched buckets\n`);

  const measured = [];
  for (const p of pool) {
    try {
      const response = await fetch(`${BASE}/api/products/${p.id}/price-history`, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const data = await response.json();
      const history = data.history || [];
      const days = new Set(history.map((row) => String(row.observed_at).slice(0, 10))).size;
      if (days >= MINIMUM_DAYS) measured.push({ ...p, observations: history.length, days });
    } catch { /* a listing that will not answer today is not one to watch for six weeks */ }
  }

  /* One per bucket first, so the diary reads as a cross-section rather than as
     ten laptops, then the deepest histories fill what is left. */
  measured.sort((a, b) => b.days - a.days || b.observations - a.observations);
  const chosen = [];
  const takenBuckets = new Set();
  for (const p of measured) {
    if (chosen.length >= 10 || takenBuckets.has(p.bucket)) continue;
    takenBuckets.add(p.bucket);
    chosen.push(p);
  }
  for (const p of measured) {
    if (chosen.length >= 10 || chosen.some((c) => c.id === p.id)) continue;
    chosen.push(p);
  }

  console.log(`${measured.length} candidates have a price history\n`);
  console.log("Proposed diary:\n");
  for (const p of chosen) {
    console.log(`  ${String(p.id).padEnd(10)} ${String(p.bucket).padEnd(16)} $${String(num(p.current_price).toFixed(2)).padStart(8)}  ${String(p.days).padStart(3)} days / ${String(p.observations).padStart(4)} obs  ${String(p.title).slice(0, 48)}`);
  }
  console.log("\nAs src/priceDiary.js entries:\n");
  console.log(JSON.stringify(chosen.map((p) => ({ id: p.id, bucket: p.bucket, title: String(p.title).slice(0, 80) })), null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
