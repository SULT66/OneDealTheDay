import type { Deal } from "./types";
export type ComparisonOffer = Pick<Deal,"title"|"image"|"price"|"currency"|"priceIsCurrent"|"retailer"|"brand"|"rating"|"reviewCount"|"score"|"seller"|"delivery"|"returns"|"availability"|"checkedAt">;
export type ComparisonItem = Pick<Deal,"id"|"title"|"image"|"category"|"currency"> & {offer?:ComparisonOffer};
// The same verified fields already rendered on the page. No price history or
// other large product payload crosses the client boundary for comparison.
export function comparisonItem(deal:Deal):ComparisonItem {
  const {title,image,price,currency,priceIsCurrent,retailer,brand,rating,reviewCount,score,seller,delivery,returns,availability,checkedAt}=deal;
  return {id:deal.id,title,image,category:deal.category,currency,offer:{title,image,price,currency,priceIsCurrent,retailer,brand,rating,reviewCount,score,seller,delivery,returns,availability,checkedAt}};
}
