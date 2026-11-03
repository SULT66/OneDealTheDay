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
module.exports={holidayPreview};
