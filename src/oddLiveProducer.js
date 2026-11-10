"use strict";
const {composeHostTurn} = require("./oddLiveBrain");
const {tavusProductDetails} = require("./tavusProductTool");

// Read-only producer preview. The queue is not acknowledged until a downstream
// audio/video worker confirms delivery, which is not yet wired.
function productForHost(drop, now = Date.now()) {
  const details = tavusProductDetails(drop, now);
  if (!details.presentation_allowed || !details.product) throw new Error("DROP_NOT_LIVE");
  const p = details.product;
  return {
    title: p.title,
    brand: p.brand,
    retailer_name: p.retailer,
    price: p.current_price,
    currency: p.currency,
    stock_status: "unknown",
  };
}
async function preparePreviewTurn({drop, question, generateText, now = Date.now()}) {
  const product = productForHost(drop, now);
  const spokenText = await composeHostTurn({product, question, generateText});
  return {spoken_text: spokenText, product_title: product.title, preview_only: true};
}
module.exports = {productForHost, preparePreviewTurn};
