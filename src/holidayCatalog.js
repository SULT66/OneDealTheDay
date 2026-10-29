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
function getHolidayCollection(db, { market = 'us', q = '', sort = 'popular', page = 1, maxPrice, preview = false, now = Date.now() } = {}) {
  const { sourceSql, uniqueProductsInOrder } = require('./publicCatalog');
  let rows = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()}
    ORDER BY COALESCE(ranking_score,score,0) DESC,id ASC`).all(market)
    .filter(row => isHolidayProduct(row) && Number(row.current_price) > 0 &&
      /^https:\/\//i.test(row.image_url || '') && /^https:\/\//i.test(row.affiliate_url || '') &&
      (!Number(row.review_count) || Number(row.rating) >= 3.8));
  rows = uniqueProductsInOrder(rows);
  const ceiling = Number(maxPrice);
  if (Number.isFinite(ceiling) && ceiling > 0) rows = rows.filter(row => Number(row.current_price) <= ceiling);
  const groups = ['decor','lights','gifts','new-year'];
  if (q) rows = rows.filter(row => groups.includes(q) ? holidayGroup(row) === q
    : String(row.title).toLowerCase().includes(String(q).toLowerCase().slice(0,100)));
  if (sort === 'price-asc') rows.sort((a,b) => a.current_price-b.current_price || a.id-b.id);
  else if (sort === 'price-desc') rows.sort((a,b) => b.current_price-a.current_price || a.id-b.id);
  else rows.sort((a,b) => Number(b.review_count || 0)-Number(a.review_count || 0) ||
    Number(b.ranking_score || b.score || 0)-Number(a.ranking_score || a.score || 0) || a.id-b.id);
  const total = rows.length;
  if(preview) {
    const ordered = rows.sort((a,b)=>holidayGroup(a).localeCompare(holidayGroup(b)));
    const groupsUsed = new Set(), lead=[], rest=[];
    for(const row of ordered){const group=holidayGroup(row);if(!groupsUsed.has(group)){lead.push(row);groupsUsed.add(group);}else rest.push(row);}
    return {active:isHolidaySeason(now),total,pages:Math.max(1,Math.ceil(total/24)),page:1,products:require('./productVariety').variedProducts([...lead,...rest],8)};
  }
  const pages = Math.max(1,Math.ceil(total/24));
  page = Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  return { active:isHolidaySeason(now), total, pages, page, products:rows.slice((page-1)*24,page*24) };
}
module.exports = { START, END, isHolidaySeason, isHolidayProduct, holidayGroup, getHolidayCollection };
