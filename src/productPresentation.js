const { categoryLabel, languageTag, t } = require("./i18n");

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

function oneDailyDropScore(product) {
  const raw = product?.drop_score ?? product?.score;
  const value = number(raw, NaN);
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null;
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
  return rating > 0 && reviews > 0
    ? summary
    : `${summary} ${t(language, "product.noProductRating")}`;
}

function badge(product, language) {
  const discount = discountPercent(product);
  const breakdown = scoreBreakdown(product);
  const rating = number(product?.rating);
  const reviews = number(product?.review_count);
  const buyerFriendly = /^Free shipping/i.test(clean(product?.shipping_summary)) &&
    clean(product?.return_summary) && !/^Returns not accepted$/i.test(clean(product?.return_summary));
  if (discount >= 20) return t(language, "product.priceDrop");
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
  if (!product) return product;
  const count = evidenceCount(product);
  const discount = discountPercent(product);
  const checkedAt = clean(product.checked_at || product.updated_at);
  const checkedDate = checkedAt && !Number.isNaN(new Date(checkedAt).getTime())
    ? new Date(checkedAt).toLocaleString(languageTag(product.market, language))
    : "";
  const store = clean(product.retailer_name) || clean(product.source) || t(language, "product.retailer");
  const displayShipping = localizeShipping(product.shipping_summary, product, language);
  const displayReturns = localizeReturns(product.return_summary, language);
  const displayAvailability = localizeAvailability(product.availability, language);
  const displayReason = presentationReason(product, language);
  const dealScore = oneDailyDropScore(product);
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
    display_category: categoryLabel(product.category || "Deals", language),
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
    display_price_history_label: t(language, "product.priceHistory"),
    display_save_label: discount > 0 ? t(language, "product.save", { percent: discount }) : "",
    display_off_label: discount > 0 ? t(language, "product.off", { percent: discount }) : "",
    display_reviews_label: t(language, "product.reviews"),
    display_review_count: Math.round(number(product.review_count)).toLocaleString(languageTag(product.market, language)),
    display_score: dealScore,
    display_score_label: t(language, "product.oneDailyDropScore"),
    display_score_context: t(language, "product.overallDealScore"),
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
  discountPercent,
  evidenceCount,
  localizeAvailability,
  localizeReturns,
  localizeShipping,
  oneDailyDropScore,
  presentProduct,
  presentationReason,
  sellerRatingPercent,
  scoreBreakdown
};
