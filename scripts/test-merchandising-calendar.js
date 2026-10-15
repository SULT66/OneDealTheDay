const assert = require('node:assert/strict');
const { calendarSignals, activeHalloween } = require('../src/merchandisingCalendar');
const { marketTimezones } = require('../src/marketCalendar');

function signal(key, market = 'us', now = '2026-01-01T12:00:00Z', horizonDays = 365) {
  const value = calendarSignals({ market, now, horizonDays }).find(s => s.metadata.eventKey === key);
  assert.ok(value, `${market} ${key} missing`);
  return value;
}
function localDate(value, market) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: marketTimezones[market] }).format(new Date(value));
}
assert.equal(localDate(signal('thanksgiving').eventAt, 'us'), '2026-11-26');
assert.equal(localDate(signal('thanksgiving', 'ca').eventAt, 'ca'), '2026-10-12');
assert.equal(localDate(signal('black-friday').eventAt, 'us'), '2026-11-27');
assert.equal(localDate(signal('cyber-monday').eventAt, 'us'), '2026-11-30');
assert.equal(localDate(signal('easter').eventAt, 'us'), '2026-04-05');
assert.equal(localDate(signal('easter', 'uk', '2027-01-01T12:00:00Z').eventAt, 'uk'), '2027-03-28');
assert.equal(localDate(signal('mothers-day', 'uk').eventAt, 'uk'), '2026-03-15');
assert.equal(localDate(signal('mothers-day', 'us').eventAt, 'us'), '2026-05-10');
assert.equal(localDate(signal('mothers-day', 'de').eventAt, 'de'), '2026-05-10');
assert.equal(localDate(signal('mothers-day', 'fr').eventAt, 'fr'), '2026-05-31');
// Pentecost on May's last Sunday moves France's celebration to June.
assert.equal(localDate(signal('mothers-day', 'fr', '2023-01-01T12:00:00Z').eventAt, 'fr'), '2023-06-04');
const halloween = signal('halloween', 'us', '2026-10-13T17:00:00Z', 90);
assert.equal(localDate(halloween.endsAt, 'us'), '2026-10-24');
assert.ok(!calendarSignals({ now: halloween.endsAt }).some(s => s.id === halloween.id), 'exclusive expiry');
const christmas = signal('christmas', 'us', '2026-10-13T17:00:00Z', 90);
assert.equal(localDate(christmas.preparationAt, 'us'), '2026-10-30');
assert.equal(localDate(christmas.startsAt, 'us'), '2026-11-01');
assert.equal(christmas.startsAt, '2026-11-01T04:00:00.000Z'); // before DST fallback
assert.equal(christmas.endsAt, '2026-12-15T05:00:00.000Z'); // after fallback
assert.ok(Date.parse(christmas.startsAt) > Date.parse('2026-10-13T17:00:00Z'), 'future brief retained');
assert.equal(localDate(signal('new-year', 'us', '2026-12-31T23:00:00Z', 90).eventAt, 'us'), '2027-01-01');
assert.ok(!calendarSignals({ market: 'uk' }).some(s => s.metadata.eventKey === 'thanksgiving'));
for (const market of Object.keys(marketTimezones)) {
  const values = calendarSignals({ market, now: '2026-10-13T17:00:00Z' });
  assert.equal(new Set(values.map(s => s.id)).size, values.length);
  for (const s of values) {
    assert.equal(s.confidence, 'planning');
    assert.ok(s.queries.length > 0);
    assert.ok(Date.parse(s.preparationAt) <= Date.parse(s.startsAt));
    assert.ok(Date.parse(s.startsAt) < Date.parse(s.endsAt));
    assert.ok(Date.parse(s.endsAt) > Date.parse('2026-10-13T17:00:00Z'));
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: marketTimezones[market], hour: 'numeric', hourCycle: 'h23' }).format(new Date(s.eventAt));
    assert.equal(Number(hour), 0);
  }
}
assert.throws(() => calendarSignals({ market: 'mx' }), RangeError);
assert.throws(() => calendarSignals({ now: 'invalid' }), RangeError);
assert.throws(() => calendarSignals({ horizonDays: -1 }), RangeError);
assert.throws(() => calendarSignals({ horizonDays: 731 }), RangeError);
console.log('Merchandising calendar tests passed');

assert(activeHalloween({market:'us',now:Date.parse('2026-10-15T04:00:00Z')}),'Halloween activity must not depend on catalogue fetches');
assert(!activeHalloween({market:'us',now:Date.parse('2026-10-24T04:00:00Z')}),'Calendar still enforces the exclusive buying cutoff');
