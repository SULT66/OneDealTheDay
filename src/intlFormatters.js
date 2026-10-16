// Formatter construction is expensive ICU work. Reuse formatters, never their
// output: prices, freshness and dates still come from the current product.
const formatters = new Map();
function formatter(kind, locale, options) {
  const key = JSON.stringify([kind, locale, options]);
  if (formatters.has(key)) return formatters.get(key);
  const value = new Intl[kind](locale, options);
  if (formatters.size >= 128) formatters.delete(formatters.keys().next().value);
  formatters.set(key, value);
  return value;
}
module.exports = { formatter };
