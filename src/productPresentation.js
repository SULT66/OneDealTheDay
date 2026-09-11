const { categoryLabel, languageTag, t } = require("./i18n");
const { SCORE_MODEL, scoreProduct, isDailyPickEligible, commerceQuality } = require("./ranker");
const { canonicalCategory } = require("./catalogTaxonomy");
const { storefrontUrl } = require("./storefrontLinks");

const EDITORIAL_SCORE_FLOOR = 60;
const EDITORIAL_CONFIDENCE_FLOOR = 55;
/* Commerce quality averages only over the signals a listing actually has, so
   this is the same bar the drop already applies to it in isDailyPickEligible. */
const EDITORIAL_QUALITY_FLOOR = 0.45;
/*
 * How old a price may be and still be presented as this shop's price.
 *
 * Not a style choice. A shopper found an eBay backpack listed here at $79.95
 * that the seller had since raised to $99.95, under a badge reading "59% below
 * reference" — a saving worked out from a price nobody had confirmed in two
 * days. Of 215 listings carrying a discount badge, 92 were computed from a
 * price older than this.
 *
 * The last known price still shows, with the date it was last confirmed beside
 * it, because a two-day-old price is useful information. What stops is the
 * arithmetic performed on it: a discount is a claim about right now, and this
 * is the line past which we no longer know.
 */
const PRICE_CONFIDENT_HOURS = 24;

/*
 * What a published score is allowed to reach, given what is actually known
 * about the listing.
 *
 * The band used to be 82 to 95, so every score the site printed began with an
 * 8 or a 9 and the number carried almost no information. Measured on the live
 * catalogue: of 1,141 listings showing a score, 1,111 had no product reviews
 * at all, and 136 of those scored 90 or better. A car phone holder at $8.99
 * with no reviews and no price history was published at 94 out of 100, on a
 * site whose own methodology page says the score is built from review volume,
 * price evidence and seller history.
 *
 * That is not a harsh grader or a lenient one. It is a number that says the
 * same thing about everything, which is the same as saying nothing — and it is
 * the first thing an affiliate reviewer checks, because it is the site's
 * central claim.
 *
 * So the ceiling is now the evidence. A listing cannot score above what is
 * known about it, whatever the model thinks of the offer:
 *
 *   reviews and a price advantage we can state   up to 95
 *   reviews, no stateable price advantage        up to 89
 *   no reviews, but a stated price advantage     up to 79
 *   neither                                      up to 74
 *
 * Nothing here is a penalty for the shop. A merchant that publishes no review
 * data still sells the thing perfectly well; we simply cannot claim to have
 * checked what nobody showed us. The listing still appears, still carries its
 * price and its reasoning, and says plainly how much is known.
 */
/*
 * How many reviews before a rating counts as evidence.
 *
 * Two five-star reviews is not a verdict, it is an anecdote, and a listing
 * carrying one was reaching 86 beside a Stanley tape measure with 38 reviews
 * averaging 4.98. Five is a low bar and deliberately so — the point is to
 * exclude the listing with a single glowing review, not to demand a hundred.
 */
const MEANINGFUL_REVIEW_COUNT = 5;

const EVIDENCE_CEILING = Object.freeze({
  reviewedAndPriced: 95,
  reviewed: 89,
});

/*
 * The bottom of the range, and it has to be a number a shopper reads as
 * "fine", not as a failing mark.
 *
 * Everything that reaches this point has cleared the editorial gate and has
 * real product reviews behind it; there is no such thing here as a listing we
 * scored badly, only listings we did not score at all. Sixty-two was briefly
 * the floor and put 67s on a shelf headed "Best right now", which reads as the
 * site rubbishing its own picks.
 */
const PUBLIC_SCORE_FLOOR = 70;
const PUBLIC_SCORE_CEILING = 95;

/*
 * Which ceiling applies. `priced` means a saving this site is willing to state
 * — the same test the page uses before printing one, so the number and the
 * badge can never disagree about whether a discount exists.
 */
function evidenceCeiling({hasReviews, hasStatedDiscount}) {
  /*
   * No reviews, no number, whatever else is known.
   *
   * Lowering the ceiling was half a fix and the other half was visible on the
   * page: 147 of 168 scores sat on listings with no reviews at all, and the
   * "Best right now" shelf filled with 67s and 68s. A site that says it scores
   * on review volume, price evidence, seller history and delivery cannot put a
   * number on a listing that has one of the four — it was wrong at 94 for the
   * same reason it was wrong at 67, only in the other direction.
   *
   * A verified saving is real evidence and the card already states it, as
   * "36% BELOW REF." beside the price. That is the honest way to show one
   * signal: say which signal it is, rather than compressing it into a score
   * that implies four.
   */
  if (!hasReviews) return null;
  return hasStatedDiscount ? EVIDENCE_CEILING.reviewedAndPriced : EVIDENCE_CEILING.reviewed;
}

const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function scoreBreakdown(product) {
  if (product?.score_breakdown && typeof product.score_breakdown === "object") return product.score_breakdown;
  try {
    return JSON.parse(product?.score_breakdown || "{}");
  } catch {
    return {};
  }
}

/*
 * The listing at the price it is being scored at.
 *
 * A drop snapshot carries the price from the day it was chosen, and that price
 * belongs to the snapshot alone. Applying it while presenting the listing as it
 * is today scores today's product against a price it no longer has.
 */
const pricedAs = (product, snapshot) => ({
  ...product,
  current_price: snapshot ? (product?.drop_price ?? product?.current_price) : product?.current_price,
  original_price: snapshot ? (product?.drop_original_price ?? product?.original_price) : product?.original_price,
});

/*
 * The score — of one of two kinds, and never the wrong one under the other's
 * name.
 *
 * This preferred `drop_score` whenever a product carried one, so any listing
 * that had ever been a daily pick was scored from that old snapshot wherever it
 * appeared. The search endpoint attaches the snapshot to every result it can,
 * so the same earbuds read 84 in search and 86 on their own page: one field,
 * one label, two numbers. A reviewer found it in minutes and was right to
 * distrust the whole screen for it — a score that disagrees with itself is not
 * a score.
 *
 * The snapshot now has to be asked for. The archive asks, because "what we
 * picked that day" is a statement about that day and recalibrating it would
 * rewrite history. Everywhere else gets today's number.
 */
function oneDailyDropScore(product, { snapshot = false } = {}) {
  const breakdown = scoreBreakdown(product);
  const isSelectionSnapshot = snapshot && product?.drop_score != null;
  const raw = isSelectionSnapshot ? product?.drop_score : product?.score;
  const value = number(raw, NaN);
  const scoreModel = isSelectionSnapshot ? product?.drop_score_model : breakdown.model;
  if (scoreModel === SCORE_MODEL && Number.isFinite(value)) {
    return Math.round(Math.max(0, Math.min(100, value)));
  }

  // Scores saved by the previous model treated unavailable retailer fields
  // and a short local price history as negative evidence. Recalculate those
  // records at presentation time so every existing card is corrected as soon
  // as the new release starts, including archived selections.
  //
  // At the price this is being scored at, which is the drop's price only when
  // the drop is what is being presented. Moving the score off the snapshot and
  // leaving this on it was half a fix: the listing still scored from a price it
  // had on the day it was chosen, so search and the product page went on
  // disagreeing — 84 against 86 — for a reason one step further down.
  const recalculated = scoreProduct(pricedAs(product, isSelectionSnapshot)).total;
  return Number.isFinite(recalculated) ? Math.round(recalculated) : null;
}

function oneDailyDropEvidenceConfidence(product) {
  const breakdown = scoreBreakdown(product);
  const stored = number(product?.evidence_confidence, NaN);
  if (breakdown.model === SCORE_MODEL && Number.isFinite(stored)) {
    return Math.round(Math.max(0, Math.min(100, stored)));
  }
  /* Today's price: how much is known about a listing is a question about the
     listing now, not about the day it was once chosen. */
  return scoreProduct(pricedAs(product, false)).evidenceConfidence;
}

/*
 * The public score, and what it is allowed to mean.
 *
 * The raw model adds six components. Four of them — product rating, review
 * confidence, seller reliability, shipping and returns — score zero when the
 * source does not publish the field, so the total measured how much a shop
 * tells us as much as how good the offer is. Measured across the live
 * catalogue: eBay's listings reached a median of 42.6 and a maximum of 81.2,
 * while Newegg's best listing of 1,015 reached 24.6 against a floor of 60. Not
 * one Newegg or feed product could ever carry a score, which is 1,727 of 1,741
 * listings, and the "highest scoring" shelf had fourteen things to rank.
 *
 * A shop that publishes less is not selling worse. So the public score is now
 * calibrated on commerce quality, which averages only over the signals that
 * are actually known, and evidence confidence stays as the second term — it
 * honestly reports how much was known, and a sparse listing is still held
 * below a well-documented one. Passing a quality directly is what a caller
 * does when it can work one out; the older two-argument form still derives
 * quality from the raw total so archived selections keep their scores.
 */
function publicOneDailyDropScore(rawScore, confidence, knownQuality = null, known = null) {
  const raw = number(rawScore, NaN);
  const evidence = number(confidence, NaN);
  if (!Number.isFinite(raw) || !Number.isFinite(evidence)) return null;
  if (evidence < EDITORIAL_CONFIDENCE_FLOOR) return null;
  /* Not number(): Number(null) is 0, which would read as "quality zero" and
     silently blank every score reached through the two-argument form. */
  const measured = knownQuality == null ? NaN : number(knownQuality, NaN);
  if (Number.isFinite(measured)) {
    if (measured < EDITORIAL_QUALITY_FLOOR) return null;
  } else if (raw < EDITORIAL_SCORE_FLOOR) {
    return null;
  }

  // The internal model scores every candidate from 0-100. The public score is
  // a calibrated score for offers that already passed the editorial floor:
  // 82 means qualified, 90+ means strong, and 95 is intentionally exceptional.
  // Offer quality carries most of the result while evidence coverage prevents
  // a sparse listing from receiving the same public score as a well-supported one.
  const quality = Number.isFinite(measured)
    ? Math.max(0, Math.min(1, measured))
    : Math.max(0, Math.min(1, (raw - EDITORIAL_SCORE_FLOOR) / 30));
  const evidenceQuality = Math.max(0, Math.min(1, (evidence - EDITORIAL_CONFIDENCE_FLOOR) / 35));
  /*
   * The evidence sets the top of the band, and the offer decides where in that
   * band it lands. Not a cap applied afterwards: capping was the first attempt
   * and it produced 1,119 listings sitting on exactly 74, which is the same
   * fault as everything scoring 94 — a number that says one thing about
   * everything says nothing.
   *
   * Scaling instead means a thin listing with a genuinely good offer still
   * outscores a thin listing with a mediocre one, while neither can reach a
   * height that would imply evidence nobody supplied.
   *
   * `known` is omitted by callers with no listing to inspect — an archived
   * selection replaying the score it was given on the day — and those keep the
   * full range rather than being retrospectively marked down.
   */
  const top = known ? evidenceCeiling(known) : PUBLIC_SCORE_CEILING;
  /* Null means the evidence does not support a number at all. The listing is
     still published, still carries its price, its badge and its rating line —
     it simply does not get a score, and no page draws a ring for it. */
  if (top == null) return null;
  const calibrated = PUBLIC_SCORE_FLOOR +
    (top - PUBLIC_SCORE_FLOOR) * (quality * 0.75 + evidenceQuality * 0.25);
  return Math.round(Math.max(PUBLIC_SCORE_FLOOR, Math.min(top, calibrated)));
}

function sellerRatingPercent(product) {
  const rating = number(product?.seller_rating, NaN);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const percent = rating <= 5 ? rating * 20 : rating;
  return Math.max(0, Math.min(100, percent));
}

function discountPercent(product) {
  const current = number(product?.current_price);
  const reference = number(product?.original_price);
  return reference > current && current > 0 ? Math.round((1 - current / reference) * 100) : 0;
}

function money(value, currency, marketCode, language) {
  const amount = number(value, NaN);
  if (!Number.isFinite(amount)) return clean(value);
  try {
    return new Intl.NumberFormat(languageTag(marketCode, language), {
      style: "currency",
      currency: String(currency || "USD").toUpperCase()
    }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`.trim();
  }
}

function localizeShipping(value, product, language) {
  const shipping = clean(value);
  if (!shipping) return t(language, "product.confirmRetailer");
  const free = shipping.match(/^Free shipping(?: via (.+))?$/i);
  if (free) return free[1]
    ? t(language, "offer.freeShippingVia", { service: free[1] })
    : t(language, "offer.freeShipping");
  const paid = shipping.match(/^([A-Z]{3})\s+([0-9]+(?:\.[0-9]+)?) shipping(?: via (.+))?$/i);
  if (paid) {
    const price = money(paid[2], paid[1], product?.market, language);
    return paid[3]
      ? t(language, "offer.paidShippingVia", { price, service: paid[3] })
      : t(language, "offer.paidShipping", { price });
  }
  if (/^Ships in 1 business day with tracking$/i.test(shipping)) return t(language, "offer.trackedOneDay");
  return shipping;
}

function localizeReturns(value, language) {
  const returns = clean(value);
  if (!returns) return t(language, "product.retailerPolicy");
  if (/^Returns not accepted$/i.test(returns)) return t(language, "offer.noReturns");
  if (/^Minimum 30-day money-back returns$/i.test(returns)) return t(language, "offer.minimum30Returns");
  const match = returns.match(/^(\d+)\s+(calendar days?|months?)(?:, seller-paid return shipping)?$/i);
  if (!match) return returns;
  const sellerPaid = /seller-paid return shipping/i.test(returns);
  const unit = /^month/i.test(match[2]) ? "month" : "day";
  return t(language, sellerPaid ? `offer.returns.${unit}.sellerPaid` : `offer.returns.${unit}`, { count: match[1] });
}

function localizeAvailability(value, language) {
  const availability = clean(value);
  if (/^In stock$/i.test(availability)) return t(language, "offer.inStock");
  if (/^Out of stock$/i.test(availability)) return t(language, "offer.outOfStock");
  return availability || t(language, "product.confirmRetailer");
}

function list(values, product, language) {
  const filtered = values.filter(Boolean);
  try {
    return new Intl.ListFormat(languageTag(product?.market, language), { style: "long", type: "conjunction" }).format(filtered);
  } catch {
    return filtered.join(", ");
  }
}

function presentationReason(product, language) {
  const reasons = [];
  const discount = discountPercent(product);
  const rating = number(product?.rating);
  const reviews = Math.round(number(product?.review_count));
  const breakdown = scoreBreakdown(product);
  const shipping = clean(product?.shipping_summary);
  const returns = clean(product?.return_summary);

  if (discount > 0) reasons.push(t(language, "product.reasonDiscount", { percent: discount }));
  if (rating > 0 && reviews > 0) {
    reasons.push(t(language, "product.reasonRating", {
      rating: rating.toFixed(1),
      count: reviews.toLocaleString(languageTag(product?.market, language))
    }));
  }
  if (number(breakdown.seller_reliability) >= 12) reasons.push(t(language, "product.reasonEstablishedSeller"));
  else if (clean(product?.seller_name)) reasons.push(t(language, "product.reasonSellerChecked"));
  if (/^Free shipping/i.test(shipping)) reasons.push(t(language, "product.reasonFreeDelivery"));
  if (returns && !/^Returns not accepted$/i.test(returns)) reasons.push(t(language, "product.reasonReturns", {
    returns: localizeReturns(returns, language)
  }));

  const summary = t(language, "product.reasonSentence", {
    reasons: list(reasons.slice(0, 4), product, language) || t(language, "product.reasonCheckedOffer")
  });
  /* Name the store the listing actually came from. This sentence said "eBay"
     whoever the seller was, so every Newegg page — more than half the
     catalogue — credited the wrong shop for the missing rating. */
  const store = clean(product?.retailer_name) || clean(product?.source) || t(language, "product.retailer");
  return rating > 0 && reviews > 0
    ? summary
    : `${summary} ${t(language, "product.noProductRating", { store })}`;
}

function badge(product, language) {
  const discount = discountPercent(product);
  const breakdown = scoreBreakdown(product);
  const rating = number(product?.rating);
  const reviews = number(product?.review_count);
  const buyerFriendly = /^Free shipping/i.test(clean(product?.shipping_summary)) &&
    clean(product?.return_summary) && !/^Returns not accepted$/i.test(clean(product?.return_summary));
  if (discount >= 20) return t(language, "product.belowReference");
  if (rating >= 4.6 && reviews >= 50) return t(language, "product.strongReviews");
  if (number(breakdown.seller_reliability) >= 12) return t(language, "product.establishedSeller");
  if (buyerFriendly) return t(language, "product.buyerFriendly");
  return t(language, "product.checkedOffer");
}

function evidenceCount(product) {
  const breakdown = scoreBreakdown(product);
  const returns = clean(product?.return_summary);
  return [
    number(product?.current_price) > 0 && Boolean(clean(product?.checked_at)),
    number(product?.rating) > 0 && number(product?.review_count) > 0,
    number(breakdown.seller_reliability) >= 12 || Boolean(clean(product?.seller_name)),
    Boolean(clean(product?.shipping_summary)),
    Boolean(returns) && !/^Returns not accepted$/i.test(returns),
    !/out of stock|unavailable/i.test(clean(product?.availability))
  ].filter(Boolean).length;
}

function presentProduct(product, language = "en") {
  const publicCategory = canonicalCategory(product);
  if (!product) return product;
  const count = evidenceCount(product);
  const discount = discountPercent(product);
  const checkedAt = clean(product.checked_at || product.updated_at);
  const checkedDate = checkedAt && !Number.isNaN(new Date(checkedAt).getTime())
    ? new Date(checkedAt).toLocaleString(languageTag(product.market, language))
    : "";
  const checkedTime = checkedAt ? new Date(checkedAt).getTime() : NaN;
  /* Unknown counts as not current: a listing with no check date is the one we
     know least about, not the one to trust most. */
  const priceIsCurrent = Number.isFinite(checkedTime)
    && Date.now() - checkedTime <= PRICE_CONFIDENT_HOURS * 3600 * 1000;
  const store = clean(product.retailer_name) || clean(product.source) || t(language, "product.retailer");
  const displayShipping = localizeShipping(product.shipping_summary, product, language);
  const displayReturns = localizeReturns(product.return_summary, language);
  const displayAvailability = localizeAvailability(product.availability, language);
  const displayReason = presentationReason(product, language);
  const rawDealScore = oneDailyDropScore(product);
  const confidence = oneDailyDropEvidenceConfidence(product);
  // Candidate ranking and consumer presentation are deliberately separate.
  // Only offers that pass the editorial floor receive a calibrated public score.
  /* Today's price throughout: this is the live score, and every input to it has
     to describe the listing as it is now. Leaving the snapshot's price here
     while the score came from the current one is what kept search and the
     product page apart after the first half of this fix. */
  const dealScore = isDailyPickEligible({
    ...pricedAs(product, false),
    score:rawDealScore,
    evidence_confidence:confidence,
  }, {
    /* A shop that publishes no per-listing delivery charge is not thereby a
       worse offer. The drop's ten slots still demand one; a product page
       scores what is known and lets the confidence carry the rest. */
    requireKnownFulfillment:false
  }) ? publicOneDailyDropScore(rawDealScore, confidence, commerceQuality(pricedAs(product, false)), {
    /* Reviews of the product, not of the seller. A shop with a spotless
       feedback record has still told us nothing about this thing. */
    hasReviews: number(product.review_count) >= MEANINGFUL_REVIEW_COUNT && number(product.rating) > 0,
    /* The same test the badge uses, so the number and the badge cannot
       disagree about whether there is a saving. */
    hasStatedDiscount: discount > 0 && priceIsCurrent,
  }) : null;

  /*
   * The number as it stood on the day this was chosen, for the one place that
   * is a statement about that day: the archive.
   *
   * Kept out of display_score deliberately. Both are real and they mean
   * different things, and putting them in one field is what let a search
   * result and a product page disagree about the same product.
   *
   * Not recalibrated — no commerce quality, no evidence test. Those describe
   * the listing as it is now, and applying them to a past selection would
   * rewrite what we said at the time, which is the whole reason the snapshot
   * exists.
   */
  const selectionScore = product?.drop_score != null
    ? publicOneDailyDropScore(oneDailyDropScore(product, { snapshot: true }), confidence, null, null)
    : null;
  const productRating = number(product.rating, NaN);
  const sellerPercent = sellerRatingPercent(product);
  const sellerFeedbackCount = Math.max(0, Math.round(number(product.seller_feedback_count)));
  const localizedSellerPercent = sellerPercent == null
    ? ""
    : new Intl.NumberFormat(languageTag(product.market, language), { maximumFractionDigits: 1 }).format(sellerPercent);
  return {
    ...product,
    shipping_summary: displayShipping,
    return_summary: displayReturns,
    availability: displayAvailability,
    selection_reason: displayReason,
    public_category: publicCategory,
    display_category: categoryLabel(publicCategory, language),
    display_shipping_summary: displayShipping,
    display_return_summary: displayReturns,
    display_availability: displayAvailability,
    display_selection_reason: displayReason,
    display_badge: badge(product, language),
    display_current_price: money(product.current_price, product.currency, product.market, language),
    display_original_price: number(product.original_price) > 0
      ? money(product.original_price, product.currency, product.market, language)
      : "",
    display_price_label: t(language, "product.currentPrice"),
    display_status: checkedDate
      ? t(language, "product.priceChecked", { date: checkedDate })
      : t(language, "product.priceVerified"),
    display_action_label: t(language, "product.viewDealAt", { store }),
    /* Whether a link to this shop's front door can be built at all, so a page
       only offers "Shop all at X" where following it would actually earn a
       commission. Derived, not stored: it depends on the shape of the affiliate
       link this listing carries, and that can change with the feed. The link
       itself is not published here — the page asks for it by product id at
       /go/:id?action=shop_all, which is also what records the click. */
    display_shop_all: Boolean(storefrontUrl(product)),
    display_shop_all_label: t(language, "product.shopAllAt", { store }),
    display_price_history_label: t(language, "product.priceHistory"),
    /* A saving is arithmetic on a price, so it can be no fresher than the
       price. Past the confidence window both of these go quiet rather than
       repeating yesterday's percentage as though it were today's. */
    display_save_label: discount > 0 && priceIsCurrent ? t(language, "product.belowReferencePercent", { percent: discount }) : "",
    display_off_label: discount > 0 && priceIsCurrent ? t(language, "product.off", { percent: discount }) : "",
    /* Published so the pages can make the same decision once, in one place,
       instead of each re-deriving "how old is too old" from checked_at. */
    display_price_is_current: priceIsCurrent,
    display_reviews_label: t(language, "product.reviews"),
    display_review_count: Math.round(number(product.review_count)).toLocaleString(languageTag(product.market, language)),
    display_score: dealScore,
    display_score_label: t(language, "product.oneDailyDropScore"),
    display_score_context: t(language, "product.overallDealScore"),
    display_evidence_confidence: confidence,
    display_evidence_confidence_label: t(language, "product.evidenceConfidence"),
    display_score_at_selection: selectionScore,
    display_score_at_selection_label: t(language, "product.scoreAtSelection"),
    display_product_rating: Number.isFinite(productRating) && productRating > 0
      ? `${productRating.toFixed(1)}/5`
      : "",
    display_product_rating_label: t(language, "product.productRating"),
    display_seller_rating: sellerPercent == null
      ? ""
      : t(language, "product.sellerRatingSummary", { percent: localizedSellerPercent }),
    display_seller_rating_label: t(language, "product.sellerRating"),
    display_seller_feedback: sellerFeedbackCount > 0
      ? t(language, "product.sellerFeedbackCount", {
        count: sellerFeedbackCount.toLocaleString(languageTag(product.market, language))
      })
      : "",
    evidence_count: count,
    evidence_label: t(language, "product.verifiedSignals", { count })
  };
}

module.exports = {
  badge,
  EVIDENCE_CEILING,
  MEANINGFUL_REVIEW_COUNT,
  PUBLIC_SCORE_FLOOR,
  discountPercent,
  evidenceCount,
  localizeAvailability,
  localizeReturns,
  localizeShipping,
  oneDailyDropScore,
  oneDailyDropEvidenceConfidence,
  publicOneDailyDropScore,
  presentProduct,
  presentationReason,
  sellerRatingPercent,
  scoreBreakdown
};
