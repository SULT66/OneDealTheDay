"use strict";
const {composeHostTurn} = require("./oddLiveBrain");
const {presentDrop} = require("./liveDrop");

// Read-only producer preview. The queue is not acknowledged until a downstream
// audio/video worker confirms delivery, which is not yet wired.
function productForHost(drop, now = Date.now()) {
  const view = presentDrop(drop, now);
  if (!view || view.state !== "live") throw new Error("DROP_NOT_LIVE");
  return {
    title: view.title,
    brand: view.brand,
    retailer_name: view.retailer_name,
    price: view.drop_price,
    currency: view.currency,
    stock_status: "unknown",
  };
}
async function preparePreviewTurn({drop, question, generateText, now = Date.now()}) {
  const product = productForHost(drop, now);
  const spokenText = await composeHostTurn({product, question, generateText});
  return {spoken_text: spokenText, product_title: product.title, preview_only: true};
}
module.exports = {productForHost, preparePreviewTurn};
