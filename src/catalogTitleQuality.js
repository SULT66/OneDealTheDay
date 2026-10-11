function hasDescriptiveTitle(value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title) return false;
  if (/\b(?:shipping protection|shipping insurance|shipping fee|remote area surcharge|make up the difference|custom payment|price difference link|not a product sale)\b/i.test(title)) return false;
  return !/^(?:closeout|clearance|sale|special|product|item|test|placeholder)(?:\s*[-:–]\s*|\s+)?(?:[$£€]?\s*\d+(?:[.,]\d+)?(?:\s*(?:USD|GBP|EUR))?)?$/i.test(title);
}
module.exports = { hasDescriptiveTitle };
