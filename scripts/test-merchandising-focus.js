const assert = require('node:assert/strict');
const { merchandisingFocus, focusSignals } = require('../src/merchandisingFocus');
const { calendarSignals } = require('../src/merchandisingCalendar');
delete process.env.MERCHANDISING_FOCUS;
const focus = (date,market='us') => merchandisingFocus({market,now:Date.parse(date)});
assert.equal(focus('2026-10-14T12:00:00Z'),'halloween');
assert.equal(focus('2026-10-24T03:59:59Z'),'halloween');
assert.equal(focus('2026-10-24T04:00:00Z'),null,'Shipping cutoff releases the fixed holiday priority');
assert.equal(focus('2026-10-25T12:00:00Z'),null,'Evergreen winter does not monopolize the rotation');
assert.equal(focus('2026-10-30T12:00:00Z'),'thanksgiving');
assert.equal(focus('2026-11-20T12:00:00Z'),'black-friday');
assert.equal(focus('2026-11-28T12:00:00Z'),'cyber-monday');
assert.equal(focus('2026-12-02T12:00:00Z'),'christmas');
assert.equal(focus('2026-12-16T12:00:00Z'),null);
assert.equal(focus('2027-10-14T12:00:00Z'),'halloween','Priority repeats in following years');
assert.equal(focus('2026-09-30T12:00:00Z','us'),'halloween');
assert.equal(focus('2026-09-30T12:00:00Z','ca'),'thanksgiving','Regional holidays are not copied from the US');
const now=Date.parse('2026-10-14T12:00:00Z');
const signals=calendarSignals({market:'us',now});
assert.deepEqual(focusSignals(signals,merchandisingFocus({market:'us',now})).map(s=>s.metadata.eventKey),['halloween']);
assert.equal(focusSignals(signals,null).length,signals.length,'General rotation returns without deleting the calendar');
process.env.MERCHANDISING_FOCUS='all';
assert.equal(focus('2026-10-14T12:00:00Z'),null);
process.env.MERCHANDISING_FOCUS='halloween';
assert.equal(focus('2026-12-02T12:00:00Z'),'halloween','Manual override remains explicit');
console.log('Automatic campaign focus: regional boundaries, cutoffs, general rotation and yearly renewal passed');
// Exercise transitions against persisted signals, placements and discovery throttle.
delete process.env.MERCHANDISING_FOCUS;
const {DatabaseSync}=require('node:sqlite');
const Module=require('node:module'), originalLoad=Module._load;
let researchCalls=0,discoveryCalls=0;
Module._load=function(request,parent,...rest) {
  if(parent?.filename.endsWith('/src/merchandising.js')) {
    if(request==='./merchandisingTrends') return {
      internalTrendSignals:()=>[],researchTrendSignals:async({market,now})=>{researchCalls++;return {status:'success',signals:[{
        id:'normal-trend',market,kind:'trend',title:'Normal interest',queries:['headphones'],
        startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+86400000).toISOString()
      }]};}
    };
    if(request==='./merchandisingSelection') return {
      matchesQuery:()=>true,signalRejectionReasons:()=>[],merchandisingDiagnostics:()=>({}),
      isPromotionEligible:()=>true,selectMerchandise:(rows,signals)=>signals.map(signal=>({signal,products:rows}))
    };
    if(request==='./merchandisingSeeds') return {salesEvidence:()=>null};
  }
  return originalLoad.call(this,request,parent,...rest);
};
const {runMerchandising,getMerchandisingShelves,merchandisingStatus}=require('../src/merchandising');
Module._load=originalLoad;
const native=new DatabaseSync(':memory:');
native.exec("CREATE TABLE products(id INTEGER PRIMARY KEY, market TEXT, status TEXT, checked_at TEXT)");
const db={exec:sql=>native.exec(sql),prepare:sql=>native.prepare(sql)};
const before=Date.parse('2026-10-24T03:59:00Z'),after=Date.parse('2026-10-24T04:00:01Z');
native.prepare('INSERT INTO products VALUES(1,?,?,?)').run('us','published',new Date(before).toISOString());
const discover=async({keywords})=>{discoveryCalls++;return {status:'success',count:1};};
(async()=>{
  await runMerchandising(db,{now:before,research:true,discover});
  assert.equal(researchCalls,0,'Unrelated research is paused while Halloween is active');
  assert.equal(merchandisingStatus(db,{now:before}).focus,'halloween');
  assert(getMerchandisingShelves(db,{now:before}).every(s=>s.title==='Halloween'));
  assert.equal(getMerchandisingShelves(db,{now:after}).length,0,'Expired Halloween is hidden before the next job');
  native.prepare('UPDATE products SET checked_at=?').run(new Date(after).toISOString());
  await runMerchandising(db,{now:after,research:true,discover});
  assert.equal(researchCalls,1,'Normal daily research resumes without manual configuration');
  assert.equal(discoveryCalls,2,'Campaign cutoff allows a fresh pass despite the six-hour throttle');
  assert.equal(merchandisingStatus(db,{now:after}).focus,null);
  assert(getMerchandisingShelves(db,{now:after}).some(s=>s.title==='Normal interest'));
  const next=Date.parse('2026-10-30T12:00:00Z');
  native.prepare('UPDATE products SET checked_at=?').run(new Date(next).toISOString());
  await runMerchandising(db,{now:next,research:true,discover});
  assert.equal(merchandisingStatus(db,{now:next}).focus,'thanksgiving');
  assert(getMerchandisingShelves(db,{now:next}).every(s=>s.title==='Thanksgiving hosting'));
  assert.equal(researchCalls,1,'Next holiday pauses unrelated paid research again');
  assert.equal(discoveryCalls,3);
  native.close();
  console.log('Persisted campaign transitions: cutoff hiding, research recovery and next-event discovery passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
