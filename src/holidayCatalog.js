const NYE = Date.parse('2027-01-01T05:00:00Z');
const CHRISTMAS_CUTOFF = '2026-12-24';
const isNewYearSpotlight = (now = Date.now()) => now >= Date.parse('2026-12-01T05:00:00Z') && now < NYE;
const normalizeGiftZip = value => typeof value === 'string' && /^\d{5}$/.test(value.trim()) ? value.trim() : '';

function giftArrivalDate(row, zip, now) {
  const { PRICE_CONFIDENT_HOURS } = require('./productPresentation');
  const checked = Date.parse(row.checked_at || '');
  const estimate = Date.parse(row.delivery_estimated_at || '');
  if (!zip || row.delivery_country !== 'US' || normalizeGiftZip(row.delivery_postal_code) !== zip ||
      !/^(?:in[ _-]?stock|available)$/i.test(String(row.availability || '').trim()) ||
      !Number.isFinite(checked) || checked > now || now - checked > PRICE_CONFIDENT_HOURS * 3600000 ||
      !Number.isFinite(estimate)) return null;
  const day = new Date(estimate).toISOString().slice(0, 10);
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/New_York'}).format(now);
  return day >= today && day <= CHRISTMAS_CUTOFF ? day : null;
}

function matchesParty(row) {
  const title = String(row.title || '');
  const { partyGroup } = require('./holidayShowcase');
  const group = partyGroup(row);
  if (!group || /\b(?:halloween|easter|baby shower|graduation|bachelorette|dollhouse|miniature|santa|reindeer|stocking stuffer|cutlery bags?|tableware cases?|without dinnerware|crinkle confetti)\b/i.test(title)) return false;
  if (/\b(?:new year|nye|2027)\b/i.test(title)) return true;
  if (/\b(?:christmas|xmas|thanksgiving|birthday|wedding)\b/i.test(title)) return false;
  return group !== 'lights' || /\b(?:party lights?|disco balls?)\b/i.test(title);
}

const START = Date.parse('2026-10-28T04:00:00Z');
const END = Date.parse('2027-01-08T05:00:00Z');
const isHolidaySeason = (now = Date.now()) => now >= START && now < END;
function isHolidayProduct(product = {}) {
  const title = String(product.title || '');
  return /\b(?:christmas|xmas|advent|nutcrackers?|stocking holders?|tree skirts?|tree toppers?|ornament sets?|new year(?:s|\s*['’]s)?(?: eve| party| decorations?)?|2027 party)\b/i.test(title) &&
    !/\b(?:halloween|horror|replacement parts?|repair service|digital download)\b/i.test(title);
}
function holidayGroup(product) {
  const title = String(product.title || '').toLowerCase();
  if (/new year|2027|confetti|party/.test(title)) return 'new-year';
  if (/lights?|led|projector/.test(title)) return 'lights';
  if (/tree|wreath|garland|ornament|stocking|decoration|nutcracker/.test(title)) return 'decor';
  return 'gifts';
}
function getHolidayCollection(db, { market = 'us', q = '', sort = 'popular', page = 1, maxPrice, preview = false, zip, now = Date.now() } = {}) {
  const { sourceSql, uniqueProductsInOrder } = require('./publicCatalog');
  const { giftEligible, giftGroup, giftPicks, holidayPreview, partyPicks } = require('./holidayShowcase');
  const gifts = q === 'gift-guide' || q === 'last-minute';
  const party = q === 'new-year';
  const lastMinute = q === 'last-minute';
  const zipCode = market === 'us' && lastMinute ? normalizeGiftZip(zip) : '';
  if (lastMinute && !zipCode) return {active:isHolidaySeason(now),total:0,pages:1,page:1,products:[],arrivalDates:{}};
  const seasonalTitles = `title LIKE '%christmas%' OR title LIKE '%xmas%' OR title LIKE '%advent%' OR title LIKE '%nutcracker%'
    OR title LIKE '%stocking holder%' OR title LIKE '%tree skirt%' OR title LIKE '%tree topper%'
    OR title LIKE '%ornament set%' OR title LIKE '%new year%' OR title LIKE '%2027 party%'`;
  const giftCategories = `'Gifts','Toys & Games','Home & Kitchen','Electronics','Arts & Crafts','Travel','Health & Beauty','Baby & Kids','Pet Supplies'`;
  const theme = gifts ? `(${seasonalTitles} OR normalized_category IN (${giftCategories}))`
    : party ? `(${seasonalTitles} OR normalized_category IN ('Home & Kitchen','Other Deals','Gifts','Christmas & New Year'))`
    : `(${seasonalTitles})`;
  const arrivalFilter = lastMinute ? "AND delivery_country='US' AND delivery_postal_code=?" : '';
  let rows = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()}
    AND ${theme} ${arrivalFilter} ORDER BY COALESCE(ranking_score,score,0) DESC,id ASC`)
    .all(market, ...(lastMinute ? [zipCode] : []))
    .filter(row => (gifts ? giftEligible(row) : party ? matchesParty(row) : isHolidayProduct(row)) &&
      Number(row.current_price) > 0 &&
      /^https:\/\//i.test(row.image_url || '') && /^https:\/\//i.test(row.affiliate_url || '') &&
      (!Number(row.review_count) || Number(row.rating) >= 3.8));
  if (lastMinute) rows = rows.filter(row => giftArrivalDate(row, zipCode, now));
  rows = uniqueProductsInOrder(rows);
  const ceiling = Number(maxPrice);
  if (Number.isFinite(ceiling) && ceiling > 0) rows = rows.filter(row => Number(row.current_price) <= ceiling);
  const groups = ['decor','lights','gifts','new-year'];
  if (q && !gifts && !party) rows = rows.filter(row => groups.includes(q) ? holidayGroup(row) === q
    : String(row.title).toLowerCase().includes(String(q).toLowerCase().slice(0,100)));
  if (sort === 'price-asc') rows.sort((a,b) => a.current_price-b.current_price || a.id-b.id);
  else if (sort === 'price-desc') rows.sort((a,b) => b.current_price-a.current_price || a.id-b.id);
  else rows.sort((a,b) => Number(b.review_count || 0)-Number(a.review_count || 0) ||
    Number(b.ranking_score || b.score || 0)-Number(a.ranking_score || a.score || 0) || a.id-b.id);
  const total = rows.length;
  if (preview) {
    const products = gifts ? giftPicks(rows) : party ? partyPicks(rows) : holidayPreview(rows, 8);
    const giftGroups = gifts ? Object.fromEntries(products.map(row => [row.id, giftGroup(row)])) : undefined;
    return {active:isHolidaySeason(now), total, pages:Math.max(1,Math.ceil(total/24)), page:1, products, giftGroups};
  }
  if (sort !== 'price-asc' && sort !== 'price-desc') {
    const featured = gifts ? giftPicks(rows) : party ? partyPicks(rows) : [];
    const ids = new Set(featured.map(row => row.id));
    rows = [...featured, ...require('./categoryShowcase').orderCategoryShowcase(rows.filter(row => !ids.has(row.id)))];
  }
  const pages = Math.max(1,Math.ceil(total/24));
  page = Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  const products = rows.slice((page-1)*24,page*24);
  const arrivalDates = lastMinute ? Object.fromEntries(products.map(row => [row.id, giftArrivalDate(row, zipCode, now)])) : {};
  return {active:isHolidaySeason(now), total, pages, page, products, arrivalDates};
}
module.exports = { START, END, isHolidaySeason, isHolidayProduct, holidayGroup, getHolidayCollection, isNewYearSpotlight, normalizeGiftZip };
