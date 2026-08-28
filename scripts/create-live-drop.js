#!/usr/bin/env node
/**
 * Schedules a Live Drop from the command line.
 *
 * The roadmap puts an admin console in V1 and an internal end-to-end rehearsal
 * in Sprint 1, which is the right order: the point of the first drop is to
 * prove the mechanic works, and that needs a drop on a real schedule long
 * before it needs a form to create one.
 *
 * Deliberately unpublished unless asked. A drop being written is not a drop
 * being advertised, and the difference matters when the writing happens on the
 * live site.
 *
 * Examples
 *   node scripts/create-live-drop.js --title "iPhone 17 128GB" --retail 799 --price 449 \
 *     --quantity 20 --retailer "Partner X" --starts-in 15m --publish
 *   node scripts/create-live-drop.js --list
 */

const db = require("../src/db");
const { presentDrop } = require("../src/liveDrop");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

/** "15m", "2h", "90s" or a plain number of minutes. */
function parseDelay(value) {
  const match = /^(\d+)\s*(s|m|h)?$/i.exec(String(value || "").trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  return amount * (unit === "s" ? 1000 : unit === "h" ? 3600000 : 60000);
}

if (has("list")) {
  const rows = db.prepare("SELECT * FROM live_drops ORDER BY start_at DESC LIMIT 20").all();
  if (!rows.length) {
    console.log("No Live Drops scheduled.");
    process.exit(0);
  }
  for (const row of rows) {
    const shown = presentDrop(row, Date.now());
    console.log(
      [
        row.published ? "published" : "draft    ",
        String(shown.state).padEnd(9),
        row.drop_key.padEnd(28),
        `${row.quantity_remaining}/${row.quantity_total}`.padEnd(8),
        row.start_at,
        row.title,
      ].join("  "),
    );
  }
  process.exit(0);
}

const title = flag("title");
if (!title) {
  console.error("A drop needs a --title. Use --list to see what is scheduled.");
  process.exit(1);
}

const startsIn = parseDelay(flag("starts-in", "15m"));
if (startsIn == null) {
  console.error('--starts-in takes something like "15m", "90s" or "2h".');
  process.exit(1);
}
const lastsFor = parseDelay(flag("lasts", "10m"));
if (lastsFor == null || lastsFor <= 0) {
  console.error('--lasts takes something like "10m".');
  process.exit(1);
}

const now = Date.now();
const quantity = Math.max(0, Math.round(Number(flag("quantity", "20")) || 0));
const nowIso = new Date(now).toISOString();
const dropKey = flag("key", `drop_${new Date(now).toISOString().slice(0, 10).replace(/-/g, "_")}_${Math.random().toString(36).slice(2, 8)}`);

const drop = {
  drop_key: dropKey,
  market: flag("market", "us"),
  title,
  brand: flag("brand", ""),
  retailer_name: flag("retailer", ""),
  image_url: flag("image", ""),
  retail_price: Number(flag("retail", "0")) || null,
  drop_price: Number(flag("price", "0")) || null,
  currency: flag("currency", "USD").toUpperCase(),
  quantity_total: quantity,
  quantity_remaining: quantity,
  start_at: new Date(now + startsIn).toISOString(),
  end_at: new Date(now + startsIn + lastsFor).toISOString(),
  member_early_access_seconds: Math.max(0, Math.round(Number(flag("early-access", "0")) || 0)),
  affiliate_url: flag("url", ""),
  /* Optional. A drop runs perfectly well with no broadcast: the event is the
     price, the clock and the limit. --video takes a recorded file, --embed the
     player URL of a stream hosted somewhere that already solved streaming. */
  video_url: flag("video", ""),
  stream_embed_url: flag("embed", ""),
  terms: flag("terms", ""),
  published: has("publish") ? 1 : 0,
  created_at: nowIso,
  updated_at: nowIso,
};

db.prepare(`INSERT INTO live_drops(
  drop_key,market,title,brand,retailer_name,image_url,retail_price,drop_price,currency,
  quantity_total,quantity_remaining,start_at,end_at,member_early_access_seconds,
  affiliate_url,video_url,stream_embed_url,terms,published,created_at,updated_at
) VALUES(
  @drop_key,@market,@title,@brand,@retailer_name,@image_url,@retail_price,@drop_price,@currency,
  @quantity_total,@quantity_remaining,@start_at,@end_at,@member_early_access_seconds,
  @affiliate_url,@video_url,@stream_embed_url,@terms,@published,@created_at,@updated_at
)`).run(drop);

console.log(`${drop.published ? "Published" : "Drafted"} ${drop.drop_key}`);
console.log(`  ${drop.title}${drop.retailer_name ? ` at ${drop.retailer_name}` : ""}`);
console.log(`  opens ${drop.start_at}, closes ${drop.end_at}`);
console.log(`  ${drop.quantity_total} units${drop.drop_price ? `, ${drop.currency} ${drop.drop_price}` : ""}`);
if (!drop.published) console.log("  Not visible yet. Re-run with --publish to schedule it publicly.");
