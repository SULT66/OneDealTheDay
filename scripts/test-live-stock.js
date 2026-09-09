/*
 * The Live Drop counter, and the several ways it must refuse to invent one.
 *
 * The page used to say "12 left" and count down from a figure typed into the
 * admin form that nothing decremented — a scarcity claim with nothing behind
 * it. The rule now is that a countdown exists only when the marketplace itself
 * gave an exact number, so nearly every assertion here is about the cases
 * where it must stay silent: a seller who publishes only "more than ten", a
 * listing with no quantity at all, and eBay being unreachable — which is the
 * dangerous one, because treating a network error as "sold out" would end a
 * live event nobody asked to end.
 */

const assert = require("assert");
const { readEbayStock, refreshDropStock, ebayItemIdFrom } = require("../src/liveStock");

/* --- Finding the listing inside the link we already hold. --- */
assert.strictEqual(ebayItemIdFrom("https://www.ebay.com/itm/353050432837?mkevt=1&campid=5339179772"), "353050432837");
assert.strictEqual(ebayItemIdFrom("https://www.ebay.com/itm/some-product-slug/353050432837"), "353050432837");
assert.strictEqual(ebayItemIdFrom("https://www.ebay.com/x?item=353050432837"), "353050432837");
assert.strictEqual(ebayItemIdFrom("https://www.ebay.com/itm/v1|353050432837|0"), "v1|353050432837|0");
/* An Awin link is a different shop entirely: no eBay id, and no pretending. */
assert.strictEqual(ebayItemIdFrom("https://www.awin1.com/cread.php?ued=https%3A%2F%2Ftribesigns.com"), null);
assert.strictEqual(ebayItemIdFrom(""), null);
assert.strictEqual(ebayItemIdFrom(null), null);

const clientReturning = (item) => ({
  getItemByLegacyId: async () => item,
  getItem: async () => item,
});

(async () => {
  /* --- eBay gives an exact count: a real counter is possible. --- */
  {
    const stock = await readEbayStock("353050432837", {
      client: clientReturning({
        title: "A thing",
        estimatedAvailabilities: [{
          estimatedAvailabilityStatus: "IN_STOCK",
          estimatedAvailableQuantity: 7,
          estimatedSoldQuantity: 143,
        }],
      }),
    });
    assert.strictEqual(stock.exact, true);
    assert.strictEqual(stock.available, 7);
    assert.strictEqual(stock.sold, 143);
    assert.strictEqual(stock.outOfStock, false);
  }

  /* --- eBay gives only a threshold: honest, but not a countdown. ---
     "More than 10" is a real answer and a useless one for counting down, so
     `exact` must be false however tempting the number beside it looks. */
  {
    const stock = await readEbayStock("353050432837", {
      client: clientReturning({
        estimatedAvailabilities: [{
          estimatedAvailabilityStatus: "IN_STOCK",
          estimatedAvailabilityThresholdType: "MORE_THAN",
          estimatedAvailabilityThreshold: 10,
          estimatedAvailableQuantity: 10,
        }],
      }),
    });
    assert.strictEqual(stock.exact, false, "a threshold is not an exact count");
    assert.strictEqual(stock.threshold, 10);
  }

  /* --- eBay gives nothing: available is null, never zero. ---
     Zero says it has sold out. "We were not told" is a different statement and
     must not be able to close a drop. */
  {
    const stock = await readEbayStock("353050432837", {
      client: clientReturning({ estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }] }),
    });
    assert.strictEqual(stock.available, null, "no quantity is null, not 0");
    assert.strictEqual(stock.exact, false);
    assert.strictEqual(stock.outOfStock, false, "silence is not sold out");
  }

  /* --- Out of stock is recognised. --- */
  {
    const stock = await readEbayStock("353050432837", {
      client: clientReturning({ estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }] }),
    });
    assert.strictEqual(stock.outOfStock, true);
  }

  /* --- Updating a drop from the shop. --- */
  const makeDb = (drop) => {
    const rows = { ...drop };
    return {
      updates: rows,
      prepare(sql) {
        return {
          run(...params) {
            if (sql.includes("stock_checked_at=?")) {
              rows.stock_checked_at = params[0];
            } else if (sql.includes("quantity_remaining=?")) {
              rows.quantity_remaining = params[0];
              rows.stock_verified_at = params[1];
            } else if (sql.includes("stock_verified_at=?")) {
              rows.stock_verified_at = params[0];
            }
          },
        };
      },
    };
  };

  const drop = { id: 1, affiliate_url: "https://www.ebay.com/itm/353050432837", quantity_total: 20, quantity_remaining: 20 };

  {
    const db = makeDb(drop);
    const result = await refreshDropStock(drop, {
      db,
      readStock: async () => ({ exact: true, available: 6, outOfStock: false }),
      now: Date.parse("2026-09-08T12:00:00.000Z"),
    });
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.remaining, 6);
    assert.strictEqual(db.updates.quantity_remaining, 6);
    assert.strictEqual(db.updates.stock_verified_at, "2026-09-08T12:00:00.000Z");
  }

  /* The shop having five hundred does not make this offer five hundred: the
     drop was allocated twenty and saying more oversells it. */
  {
    const db = makeDb(drop);
    const result = await refreshDropStock(drop, {
      db,
      readStock: async () => ({ exact: true, available: 500, outOfStock: false }),
    });
    assert.strictEqual(result.remaining, 20, "never above what the drop was allocated");
  }

  /* Sold out closes it. */
  {
    const db = makeDb(drop);
    const result = await refreshDropStock(drop, {
      db,
      readStock: async () => ({ exact: false, available: null, outOfStock: true }),
    });
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.soldOut, true);
  }

  /* No exact count: the admin's number is left exactly as it was, and nothing
     is stamped — so the page will not show a countdown. */
  {
    const db = makeDb(drop);
    const result = await refreshDropStock(drop, {
      db,
      readStock: async () => ({ exact: false, available: null, outOfStock: false, threshold: 10 }),
    });
    assert.strictEqual(result.changed, false);
    assert.strictEqual(db.updates.quantity_remaining, 20, "untouched");
    assert.strictEqual(db.updates.stock_verified_at, undefined, "nothing to verify means nothing to show");
  }

  /*
   * eBay unreachable. This is the one that matters most: a network error must
   * not close a live drop or empty its counter, because both would tell every
   * watcher the offer had gone when it had not.
   */
  {
    const db = makeDb(drop);
    const result = await refreshDropStock(drop, {
      db,
      readStock: async () => { throw new Error("socket hang up"); },
    });
    assert.strictEqual(result.changed, false);
    assert.match(result.reason, /could not ask eBay/);
    assert.strictEqual(db.updates.quantity_remaining, 20, "left alone on a network error");
    assert.strictEqual(db.updates.stock_verified_at, undefined, "and not marked as confirmed");
  }

  /* A drop on a shop that is not eBay is simply not handled here. */
  {
    const db = makeDb(drop);
    const result = await refreshDropStock(
      { ...drop, affiliate_url: "https://www.awin1.com/cread.php?ued=https%3A%2F%2Ftribesigns.com" },
      { db, readStock: async () => { throw new Error("should never be called"); } },
    );
    assert.strictEqual(result.changed, false);
    assert.match(result.reason, /not an eBay listing/);
  }

  console.log("live stock: ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
