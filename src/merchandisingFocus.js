const { calendarSignals } = require('./merchandisingCalendar');
const evergreen = new Set(['winter-home', 'summer-outdoors']);
// Automatic regional campaigns expire with their existing buying/delivery window.
// Explicit event keys remain an editorial override; "all" disables priority.
function merchandisingFocus({market = 'us', now = Date.now()} = {}) {
  const value = String(process.env.MERCHANDISING_FOCUS ?? 'auto').trim().toLowerCase();
  if (!value || value === 'all') return null;
  if (value !== 'auto') return value;
  const active = calendarSignals({market, now, horizonDays:0}).filter(signal =>
    Date.parse(signal.startsAt) <= now && now < Date.parse(signal.endsAt) &&
    signal.metadata?.eventKey && !evergreen.has(signal.metadata.eventKey));
  // A live sale may extend beyond its event day. Prefer the next upcoming
  // campaign over a sale whose event day has already passed.
  active.sort((a,b) => Number(Date.parse(a.eventAt) < now) - Number(Date.parse(b.eventAt) < now) ||
    Date.parse(a.eventAt) - Date.parse(b.eventAt) || a.id.localeCompare(b.id));
  return active[0]?.metadata.eventKey || null;
}
function focusSignals(signals, focus = merchandisingFocus()) {
  return focus ? signals.filter(signal => signal.kind === 'seasonal' && signal.metadata?.eventKey === focus) : signals;
}
module.exports = { merchandisingFocus, focusSignals };
