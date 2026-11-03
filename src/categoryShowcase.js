const {discoveryEligible,recommendationScore}=require("./discoveryRanking");
const retailer=p=>String(p.retailer||p.retailer_name||p.source||"").toLowerCase();
const quality=p=>Number(p.recommendationScore||p.recommendation_score)||recommendationScore(p);
function orderCategoryShowcase(products,{firstPage=24}={}){
  const rows=[...(products||[])], limit=Math.min(firstPage,rows.length);
  const candidates=rows.filter(p=>discoveryEligible(p)&&quality(p)>=48);
  const distinct=new Set(candidates.map(retailer));
  const cap=distinct.size>=4?6:distinct.size>=3?8:distinct.size===2?12:limit;
  const selected=[],used=new Set(),counts=new Map();
  for(const enforceCap of [true,false]){
    while(selected.length<limit){
      let best=null,value=-Infinity;
      for(const p of candidates){
        if(used.has(p))continue;
        const n=counts.get(retailer(p))||0;
        if(enforceCap&&n>=cap)continue;
        const score=quality(p)-n*8;
        if(score>value){best=p;value=score;}
      }
      if(!best)break;
      selected.push(best);used.add(best);
      counts.set(retailer(best),(counts.get(retailer(best))||0)+1);
    }
  }
  for(const p of rows){if(selected.length>=limit)break;if(!used.has(p)){selected.push(p);used.add(p);}}
  return [...selected,...rows.filter(p=>!used.has(p))];
}
module.exports={orderCategoryShowcase};
