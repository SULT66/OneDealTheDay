/*
 * What we can honestly say about one offer, decided in one place.
 *
 * The rules this answers were already in the codebase — they were just in six
 * places. The ranker decided eligibility, the presentation layer decided
 * whether a score could be shown, the search endpoint rescored what it loaded,
 * the drop selector applied its own thresholds, Delia formed its own opinion,
 * and the cards guessed from whatever fields survived the trip. Three separate
 * bugs came out of that in a fortnight, all the same shape: two pieces of code
 * computing the same claim and disagreeing about it.
 *
 * So there is one answer per offer now, computed here, and the screens read it
 * rather than re-deriving it. Everything below is a rule that already existed
 * somewhere; nothing here is a new opinion about what makes an offer good.
 *
 * What this deliberately does not claim: that we handled the product, that it
 * will arrive, or that no cheaper price exists elsewhere. It reports what the
 * data supports and, just as explicitly, what it does not.
 */

const {
  commerceQuality,
  evidenceConfidence,
  isDailyPickEligible,
  landedCost,
  paidShippingCost,
} = require("./ranker");
const {
  MEANINGFUL_REVIEW_COUNT,
  PRICE_CONFIDENT_HOURS,
  discountPercent,
  oneDailyDropEvidenceConfidence,
  oneDailyDropScore,
  publicOneDailyDropScore,
} = require("./productPresentation");

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const filled = (value) => String(value ?? "").trim().length > 0;

/*
 * The bar a listing clears to be shown as an ordinary priced card at all.
 *
 * Not a quality judgement — every one of these is something we need in order
 * to draw the card truthfully. A listing with no price cannot carry a price, a
 * listing with no shop cannot say where you would be buying, and a listing
 * with no capture time cannot say how old its price is.
 */
const PUBLICATION_REQUIREMENTS = Object.freeze([
  ["title", (product) => filled(product.title)],
  ["image", (product) => filled(product.image_url)],
  ["price", (product) => number(product.current_price) > 0],
  ["currency", (product) => filled(product.currency)],
  ["retailer", (product) => filled(product.retailer_name) || filled(product.source)],
  ["offer_url", (product) => /^https?:\/\//i.test(String(product.affiliate_url || ""))],
  ["source", (product) => filled(product.source)],
  ["price_checked_at", (product) => filled(product.checked_at) || filled(product.updated_at)],
]);

/*
 * Availability is three-valued and the third value is not a synonym for the
 * first. Most feeds simply do not carry a stock field, and a listing whose
 * availability we have never been told is the one we know least about — it is
 * not the one to present as "in stock".
 */
function availabilityOf(product) {
  const stated = String(product.availability || "").trim();
  if (!stated) return "unknown";
  if (/\b(out of stock|unavailable|sold out|expired|discontinued)\b/i.test(stated)) return "out_of_stock";
  if (/\b(in stock|available)\b/i.test(stated)) return "in_stock";
  return "unknown";
}

function returnsOf(product) {
  const summary = String(product.return_summary || "").trim();
  if (!summary) return { summary: "", allowed: null };
  const refused = /\b(not accepted|no returns|final sale)\b/i.test(summary);
  return { summary, allowed: !refused };
}

/*
 * How old the price may be before the arithmetic performed on it stops being
 * honest. The last known price still shows, with its date; what stops is the
 * percentage, because a discount is a claim about right now.
 */
function priceFreshness(product, now) {
  const stamp = String(product.checked_at || product.updated_at || "").trim();
  const at = stamp ? Date.parse(stamp) : NaN;
  if (!Number.isFinite(at)) return { checked_at: null, is_current: false, age_hours: null };
  const ageHours = (now - at) / 3600000;
  return {
    checked_at: new Date(at).toISOString(),
    is_current: ageHours <= PRICE_CONFIDENT_HOURS,
    age_hours: Math.max(0, Math.round(ageHours * 10) / 10),
  };
}

/*
 * The five groups of supporting data, counted as groups rather than as fields.
 *
 * A rating and a review count are one fact about one thing, so they count once
 * — otherwise a listing with a single number attached would look twice as well
 * documented as it is. And the shop's name is not evidence about the seller: a
 * retailer that publishes no feedback record has told us nothing, however well
 * known it is.
 */
function evidenceGroups(product) {
  const shipping = paidShippingCost(product);
  return {
    product_reviews: number(product.rating) > 0 && number(product.review_count) > 0,
    seller_reputation: number(product.seller_rating) > 0 || number(product.seller_feedback_count) > 0,
    delivery: shipping != null || filled(product.shipping_summary),
    returns: filled(product.return_summary),
    price_context:
      number(product.original_price) > number(product.current_price) ||
      number(product.comparable_offer_count) >= 2 ||
      number(product.average_30_day_price) > 0 ||
      number(product.average_90_day_price) > 0,
  };
}

/*
 * eBay sellers are individuals, and the feedback record is the only thing
 * standing behind the listing. A shop's own site does not have an equivalent,
 * so this applies where it means something and nowhere else.
 *
 * eBay publishes the figure as a percentage; some feeds normalise it to five.
 * Both are accepted and compared on the same scale rather than one of them
 * silently passing because 99.4 is larger than 4.8.
 */
const EBAY_SELLER_RATING_FLOOR = 4.8;
const EBAY_SELLER_FEEDBACK_FLOOR = 100;

function sellerRatingOnFive(product) {
  const rating = number(product.seller_rating);
  if (rating <= 0) return null;
  return rating > 5 ? rating / 20 : rating;
}

function sellerMeetsBar(product) {
  if (String(product.source || "").toLowerCase() !== "ebay") return true;
  const rating = sellerRatingOnFive(product);
  return rating != null
    && rating >= EBAY_SELLER_RATING_FLOOR
    && number(product.seller_feedback_count) >= EBAY_SELLER_FEEDBACK_FLOOR;
}

/*
 * Why an offer carries no score, and the distinction that matters most here:
 * between not knowing and knowing something poor.
 *
 * "No product reviews" and "rated below our bar" are different statements
 * about an offer, and rolling them into one line — "not enough information" —
 * would hide a low rating behind a shrug. They are kept apart, and a listing
 * that fails on evidence reports every group it is missing rather than the
 * first one checked.
 */
const SCORE_RULES = Object.freeze([
  {
    reason: "no_product_reviews",
    kind: "missing_data",
    passes: (product) => number(product.review_count) > 0 && number(product.rating) > 0,
  },
  {
    reason: "too_few_product_reviews",
    kind: "missing_data",
    /* Only where there are some. "No reviews" and "only two reviews" are
       different sentences to read on a card, and printing both is one of them
       repeating itself. */
    passes: (product) => number(product.review_count) === 0 || number(product.review_count) >= MEANINGFUL_REVIEW_COUNT,
  },
  {
    reason: "product_rating_below_bar",
    kind: "below_threshold",
    passes: (product) => number(product.rating) === 0 || number(product.rating) >= 4.3,
  },
  {
    reason: "seller_record_below_bar",
    kind: "below_threshold",
    passes: sellerMeetsBar,
  },
  {
    reason: "returns_not_accepted",
    kind: "below_threshold",
    passes: (product) => returnsOf(product).allowed !== false,
  },
  {
    reason: "evidence_confidence_below_bar",
    kind: "missing_data",
    passes: (product) => number(oneDailyDropEvidenceConfidence(product) ?? evidenceConfidence(product)) >= 55,
  },
  {
    reason: "commerce_quality_below_bar",
    kind: "below_threshold",
    passes: (product) => commerceQuality(product) >= 0.45,
  },
]);

/*
 * The extra conditions a scored offer clears to become the day's pick. They
 * are selection rules, not proof that nothing better exists anywhere — a
 * distinction the copy has to keep making, because the badge cannot.
 */
const DAILY_DROP_MINIMUM_PRICE = 25;
const DAILY_DROP_MINIMUM_DISCOUNT = 15;

function dailyDropChecks(product, { availability, returns, freshness, discount }) {
  return [
    ["not_scored", null],
    ["product_not_identifiable", filled(product.gtin) || filled(product.upc) || filled(product.ean) || filled(product.mpn) || filled(product.model_number)],
    ["availability_not_confirmed", availability === "in_stock"],
    ["delivery_cost_unknown", paidShippingCost(product) != null],
    ["returns_not_confirmed", returns.allowed === true],
    ["price_not_current", freshness.is_current],
    ["price_below_floor", number(product.current_price) >= DAILY_DROP_MINIMUM_PRICE],
    ["reference_gap_too_small", number(discount) >= DAILY_DROP_MINIMUM_DISCOUNT],
  ];
}

/**
 * Everything the screens are allowed to say about one offer.
 *
 * @param {object} product a catalogue row
 * @param {{now?: number}} [options]
 */
function offerStatus(product, { now = Date.now() } = {}) {
  const row = product || {};
  const missingToPublish = PUBLICATION_REQUIREMENTS
    .filter(([, holds]) => !holds(row))
    .map(([requirement]) => requirement);
  const publishable = missingToPublish.length === 0;

  const availability = availabilityOf(row);
  const returns = returnsOf(row);
  const freshness = priceFreshness(row, now);
  const shippingCost = paidShippingCost(row);
  const groups = evidenceGroups(row);
  const groupCount = Object.values(groups).filter(Boolean).length;

  const reference = number(row.original_price);
  const current = number(row.current_price);
  const discount = discountPercent(row);

  const failures = SCORE_RULES.filter((rule) => !rule.passes(row));
  const rawScore = oneDailyDropScore(row);
  const confidence = oneDailyDropEvidenceConfidence(row);
  /* The same eligibility call the product page makes, so a card and its page
     can never disagree about whether a score exists. */
  const eligible = isDailyPickEligible(
    { ...row, score: rawScore, evidence_confidence: confidence },
    { requireKnownFulfillment: false },
  );
  const scoreable = publishable && failures.length === 0 && eligible;
  const score = scoreable
    ? publicOneDailyDropScore(rawScore, confidence, commerceQuality(row), {
      hasReviews: number(row.review_count) >= MEANINGFUL_REVIEW_COUNT && number(row.rating) > 0,
      /* A saving is only stateable while the price it was computed from is
         still current, which is the same test the badge uses. */
      hasStatedDiscount: discount > 0 && freshness.is_current,
    })
    : null;

  /* Eligibility can refuse an offer the seven rules all passed — an
     unavailable listing, a delivery charge larger than the item. Saying so
     beats reporting no reason at all. */
  const scoreMissingReasons = score == null
    ? (failures.length
      ? failures.map(({ reason, kind }) => ({ reason, kind }))
      : [{ reason: "does_not_meet_scoring_criteria", kind: "below_threshold" }])
    : [];

  const status = score != null
    ? "scored"
    : groupCount >= 2 ? "limited_evidence" : "retailer_listing";

  const dropChecks = dailyDropChecks(row, { availability, returns, freshness, discount });
  const dropFailures = dropChecks
    .filter(([reason, passed]) => (reason === "not_scored" ? score == null : !passed))
    .map(([reason]) => reason);

  return {
    publishable,
    /* Named as what is missing, so a feed can be fixed rather than guessed at. */
    publication_blockers: missingToPublish,
    status,
    score,
    score_missing_reasons: scoreMissingReasons,
    evidence: { groups, group_count: groupCount, confidence },
    availability,
    price: {
      current: current || null,
      currency: String(row.currency || "").toUpperCase() || null,
      retailer_reference: reference > current ? reference : null,
      /* Named for what it is: a gap from the shop's own struck-through price,
         not a proven historical low and not the lowest price online. */
      below_retailer_reference_percent: discount > 0 ? discount : null,
      ...freshness,
    },
    delivery: { cost: shippingCost, known: shippingCost != null || filled(row.shipping_summary), landed_cost: landedCost(row) || null },
    returns,
    source: { provider: String(row.source || "") || null, retailer: String(row.retailer_name || "") || null },
    daily_drop_eligible: dropFailures.length === 0,
    daily_drop_blockers: dropFailures,
  };
}

module.exports = {
  DAILY_DROP_MINIMUM_DISCOUNT,
  DAILY_DROP_MINIMUM_PRICE,
  EBAY_SELLER_FEEDBACK_FLOOR,
  EBAY_SELLER_RATING_FLOOR,
  PUBLICATION_REQUIREMENTS,
  availabilityOf,
  evidenceGroups,
  offerStatus,
  sellerRatingOnFive,
};
