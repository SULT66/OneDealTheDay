// Product nouns outrank incidental words: a TV poster is not a television,
// and an animated skeleton dog is decor rather than equipment for a pet.
function seasonalProductType(value) {
  const title = String(value || "").toLowerCase();
  if (/\bposters?\b/.test(title) && !/\bposter boards?\b/.test(title)) return "posters";
  if (/\b(?:dog|cat|pet)\b.{0,45}\b(?:costume|outfit)\b|\b(?:costume|outfit)\b.{0,45}\b(?:for dogs?|for cats?|for pets?)\b/.test(title)) return "pet-costumes";
  if (/\b(?:costumes?|cosplay|masks?|wigs?)\b/.test(title)) return "costumes";
  if (/\b(?:party supplies|party favors?|balloons?|tableware|paper plates?|napkins?)\b/.test(title)) return "party";
  if (/\b(?:halloween|spooky|haunted)\b/.test(title) && /\b(?:decorations?|decor|props?|animatronics?|animated|skeletons?|inflatables?)\b/.test(title)) return "decor";
  return "other";
}

function seasonalProductCategory(title) {
  const type = seasonalProductType(title);
  if (type === "posters" || type === "decor" || type === "party") return "Home & Kitchen";
  if (type === "pet-costumes") return "Pet Supplies";
  // Halloween masks are wearable costumes; ordinary protective masks are not.
  if (type === "costumes" && /\b(?:halloween|cosplay|costumes?)\b/i.test(title)) return "Fashion";
  return "";
}

function matchesHalloweenQuery(row, query) {
  const q = String(query || "").trim().toLowerCase();
  const type = seasonalProductType(row.title);
  if (q === "costume") return type === "costumes" || type === "pet-costumes";
  if (q === "decor") return type === "decor" || type === "posters";
  if (q === "party") return type === "party";
  return q.split(/\s+/).filter(Boolean).every(term => String(row.title || "").toLowerCase().includes(term));
}

// Interleave types without discarding listings. Within a type retain the
// evidence ranking. Explicit price sorts and sales-backed previews stay pure.
function diverseSeasonalProducts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = seasonalProductType(row.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (let index = 0; result.length < rows.length; index++) {
    for (const group of groups.values()) if (group[index]) result.push(group[index]);
  }
  return result;
}
module.exports = {seasonalProductType, seasonalProductCategory, matchesHalloweenQuery, diverseSeasonalProducts};
