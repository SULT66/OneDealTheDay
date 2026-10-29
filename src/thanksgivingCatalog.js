const {activeCampaign} = require('./merchandisingCalendar');
const {matchesQuery,isPromotionEligible} = require('./merchandisingSelection');
const {sourceSql,uniqueProductsInOrder} = require('./publicCatalog');
const GROUPS = {table:['dinnerware','tablecloth','table runner','serving tray'],kitchen:['roasting pan','food thermometer','baking dish','carving knife'],decor:['pumpkin decor','Thanksgiving decoration','autumn wreath']};
function getThanksgivingCollection(db,{market='us',q='',page=1,now=Date.now()}={}) {
  const signal=activeCampaign({eventKey:'thanksgiving',market,now,throughEvent:true});
  if(!signal)return {active:false,total:0,pages:1,page:1,products:[]};
  const queries=GROUPS[q]||Object.values(GROUPS).flat();
  const rows=db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} ORDER BY COALESCE(ranking_score,score,0) DESC,id`).all(market)
    .filter(p=>queries.some(query=>matchesQuery(p,query))&&isPromotionEligible(p,{market,now,requireReviews:false}));
  const products=uniqueProductsInOrder(rows),pages=Math.max(1,Math.ceil(products.length/24));
  const current=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  return {active:true,total:products.length,pages,page:current,products:products.slice((current-1)*24,current*24)};
}
module.exports={getThanksgivingCollection};
