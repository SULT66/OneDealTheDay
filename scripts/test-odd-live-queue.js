"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {createProducerLeases}=require("../src/oddLiveQueue");

test("only one turn per drop can be in flight",()=>{
 const l=createProducerLeases(), first=l.acquire(10,5);
 assert.ok(first);assert.equal(l.acquire(10,6),null);assert.equal(l.check(10,first.token).questionId,5);
 assert.equal(l.release(10,"wrong"),false);assert.equal(l.release(10,first.token),true);
 assert.equal(l.acquire(10,6).questionId,6);
});
test("expired lease allows recovery without losing a queued question",()=>{
 let time=0;const l=createProducerLeases({ttlMs:20,now:()=>time});
 const lease=l.acquire(1,9);time=21;
 assert.equal(l.check(1,lease.token),null);assert.ok(l.acquire(1,9));
});
test("different shows have independent leases",()=>{
 const l=createProducerLeases();assert.ok(l.acquire(1,1));assert.ok(l.acquire(2,1));
});
