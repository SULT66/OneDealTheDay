"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {productForHost, preparePreviewTurn} = require("../src/oddLiveProducer");
const now=Date.parse("2026-11-10T20:00:00Z");
const drop={drop_key:"test",market:"us",title:"Demo Kettle",brand:"Example",retailer_name:"Demo Store",currency:"USD",drop_price:24.99,retail_price:39.99,quantity_total:0,quantity_remaining:0,start_at:"2026-11-10T19:00:00Z",end_at:"2026-11-10T21:00:00Z"};
test("only live drop facts become speech input",()=>{const x=productForHost(drop,now);assert.equal(x.title,"Demo Kettle");assert.equal(x.price,24.99);assert.equal(x.stock_status,"unknown")});
test("future drop cannot leak price",()=>assert.throws(()=>productForHost({...drop,start_at:"2026-11-11T19:00:00Z",end_at:"2026-11-11T20:00:00Z"},now),/DROP_NOT_LIVE/));
test("producer preview does not assert question answered",async()=>{const x=await preparePreviewTurn({drop,now,question:"Warranty?",generateText:async()=> "The listing does not confirm the warranty."});assert.equal(x.preview_only,true);assert.equal(x.spoken_text,"The listing does not confirm the warranty.");});
