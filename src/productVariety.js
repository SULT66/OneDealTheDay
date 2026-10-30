// Recognise product types across brands and colours. Unknown types are left
// alone: a broad category is not evidence that two products are the same type.
/** @type {Array<[string, RegExp]>} */
const TYPES = [
  ['espresso-machine', /\b(?:espresso|coffee) (?:machine|maker|press)\b/i],
  ['power-bank', /\bpower banks?\b/i],
  ['dinnerware', /\b(dinnerware|dinner sets?|plates?|stoneware|tableware)\b/i],
  ['roasting-pan', /\b(roasting pans?|roasters?)\b/i],
  ['thermometer', /\bthermometers?\b/i],
  ['table-linen', /\b(tablecloths?|table runners?|placemats?)\b/i],
  ['christmas-tree', /\b(?:christmas|xmas) tree\b/i],
  ['ornaments', /\b(ornaments?|baubles?|tree toppers?)\b/i],
  ['wreath-garland', /\b(wreaths?|garlands?)\b/i],
  ['advent-calendar', /\badvent calendars?\b/i],
  ['festive-lights', /\b(string lights?|fairy lights?|christmas lights?|icicle lights?)\b/i],
  ['headphones', /\b(headphones?|earbuds?|earphones?)\b/i],
  ['tool-bag', /\b(?:tool|contractors?) bags?\b/i],
  ['office-chair', /\b(?:office|gaming|desk|task|computer) chairs?\b/i],
  ['thermostat', /\bthermostats?\b/i],
  ['shelving', /\b(?:shelving|bookshelf|bookcase)\b/i],
  ['watch', /\b(watches|watch|smartwatch)\b/i],
  ['phone-case', /\b(?:phone|iphone|samsung|galaxy).{0,30}\bcase\b/i],
  ['floor-mat', /\b(floor mats?|floor liners?)\b/i],
];
function productType(product = {}) {
  return TYPES.find(([,pattern]) => pattern.test(String(product.title || '')))?.[0] || '';
}
function variedProducts(products, limit = products.length) {
  const used = new Set(), result = [];
  for (const product of products) {
    if (result.length >= limit) break;
    const type = productType(product);
    if (type && used.has(type)) continue;
    result.push(product);
    if (type) used.add(type);
  }
  return result;
}
module.exports = {productType, variedProducts};
