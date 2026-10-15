const assert=require('node:assert/strict');
const cron=require('node-cron');
const schedule=require('../src/catalogSchedule');
// Legacy deployment overrides must not silently re-enable hourly updates.
process.env.REFRESH_CRON='* * * * *';
process.env.OFFER_CHECK_CRON='* * * * *';
process.env.SECONDARY_OFFER_CHECK_CRON='* * * * *';
const config=require('../src/config');
const RealDate=Date;
let now=RealDate.parse('2026-10-15T04:00:00Z'); // Midnight in New York.
global.Date=class extends RealDate {
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
};
function nextSlot(expressions,timezone){
  const tasks=expressions.map(expression=>cron.createTask(expression,()=>{},{timezone}));
  try {
    tasks.forEach(task=>task.start());
    return Math.min(...tasks.map(task=>task.getNextRun().getTime()));
  } finally {tasks.forEach(task=>task.destroy());}
}
try {
  for(const offerCron of [config.offerCheckCron,config.secondaryOfferCheckCron]) {
    now=RealDate.parse('2026-10-15T04:00:00Z');
    const slots=[];
    for(let i=0;i<5;i++){
      const next=nextSlot([config.refreshCron,offerCron],'America/New_York');
      slots.push(next);now=next+1000;
    }
    assert.equal(new RealDate(slots[0]).toISOString(),'2026-10-15T04:15:00.000Z');
    for(let i=1;i<slots.length;i++)assert.equal(slots[i]-slots[i-1],6*3600000,'Exactly six hours between automatic catalog slots');
  }
  now=RealDate.parse('2026-10-15T04:00:00Z');
  const first=nextSlot([config.merchandisingCron],'America/New_York');now=first+1000;
  assert.equal(nextSlot([config.merchandisingCron],'America/New_York')-first,6*3600000,'Selection is not rebuilt hourly');
} finally {global.Date=RealDate;}
const stamp=RealDate.parse('2026-10-15T12:00:00Z');
assert(schedule.startupSelectionDue(undefined,stamp),'New installation can initialize its shelves');
assert(!schedule.startupSelectionDue(stamp-3600000,stamp),'Restart cannot add an hourly rebuild');
assert(!schedule.startupSelectionDue(stamp-6*3600000+1,stamp));
assert(schedule.startupSelectionDue(stamp-6*3600000,stamp));
const workflow=require('node:fs').readFileSync(require('node:path').join(__dirname,'../.github/workflows/daily-refresh.yml'),'utf8');
assert(!/^\s+schedule:/m.test(workflow),'A second automatic workflow must not add off-cycle refreshes');
assert(/workflow_dispatch:/.test(workflow),'Explicit manual refresh remains available');
console.log('Catalog schedule: four six-hour slots, daily midnight selection, no hourly overrides or duplicate workflow, restart spacing passed');
