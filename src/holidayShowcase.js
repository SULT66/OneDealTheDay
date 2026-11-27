const {discoveryEligible,recommendationScore}=require("./discoveryRanking");
const {variedProducts}=require("./productVariety");
const group=p=>{
 const t=String(p.title||"").toLowerCase();
 if(/new year|2027|confetti|party/.test(t))return "new-year";
 if(/lights?|led|projector/.test(t))return "lights";
 if(/tree|wreath|garland|ornament|stocking|decoration|nutcracker/.test(t))return "decor";
 return "gifts";
};
function holidayPreview(rows,limit=8){
 const eligible=(rows||[]).filter(p=>
   Number(p.current_price)>14 && discoveryEligible(p) &&
   !/\b(?:stickers?|pillow ?cases?|replacement|repair kits?|spare parts?|gift cards?)\b/i.test(String(p.title||"")));
 const ordered=variedProducts(eligible.sort((a,b)=>recommendationScore(b)-recommendationScore(a)),120);
 const shops=new Set(ordered.map(p=>String(p.retailer_name||p.source||"").toLowerCase()));
 const cap=shops.size>=4?2:shops.size>=3?3:shops.size===2?4:limit;
 const picked=[],used=new Set(),byShop=new Map(),byGroup=new Map();
 for(const strict of [true,false]){
   for(const p of ordered){
     if(picked.length>=limit)break;
     if(used.has(p))continue;
     const shop=String(p.retailer_name||p.source||"").toLowerCase(),g=group(p);
     if(strict&&((byShop.get(shop)||0)>=cap||(byGroup.get(g)||0)>=3))continue;
     used.add(p);picked.push(p);
     byShop.set(shop,(byShop.get(shop)||0)+1);
     byGroup.set(g,(byGroup.get(g)||0)+1);
   }
 }
 return picked;
}

const giftGroups = [
  ['games', /\b(?:board games?|card games?|dominion|catan|monopoly|chess sets?|jigsaw|puzzles?)\b/i],
  ['coffee', /\b(?:coffee|espresso) (?:makers?|machines?|grinders?|press|mugs?|sets?)\b|\bportable espresso\b/i],
  ['kids', /\b(?:lego|building sets?|building blocks?|plush toys?|science kits?)\b/i],
  ['tech', /\b(?:bluetooth speakers?|headphones|earbuds|power banks?|digital photo frames?|instant cameras?|mini projectors?|bluetooth trackers?)\b/i],
  ['home', /\b(?:throw blankets?|photo blankets?|weighted blankets?|candles?|serving boards?|dinnerware sets?|picture frames?|salt lamps?|electric kettles?)\b/i],
  ['creative', /\b(?:craft kits?|watercolor sets?|paint sets?|knitting kits?|embroidery kits?)\b/i],
  ['pet', /\b(?:interactive dog toys?|cat toys?|pet water fountains?|pet beds?)\b/i],
  ['travel', /\b(?:travel organizers?|travel pillows?|packing cubes?|passport holders?)\b/i],
  ['wellness', /\b(?:massage guns?|hand massagers?|eye massagers?)\b/i],
  ['personalized', /\b(?:custom|personalized|personalised)\b.{0,48}\b(?:mugs?|keyrings?|keychains?|aprons?|photo frames?|ornaments?)\b/i],
];
const giftGroup = product => giftGroups.find(([, pattern]) => pattern.test(String(product.title)))?.[0];
const giftEligible = product => Boolean(giftGroup(product)) &&
  !/\b(?:parts|replacement|repair kits?|empty boxes?|pre.?owned|refurbished|open box|used condition|carrying cases?|storage bags?|zipper file bags?|accessor(?:y|ies) only|compatible (?:with|for)|without (?:the )?(?:game|device|machine))\b/i.test(product.title) &&
  !/\b(?:used|open.box|refurbished)\b/i.test(product.condition || '') &&
  discoveryEligible(product);

const partyGroups = [
  ['table', /\b(?:table runners?|tablecloths?|tableware|placemats?|dinnerware|serving (?:trays?|platters?|boards?)|charcuterie boards?|napkins?|champagne (?:flutes?|glasses)|wine glasses|party plates?|party cups?|cocktail (?:shakers?|sets?))\b/i],
  ['photos', /\b(?:photo (?:booth|props?)|backdrops?|fringe curtains?|foil curtains?)\b/i],
  ['countdown', /\b(?:confetti|party (?:hats?|crowns?|tiaras?|horns?|decorations?)|balloons?|banners?|countdown|noisemakers?)\b/i],
  ['lights', /\b(?:string lights?|fairy lights?|garland lights?|disco balls?|party lights?)\b/i],
];
const partyGroup = product => partyGroups.find(([, pattern]) => pattern.test(String(product.title)))?.[0];

function curatedPicks(rows, classify, limit, balanceBudget = false) {
  const ordered = variedProducts([...rows].sort((a,b) => recommendationScore(b) - recommendationScore(a) || a.id - b.id));
  const shops = new Map(), groups = new Map(), budgets = new Map();
  const picked = [];
  const shopOf = row => String(row.retailer_name || row.source).toLowerCase();
  const budgetOf = row => [25,50,100,175].find(cap => row.current_price <= cap);
  const shopCount = new Set(ordered.map(shopOf)).size;
  if (!shopCount) return [];
  const shopCap = Math.max(3, Math.ceil(limit / shopCount) + 1);
  const candidates = ordered.map((row, index) => ({row, index, shop:shopOf(row), group:classify(row), budget:budgetOf(row)}));
  while (picked.length < limit && candidates.length) {
    const penalty = item => (groups.get(item.group) || 0) * 16 + (shops.get(item.shop) || 0) * 7 +
      (balanceBudget ? (budgets.get(item.budget) || 0) * 5 + (item.budget === 175 ? 12 : 0) : 0) + item.index;
    candidates.sort((a,b) => penalty(a) - penalty(b));
    const index = candidates.findIndex(item => (shops.get(item.shop) || 0) < shopCap && (groups.get(item.group) || 0) < 3);
    if (index < 0) break;
    const [{row, shop, group, budget}] = candidates.splice(index,1);
    picked.push(row);
    shops.set(shop,(shops.get(shop) || 0)+1);
    groups.set(group,(groups.get(group) || 0)+1);
    budgets.set(budget,(budgets.get(budget) || 0)+1);
  }
  return picked;
}

const giftPicks = rows => curatedPicks(rows.filter(row => row.current_price >= 8 && row.current_price <= 175 && giftEligible(row)), giftGroup, 12, true);
const partyPicks = rows => curatedPicks(rows.filter(row => partyGroup(row) && discoveryEligible(row)), partyGroup, 10);
module.exports = {holidayPreview, giftGroup, giftEligible, giftPicks, partyGroup, partyPicks};
