/*
 * Which product pages are offered to a search engine.
 *
 * Every published listing was, all 2,204 of them, and most carried nothing a
 * search engine had not already seen on the shop's own page: the shop's title,
 * the shop's photograph, the shop's price. Google's own spam policy names that
 * exact shape — pages built at scale from a supplier's feed, carrying no added
 * value — and the site has no way to win an argument about it except by not
 * making the claim in the first place.
 *
 * So a page is offered when it carries something of ours. Four things count,
 * and every one of them is a fact we produced rather than received:
 *
 *   - product reviews, which only eBay sends and which are real evidence;
 *   - a comparison, fetched by barcode from another shop (src/comparables.js);
 *   - a price drop we measured ourselves (src/trackedPrice.js);
 *   - a OneDailyDrop Score, which requires enough evidence to compute.
 *
 * Plus a current price, because a page whose price we could not confirm today
 * has nothing to be right about.
 *
 * What noindex does not do: delete anything. The page stays, the link works,
 * the search box finds it, Delia can recommend it. It is simply not put
 * forward as a page worth ranking.
 */

/* A shop that sends reviews sends a rating with them; one without the other is
   a number with no weight behind it. */
const hasReviews = (product) => Number(product?.review_count) > 0 && Number(product?.rating) > 0;

function indexEvidence(product = {}, { comparable = null } = {}) {
  return {
    reviews: hasReviews(product),
    comparable: Boolean(comparable),
    trackedDrop: Number(product?.tracked_drop_percent) > 0,
    score: product?.score != null || product?.display_score != null,
  };
}

/**
 * Whether this page is worth offering to a search engine.
 *
 * `priceIsCurrent` is passed in rather than recomputed so that the sitemap,
 * the page's own robots tag and the API all answer from one clock.
 */
function isIndexableProduct(product = {}, { comparable = null, priceIsCurrent = true } = {}) {
  if (!priceIsCurrent) return false;
  return Object.values(indexEvidence(product, { comparable })).some(Boolean);
}

/** The reason, for the admin console and for anyone asking why a page is out. */
function indexabilityReason(product = {}, options = {}) {
  if (!options.priceIsCurrent) return "price not confirmed recently";
  const evidence = indexEvidence(product, options);
  const carried = Object.entries(evidence).filter(([, present]) => present).map(([name]) => name);
  return carried.length ? carried.join(", ") : "nothing of ours on the page";
}

module.exports = { indexEvidence, indexabilityReason, isIndexableProduct };
