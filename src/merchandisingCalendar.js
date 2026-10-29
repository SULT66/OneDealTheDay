const { marketTimezones } = require('./marketCalendar');

// Dates are factual calendar rules; queries and campaign windows are editorial
// planning hypotheses, never evidence of sales or merchant promotions.
const DAY = 86400000;
const SOURCES = {
  us: 'https://www.opm.gov/policy-data-oversight/pay-leave/pay-administration/fact-sheets/holidays-work-schedules-and-pay/',
  ca: 'https://www.canada.ca/en/library-archives/services/public/visit/holiday-closures.html',
  uk: 'https://www.gov.uk/bank-holidays',
  easter: 'https://www.churchofengland.org/prayer-and-worship/worship-texts-and-resources/common-worship/churchs-year/calendar',
  mothersUs: 'https://www.govinfo.gov/content/pkg/USCODE-2024-title36/html/USCODE-2024-title36-subtitleI-partA-chap1-sec117.htm',
  mothersCa: 'https://www.canada.ca/en/news/archive/2013/05/statement-ministers-mackay-findlay-mother-day.html',
  mothersUk: 'https://www.churchofengland.org/media/stories-and-features/mothering-sunday-what-are-its-origins-church',
  mothersFr: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006178331/',
  mothersDe: 'https://www.blume2000.de/anlaesse/muttertag',
  retail: 'https://nrf.com/media-center/press-releases/197-million-consumers-shop-over-thanksgiving-holiday-weekend'
};
const date = (year, month, day) => Date.UTC(year, month - 1, day);
const shift = (value, days) => value + days * DAY;
function nthWeekday(year, month, weekday, n) {
  const first = date(year, month, 1);
  return shift(first, (weekday - new Date(first).getUTCDay() + 7) % 7 + (n - 1) * 7);
}
function lastWeekday(year, month, weekday) {
  const last = date(year, month + 1, 0);
  return shift(last, -((new Date(last).getUTCDay() - weekday + 7) % 7));
}
// Gregorian computus (Western Easter), not Orthodox Easter.
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), total = h + l - 7 * m + 114;
  return date(year, Math.floor(total / 31), total % 31 + 1);
}
const formatters = new Map();
function localParts(value, timezone) {
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }));
  return Object.fromEntries(formatters.get(timezone).formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
// Convert a synthetic UTC date to midnight in the market timezone, including
// DST. Calendar-day shifts happen before conversion, not in 24-hour UTC steps.
function midnight(value, timezone) {
  let candidate = value;
  for (let n = 0; n < 3; n++) {
    const p = localParts(candidate, timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    candidate += value - represented;
  }
  return new Date(candidate).toISOString();
}

function yearlyEvents(year, market) {
  const entries = [];
  const add = (id, title, event, queries, options = {}) => entries.push({ id, title, event, queries, ...options });
  const gifts = ['necklace', 'perfume', 'watch', 'gift set'];
  const tech = ['laptop', 'headphones', 'monitor', 'robot vacuum', 'air fryer'];
  add('new-year', 'New year fitness and organisation', date(year, 1, 1), ['yoga mat', 'dumbbell', 'storage organizer', 'planner'], { start: -7, end: 22, sources: [market === 'us' ? SOURCES.us : market === 'ca' ? SOURCES.ca : SOURCES.uk] });
  add('valentines-day', "Valentine's Day", date(year, 2, 14), gifts, { start: -28, delivery: 7 });
  const easterDay = easter(year);
  add('easter', 'Easter', easterDay, ['Easter decoration', 'Easter basket', 'baking mold', 'craft kit'], { start: -28, delivery: 7, sources: [SOURCES.easter] });
  let mothers = nthWeekday(year, 5, 0, 2);
  let motherSource = market === 'ca' ? SOURCES.mothersCa : market === 'de' ? SOURCES.mothersDe : SOURCES.mothersUs;
  if (market === 'uk') { mothers = shift(easterDay, -21); motherSource = SOURCES.mothersUk; }
  if (market === 'fr') {
    mothers = lastWeekday(year, 5, 0);
    if (mothers === shift(easterDay, 49)) mothers = nthWeekday(year, 6, 0, 1);
    motherSource = SOURCES.mothersFr;
  }
  add('mothers-day', market === 'uk' ? 'Mothering Sunday' : "Mother's Day", mothers, gifts, { start: -28, delivery: 7, sources: [motherSource] });
  add('summer-outdoors', 'Summer outdoors', date(year, 6, 1), ['camping tent', 'cooler', 'outdoor chair', 'sunscreen', 'luggage'], { start: -21, end: 92 });
  add('back-to-school', 'Back to school preparation', date(year, 9, 1), ['backpack', 'laptop', 'pencil case', 'notebook', 'desk lamp'], { start: -45, end: 1, delivery: 7, note: 'Planning anchor only; school opening dates vary locally.' });
  add('halloween', 'Halloween', date(year, 10, 31), ['Halloween costume', 'Halloween decoration', 'Halloween party supplies', 'Halloween inflatable', 'Halloween lights', 'Halloween animatronic', 'Halloween mask', 'Halloween poster', 'Halloween decor'], { start: -35, delivery: 7 });
  add('winter-home', 'Winter home preparation', date(year, 11, 1), ['blanket', 'duvet', 'humidifier', 'winter coat'], { start: -21, end: 120 });
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  if (market === 'us' || market === 'ca') {
    add('thanksgiving', 'Thanksgiving hosting', market === 'us' ? thanksgiving : nthWeekday(year, 10, 1, 2), ['roasting pan', 'dinnerware', 'tablecloth', 'food thermometer', 'serving tray', 'pumpkin decor', 'baking dish', 'carving knife'], { start: -28, delivery: 7, sources: [SOURCES[market]] });
  }
  add('black-friday', 'Black Friday', shift(thanksgiving, 1), tech, { start: -14, end: 3, preparation: 56, sources: [SOURCES.us, SOURCES.retail] });
  add('cyber-monday', 'Cyber Monday', shift(thanksgiving, 4), ['laptop', 'headphones', 'SSD', 'keyboard', 'router'], { start: -3, end: 1, preparation: 56, sources: [SOURCES.us, SOURCES.retail] });
  add('christmas', 'Christmas gifts and decorations', date(year, 12, 25), ['Christmas tree', 'Christmas lights', 'Christmas ornaments', 'Christmas wreath', 'advent calendar', 'Christmas gift set', 'New Year party decorations', 'Christmas garland'], { start: -58, delivery: 10, preparation: 58, sources: [market === 'us' ? SOURCES.us : market === 'ca' ? SOURCES.ca : SOURCES.uk] });
  if (market === 'ca' || market === 'uk') add('boxing-day', 'Boxing Day', date(year, 12, 26), tech, { start: 0, end: 7, sources: [SOURCES[market]] });
  if (market === 'us') {
    add('memorial-day', 'Memorial Day weekend', lastWeekday(year, 5, 1), ['outdoor chair', 'grill', 'mattress', 'patio furniture'], { start: -14, end: 1, sources: [SOURCES.us] });
    add('independence-day', 'Independence Day', date(year, 7, 4), ['grill', 'cooler', 'outdoor chair', 'party supplies'], { start: -21, delivery: 7, sources: [SOURCES.us] });
    add('labor-day', 'Labor Day weekend', nthWeekday(year, 9, 1, 1), ['mattress', 'desk', 'outdoor chair', 'laptop'], { start: -14, end: 1, sources: [SOURCES.us] });
  }
  return entries;
}

/*
 * includePastCutoff keeps a window that has passed its delivery cutoff but not
 * its date. Selling and talking are different jobs: a Halloween order placed on
 * the 29th cannot arrive, so the buying window shuts on the 24th, but the site
 * still has something to say about Halloween until Halloween. Callers that sell
 * leave this off and see the cutoff they had before.
 */
function calendarSignals({ market = 'us', now = Date.now(), horizonDays = 90, includePastCutoff = false } = {}) {
  const code = String(market).toLowerCase();
  if (!marketTimezones[code]) throw new RangeError('Unsupported merchandising market');
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid calendar time');
  const horizon = Number(horizonDays);
  if (!Number.isFinite(horizon) || horizon < 0 || horizon > 730) throw new RangeError('horizonDays must be between 0 and 730');
  const timezone = marketTimezones[code];
  const current = localParts(timestamp, timezone);
  const horizonEnd = Date.parse(midnight(shift(date(current.year, current.month, current.day), Math.ceil(horizon) + 1), timezone));
  const results = [];
  // Include prior year's cross-year windows (winter/New Year preparation).
  for (let year = current.year - 1; year <= current.year + Math.ceil(horizon / 365) + 1; year++) {
    for (const entry of yearlyEvents(year, code)) {
      const starts = shift(entry.event, entry.start ?? -21);
      const ends = shift(entry.event, entry.delivery ? -entry.delivery : (entry.end ?? 1));
      const preparation = shift(entry.event, -Math.max(entry.preparation ?? 42, -(entry.start ?? -21)));
      const signal = {
        id: `${code}-${entry.id}-${year}`, kind: 'seasonal', title: entry.title, market: code,
        queries: entry.queries.slice(), categories: [], confidence: 'planning',
        preparationAt: midnight(preparation, timezone), startsAt: midnight(starts, timezone),
        endsAt: midnight(ends, timezone), eventAt: midnight(entry.event, timezone),
        sourceUrls: (entry.sources || []).slice(),
        metadata: { queryBasis: 'editorial suggestions; not proven sales', windowBasis: 'editorial planning',
          ...(entry.id === 'halloween' && code === 'us' ? {minimumEbaySales:100} : {}),
          timezone, eventKey: entry.id, deliveryLeadDays: entry.delivery || 0,
          deliveryGuidance: entry.delivery ? 'Conservative campaign cutoff; verify each merchant delivery estimate before promising arrival.' : 'No arrival promise; validate availability and delivery.',
          ...(entry.note ? { note: entry.note } : {}) }
      };
      // Future briefs may be prepared now; storefront must separately enforce
      // startsAt <= now < endsAt. Ends are exclusive.
      const closes = includePastCutoff
        ? Math.max(Date.parse(signal.endsAt), Date.parse(signal.eventAt) + DAY)
        : Date.parse(signal.endsAt);
      if (closes > timestamp && Date.parse(signal.preparationAt) < horizonEnd) results.push(signal);
    }
  }
  return results.sort((a, b) => a.eventAt.localeCompare(b.eventAt) || a.id.localeCompare(b.id));
}

function activeHalloween({market = 'us', now = Date.now()} = {}) {
  return calendarSignals({market,now,horizonDays:0}).find(signal =>
    signal.metadata.eventKey === 'halloween' && Date.parse(signal.startsAt) <= now && now < Date.parse(signal.endsAt));
}

/*
 * A campaign the storefront may speak about, by its own clock.
 *
 * activeHalloween answers the selling question: is the window open in which a
 * purchase can still arrive in time. That window shuts a week before the day.
 *
 * Two other questions are worth asking, and each is a flag here.
 *
 * fromPreparation opens a campaign at its preparation date rather than its
 * sale date. Black Friday is the case that needs it: the thing worth saying
 * starts eight weeks early, because recording prices for eight weeks is the
 * only way to know on the day which of them actually fell.
 *
 * throughEvent keeps a campaign open until the date itself, past the delivery
 * cutoff. The returned signal then carries pastDeliveryCutoff, so a caller can
 * keep talking about Halloween on the 29th without implying that anything
 * ordered that evening will be at the door by the 31st.
 */
function activeCampaign({ eventKey = '', market = 'us', now = Date.now(), fromPreparation = false, throughEvent = false } = {}) {
  if (!eventKey) return null;
  const signal = calendarSignals({ market, now, horizonDays: 120, includePastCutoff: throughEvent })
    .find(entry => entry.metadata.eventKey === eventKey);
  if (!signal) return null;
  const opens = Date.parse(fromPreparation && signal.preparationAt ? signal.preparationAt : signal.startsAt);
  const cutoff = Date.parse(signal.endsAt);
  const closes = throughEvent ? Math.max(cutoff, Date.parse(signal.eventAt) + DAY) : cutoff;
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return null;
  if (!(opens <= now && now < closes)) return null;
  return { ...signal, pastDeliveryCutoff: now >= cutoff };
}

module.exports = { calendarSignals, activeHalloween, activeCampaign };
