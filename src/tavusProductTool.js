const { presentDrop } = require("./liveDrop");

/**
 * Converts a published Live Drop row into the small, verified fact set Chloe
 * may speak. Missing facts stay null rather than becoming plausible copy.
 *
 * This is deliberately pure so the disclosure rules can be tested against a
 * fixed clock without running Express or asking Tavus to spend a live minute.
 */
function tavusProductDetails(drop, now = Date.now()) {
  const view = presentDrop(drop, now);
  if (!view) {
    return {
      ok: true,
      verified: false,
      presentation_allowed: false,
      reason: "No published OneDailyDrop Live product is scheduled for this market.",
      product: null,
    };
  }

  const live = view.state === "live";
  const future = view.state === "upcoming" || view.state === "waiting";
  const expired = view.state === "ended" || view.state === "sold_out";

  return {
    ok: true,
    verified: true,
    presentation_allowed: live,
    state: view.state,
    instruction: live
      ? "Present only the non-null facts below. Never infer a missing fact."
      : future
        ? "The offer is not live. Do not reveal a deal price or tell viewers to buy."
        : "This offer is no longer active. Do not present it as available.",
    product: {
      drop_key: view.drop_key,
      title: view.title,
      brand: view.brand || null,
      retailer: view.retailer_name || null,
      image_url: view.image_url || null,
      currency: view.currency,
      regular_price: view.retail_price,
      current_price: live ? view.drop_price : null,
      discount_amount: live ? view.saving?.amount ?? null : null,
      discount_percent: live ? view.saving?.percent ?? null : null,
      inventory_remaining:
        live && view.quantity_total > 0 ? view.quantity_remaining : null,
      buy_url: live ? view.affiliate_url || null : null,
      terms: view.terms || null,
      starts_at: future ? view.start_at : null,
      ends_at: live ? view.end_at : null,
      expired,
    },
  };
}

module.exports = { tavusProductDetails };
