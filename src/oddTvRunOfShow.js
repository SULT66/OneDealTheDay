"use strict";

const SHOW_MINUTES=60;
const PRODUCT_MINUTES=30;
const QUESTION_SLOTS_MINUTES=[8,17,26,38,47,56];
const QUESTION_PREP_MINUTES=5;

/**
 * The host voice starts the answer render five minutes before each Q&A slot.
 * Questions remain queued before that window, and generated clips carry
 * play_after so the local program can keep the current product segment on air.
 */
function elapsedMinutes(show,now=Date.now()) {
  const start=Date.parse(show?.start_at||"");
  if(!Number.isFinite(start))return 0;
  return Math.max(0,Math.min(SHOW_MINUTES,(now-start)/60000));
}
function productIndexForMinute(minute) {
  return minute<PRODUCT_MINUTES?0:1;
}
function questionWindow(show,now=Date.now()) {
  const elapsed=elapsedMinutes(show,now);
  for(const slotMinute of QUESTION_SLOTS_MINUTES) {
    const prepMinute=slotMinute-QUESTION_PREP_MINUTES;
    if(elapsed>=prepMinute&&elapsed<slotMinute) {
      return {
        slotMinute,
        productIndex:productIndexForMinute(slotMinute),
        playAfter:new Date(Date.parse(show.start_at)+slotMinute*60000).toISOString(),
      };
    }
  }
  return null;
}
function productForSlot(db,show,productIndex,now=Date.now()) {
  const ids=JSON.parse(show.product_ids||"[]");
  if(ids.length!==2)return null;
  return require("./oddTvChannel").productById(db,show,ids[productIndex],now);
}
function timeline() {
  return [
    {start:0,end:3,product:1,type:"welcome"},
    {start:3,end:8,product:1,type:"overview"},
    {start:8,end:12,product:1,type:"questions"},
    {start:12,end:17,product:1,type:"demo"},
    {start:17,end:21,product:1,type:"questions"},
    {start:21,end:26,product:1,type:"recap"},
    {start:26,end:29,product:1,type:"questions"},
    {start:29,end:30,product:1,type:"transition"},
    {start:30,end:33,product:2,type:"welcome"},
    {start:33,end:38,product:2,type:"overview"},
    {start:38,end:42,product:2,type:"questions"},
    {start:42,end:47,product:2,type:"demo"},
    {start:47,end:51,product:2,type:"questions"},
    {start:51,end:56,product:2,type:"recap"},
    {start:56,end:59,product:2,type:"questions"},
    {start:59,end:60,product:2,type:"close"},
  ];
}
module.exports={SHOW_MINUTES,PRODUCT_MINUTES,QUESTION_SLOTS_MINUTES,QUESTION_PREP_MINUTES,elapsedMinutes,productIndexForMinute,questionWindow,productForSlot,timeline};
