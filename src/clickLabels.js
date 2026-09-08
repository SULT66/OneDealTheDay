/*
 * The label a network carries back to us on a sale.
 *
 * Every affiliate network lets a publisher attach a short string to a click and
 * hands it back on the resulting sale in its own reporting. Awin calls it
 * `clickref`, Rakuten `u1`, eBay `customid`. It is the only mechanism by which
 * "somebody bought something" ever becomes "somebody bought something because
 * of *this*".
 *
 * Until now the site set one label, "odd-store", on store links and nothing
 * else — so a Live Drop's Buy button sent the buyer out under exactly the same
 * label as every other click on the site. A drop could be watched by two
 * hundred people and sell twelve units, and no report anywhere would connect
 * the twelve to the drop. That gap is not an analytics nicety: the entire
 * reason to run a first Live is to be able to tell a retailer what it produced,
 * and without a label there is nothing to tell them.
 *
 * Kept in its own module because two callers need the same knowledge — the
 * store links and the live drop — and a second copy would drift.
 */

/* Networks vary; a hundred characters is inside every limit we deal with
   (eBay allows 256, Awin and Rakuten less) and long enough for a drop key. */
const MAX_LABEL = 100;

/* Lower case, and only what survives a round trip through a network's own
   reporting export without being mangled or quoted. */
const safeLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL);

/**
 * Put `label` on an affiliate URL in whichever parameter its network reads.
 *
 * Returns the URL unchanged when the network is one we have no label parameter
 * for: a wrong parameter is not harmless, it is a query string the merchant may
 * pass through to their own site.
 */
function labelClick(url, label) {
  const clean = safeLabel(label);
  if (!clean) return String(url || "");

  let link;
  try {
    link = new URL(String(url || ""));
  } catch {
    return String(url || "");
  }
  if (!/^https?:$/.test(link.protocol)) return String(url || "");

  if (/(?:^|\.)awin1\.com$/i.test(link.hostname)) {
    link.searchParams.set("clickref", clean);
    return link.toString();
  }
  if (/(?:^|\.)linksynergy\.com$/i.test(link.hostname)) {
    link.searchParams.set("u1", clean);
    return link.toString();
  }
  /* eBay hangs its tracking on its own address rather than redirecting through
     a network, and reads `customid`. Only replaced when one is already there:
     inventing a campaign parameter on a link that has none would be guessing at
     a tracking scheme rather than using one. */
  if (link.searchParams.has("customid")) {
    link.searchParams.set("customid", clean);
    return link.toString();
  }
  return link.toString();
}

/**
 * The label for a live drop, which has to survive being read off a network's
 * report by a person. `odd-live-drop_2026_09_08_ab12cd` says what it was and
 * which one without needing a lookup.
 */
const liveDropLabel = (dropKey) => safeLabel(`odd-live-${dropKey}`);

module.exports = { labelClick, liveDropLabel, safeLabel, MAX_LABEL };
