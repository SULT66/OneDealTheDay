const DAY_MS = 86400000;

function validObservations(rows, now = Date.now()) {
  return (rows || [])
    .map(row => ({
      ...row,
      price: Number(row.price),
      timestamp: new Date(row.observed_at).getTime()
    }))
    .filter(row => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.timestamp) && row.timestamp <= now)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function windowStats(rows, days, now = Date.now()) {
  const observations = validObservations(rows, now)
    .filter(row => row.timestamp >= now - days * DAY_MS);
  const distinctDays = new Set(observations.map(row => new Date(row.timestamp).toISOString().slice(0, 10))).size;
  const first = observations[0]?.timestamp;
  const last = observations[observations.length - 1]?.timestamp;
  const coverageDays = first == null || last == null ? 0 : Math.max(0, (last - first) / DAY_MS);
  const prices = observations.map(row => row.price);
  return {
    days,
    observationCount: observations.length,
    distinctDays,
    coverageDays,
    sufficient: observations.length >= 2 && distinctDays >= 2,
    average: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null
  };
}

function priceIntelligence(rows, now = Date.now()) {
  const observations = validObservations(rows, now);
  return {
    observations,
    allTime: windowStats(observations, 36500, now),
    day30: windowStats(observations, 30, now),
    day90: windowStats(observations, 90, now)
  };
}

function shouldRecordObservation(previous, currentPrice, currency, observedAt = new Date()) {
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!previous) return true;
  if (Number(previous.price) !== price) return true;
  if (String(previous.currency || "").toUpperCase() !== String(currency || "").toUpperCase()) return true;
  const previousDay = String(previous.observed_at || "").slice(0, 10);
  const currentDay = new Date(observedAt).toISOString().slice(0, 10);
  return previousDay !== currentDay;
}

exports.priceIntelligence = priceIntelligence;
exports.shouldRecordObservation = shouldRecordObservation;
