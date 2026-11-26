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
test("a retry replays the same active request while a different worker stays blocked",async()=>{
 let time=0;const l=createProducerLeases({ttlMs:1000,now:()=>time});
 const lease=l.acquire("tv:61",[28],null,{activeTtlMs:120,requestId:"original"});
 const response=Promise.resolve({lease_token:lease.token,question_id:[28]});
 l.saveResponse("tv:61",lease.token,response);
 assert.equal(l.replayResponse("tv:61","other"),null);
 assert.equal(l.acquire("tv:61",[29]),null);
 assert.deepEqual(await l.replayResponse("tv:61","original"),{lease_token:lease.token,question_id:[28]});
 time=121;
 assert.equal(l.replayResponse("tv:61","original"),null);
 assert.equal(l.check("tv:61",lease.token),null);
 assert.ok(l.acquire("tv:61",[28]));
});
test("a queued clip keeps its acknowledgment valid beyond the active rendering window",()=>{
 let time=0;const l=createProducerLeases({ttlMs:1000,now:()=>time});
 const lease=l.acquire("tv:61",[28],null,{activeTtlMs:120,requestId:"first"});
 l.saveResponse("tv:61",lease.token,Promise.resolve({}));
 assert.equal(l.release("tv:61",lease.token,{keepForAck:true}),true);
 time=121;
 assert.equal(l.replayResponse("tv:61","first"),null);
 assert.equal(l.hasPendingQuestion("tv:61",28),true);
 assert.ok(l.check("tv:61",lease.token));
 assert.ok(l.acquire("tv:61",[29]));
 assert.equal(l.release("tv:61",lease.token),true);
 assert.equal(l.hasPendingQuestion("tv:61",28),false);
});
