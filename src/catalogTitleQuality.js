function hasDescriptiveTitle(value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title) return false;
  return !/^(?:closeout|clearance|sale|special|product|item|test|placeholder)(?:\s*[-:–]\s*|\s+)?(?:[$£€]?\s*\d+(?:[.,]\d+)?(?:\s*(?:USD|GBP|EUR))?)?$/i.test(title);
}
module.exports = { hasDescriptiveTitle };
