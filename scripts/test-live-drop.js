const assert = require("assert");

const { WAITING_ROOM_SECONDS, dropSaving, dropState, presentDrop } = require("../src/liveDrop");

/* A ten minute event that happens once cannot be debugged while it is running,
   so the whole state machine is exercised against a fixed clock here. */
const start = Date.parse("2026-09-10T20:00:00Z");
const drop = {
  drop_key: "drop_2026_09_tech_001",
  market: "us",
  title: "iPhone 17 128GB",
  brand: "Apple",
  retailer_name: "Partner X",
  image_url: "https://example.com/iphone.jpg",
  retail_price: 799,
  drop_price: 449,
  currency: "USD",
  quantity_total: 20,
  quantity_remaining: 20,
  start_at: new Date(start).toISOString(),
  end_at: new Date(start + 10 * 60 * 1000).toISOString(),
  member_early_access_seconds: 60,
  affiliate_url: "https://partner.example.com/buy?sku=123",
  terms: "One per customer.",
};

const at = (offsetSeconds) => start + offsetSeconds * 1000;

// The states, in the order a shopper meets them.
assert.strictEqual(dropState(drop, at(-3600)), "upcoming", "an hour out is not the waiting room");
assert.strictEqual(
  dropState(drop, at(-WAITING_ROOM_SECONDS + 1)),
  "waiting",
  "the waiting room did not open five minutes before the start",
);
assert.strictEqual(dropState(drop, at(-1)), "waiting", "the drop opened a second early");
assert.strictEqual(dropState(drop, at(0)), "live", "the drop did not open on its start");
assert.strictEqual(dropState(drop, at(599)), "live", "the drop closed inside its own window");
assert.strictEqual(dropState(drop, at(600)), "ended", "the drop stayed open past its end");

/* Early access is what a Drop Pass buys. Sixty seconds before the public, and
   not a second before that. */
assert.strictEqual(dropState(drop, at(-61), 60), "waiting", "early access started too early");
assert.strictEqual(dropState(drop, at(-60), 60), "live", "early access did not let a member in");
assert.strictEqual(dropState(drop, at(-60), 0), "waiting", "a free shopper was let in early");

/* Selling out is a different thing to arrive at than running out of time, and
   it is the one worth telling somebody who missed it. */
const soldOut = { ...drop, quantity_remaining: 0 };
assert.strictEqual(dropState(soldOut, at(120)), "sold_out", "a drop with no stock left still reads as live");
assert.strictEqual(
  dropState(soldOut, at(3600)),
  "sold_out",
  "a drop that sold out reads as merely ended once the clock runs out, losing the more useful fact",
);
assert.strictEqual(
  dropState(soldOut, at(-3600)),
  "upcoming",
  "a drop that has not opened yet reads as sold out",
);

/* A drop with no stated quantity is not a sold-out drop. */
assert.strictEqual(
  dropState({ ...drop, quantity_total: 0, quantity_remaining: 0 }, at(60)),
  "live",
  "a drop with no quantity cap was treated as sold out",
);

// Nonsense dates end rather than going live for ever.
assert.strictEqual(dropState({ ...drop, start_at: "" }, at(0)), "ended");
assert.strictEqual(dropState(null, at(0)), "ended");

/*
 * The price is the mechanic. Publishing it in the JSON before the drop opens
 * hands it to anybody who opens developer tools, which is most of the point of
 * a timed reveal gone.
 */
const teaser = presentDrop(drop, at(-600));
assert.strictEqual(teaser.state, "upcoming");
assert.strictEqual(teaser.drop_price, null, "the drop price leaked before the drop opened");
assert.strictEqual(teaser.saving, null, "the saving gave the price away before the drop opened");
assert.strictEqual(teaser.retail_price, 799, "the retail price is public and should be shown");
assert.strictEqual(
  teaser.affiliate_url,
  "",
  "the buy link was live before the drop, which sends shoppers to pay the ordinary price",
);
assert.strictEqual(teaser.seconds_until_start, 600, "the countdown is wrong before the start");

const live = presentDrop(drop, at(120));
assert.strictEqual(live.state, "live");
assert.strictEqual(live.drop_price, 449);
assert.deepStrictEqual(live.saving, { amount: 350, percent: 44 }, "the saving is wrong");
assert.strictEqual(live.affiliate_url, drop.affiliate_url, "there is no way to buy during the drop");
assert.strictEqual(live.seconds_until_end, 480, "the remaining time is wrong");

/* Seconds rather than a target timestamp, so a browser whose clock is minutes
   out still counts the right length of time. */
assert(
  typeof live.server_now === "string" && Number.isFinite(Date.parse(live.server_now)),
  "the response carries no server clock, so the countdown has to trust the browser",
);

/* No honest comparison, no badge. "SAVE $0 (0%)" is worse than nothing, and a
   saving against a retail price nobody can point at is a complaint waiting to
   happen. */
assert.strictEqual(dropSaving({ retail_price: 0, drop_price: 449 }), null);
assert.strictEqual(dropSaving({ retail_price: 449, drop_price: 449 }), null);
assert.strictEqual(dropSaving({ retail_price: 400, drop_price: 449 }), null);
assert.deepStrictEqual(dropSaving({ retail_price: 100, drop_price: 75 }), { amount: 25, percent: 25 });

console.log("Live Drop states, early access, price reveal and saving checks passed.");
