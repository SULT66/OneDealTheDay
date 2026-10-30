const { uniqueProductsInOrder } = require("./publicCatalog");
const variants = new WeakMap();

// The raw market rows already live for one minute and are invalidated on
// refresh. Share ordered/deduplicated views across lists, navigation and facets
// instead of reading and normalizing the same catalogue three times per render.
function catalogSnapshot(rows, { category = "", ranking = true, unique = true, discovery = false } = {}) {
  let views = variants.get(rows);
  if (!views) { views = new Map(); variants.set(rows, views); }
  const key = JSON.stringify([category, ranking, unique, discovery]);
  if (views.has(key)) return views.get(key);
  const number = value => value == null ? -Infinity : Number(value);
  const selected = category ? rows.filter(p => p.normalized_category === category) : [...rows];
  selected.sort((a, b) =>
    (ranking ? number(b.ranking_score ?? b.score) - number(a.ranking_score ?? a.score) : 0) ||
    number(b.score) - number(a.score) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const distinct = unique ? uniqueProductsInOrder(selected) : selected;
  const result = discovery ? require("./discoveryRanking").discoveryOrder(distinct) : distinct;
  views.set(key, result);
  return result;
}
module.exports = { catalogSnapshot };
