const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { labelClick, liveDropLabel, safeLabel, MAX_LABEL } = require("../src/clickLabels");

/*
 * Whether a Live Drop can ever be shown to have sold anything.
 *
 * Every network hands a publisher's own label back on the resulting sale —
 * Awin as clickref, Rakuten as u1, eBay as customid — and it is the only
 * mechanism by which "somebody bought something" becomes "somebody bought
 * something because of this drop". The Buy button used to send the buyer out
 * under the same label as every other click on the site, so a drop could be
 * watched by two hundred people, sell twelve units, and leave nothing in any
 * report connecting the twelve to the drop.
 *
 * That is not an analytics nicety. The reason to run a first Live at all is to
 * be able to tell a retailer what it produced, and without a label there is
 * nothing to tell them.
 *
 * The links below were copied out of the live catalogue rather than written to
 * suit the code.
 */

const dropKey = "drop_2026_09_08_ab12cd";
const label = liveDropLabel(dropKey);

/* Readable off a network's report by a person, without a lookup table. */
assert.strictEqual(label, "odd-live-drop_2026_09_08_ab12cd", "the drop label no longer names its drop");

/* ------------------------------------------------ one label parameter each */

const ebay = labelClick(
  "https://www.ebay.com/itm/184611993882?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339179772&customid=odd-us&toolid=10050",
  label,
);
assert.strictEqual(
  new URL(ebay).searchParams.get("customid"),
  label,
  "an eBay sale from a drop is reported under the same label as every other click",
);
assert.strictEqual(
  new URL(ebay).searchParams.get("campid"),
  "5339179772",
  "labelling the click dropped the campaign that makes it pay",
);

const awin = labelClick(
  "https://www.awin1.com/cread.php?awinmid=92307&awinaffid=3018019&ued=https%3A%2F%2Ftribesigns.com%2F",
  label,
);
assert.strictEqual(new URL(awin).searchParams.get("clickref"), label, "Awin sales from a drop carry no drop label");
assert.strictEqual(
  new URL(awin).searchParams.get("awinaffid"),
  "3018019",
  "labelling the click changed who the commission belongs to",
);

const rakuten = labelClick(
  "https://click.linksynergy.com/link?id=kj4GVhxsO9k&offerid=1786142.44&type=15&murl=https%3A%2F%2Fwww.newegg.com%2F",
  label,
);
assert.strictEqual(new URL(rakuten).searchParams.get("u1"), label, "Rakuten sales from a drop carry no drop label");

/* ------------------------------------------------------ refusing to invent */

/*
 * A network we have no label parameter for is left alone. Guessing at one is
 * not harmless: an unrecognised query parameter is passed through to the
 * merchant's own site, where it can break a link or land in their analytics as
 * somebody else's rubbish.
 */
const unknown = "https://shop.example.com/product/9?colour=red";
assert.strictEqual(labelClick(unknown, label), unknown, "a label is invented for a network we do not know");

/* And an eBay-shaped link with no customid of its own is not given one, since
   that would be guessing at a tracking scheme rather than using one. */
const bare = "https://www.ebay.com/itm/1?mkevt=1";
assert.strictEqual(labelClick(bare, label), bare, "a campaign parameter is invented on a link that has none");

assert.strictEqual(labelClick("javascript:alert(1)", label), "javascript:alert(1)", "a non-HTTP link was rewritten");
assert.strictEqual(labelClick(awin, ""), awin, "an empty label still rewrites the link");

/* ------------------------------------------------------------- safe labels */

/* Networks export these to spreadsheets and hand them back through URLs, so a
   label is limited to characters that survive both. */
assert.strictEqual(safeLabel("Drop 2026/09/08 #1"), "drop-2026-09-08-1", "a label can carry characters a report will mangle");
assert.strictEqual(safeLabel("x".repeat(400)).length, MAX_LABEL, "a label can exceed what the narrowest network accepts");

/* ------------------------------------------------- and it is actually used */

/*
 * The derivation being right is worth nothing if the Buy button does not use
 * it — the mistake this project has made more than once.
 */
const server = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const liveGo = /app\.get\("\/live\/go\/:key"[\s\S]*?\n\}\);/.exec(server);
assert(liveGo, "the live drop's outbound route moved out of src/server.js");
assert(
  /labelClick\(destination\.toString\(\), liveDropLabel\(drop\.drop_key\)\)/.test(liveGo[0]),
  "the Live Drop's Buy button sends buyers out unlabelled again, so its sales cannot be traced to it",
);

console.log("Live attribution checks passed: one label per network, none invented, and the Buy button uses it.");
