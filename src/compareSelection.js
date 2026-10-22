const MAX_COMPARE_ITEMS = 3;
function restoreCompareItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  let category, currency;
  return value.filter(item => {
    if (!item || !/^\d+$/.test(String(item.id)) || typeof item.title !== "string" || typeof item.image !== "string" || typeof item.category !== "string" || typeof item.currency !== "string" || seen.has(String(item.id))) return false;
    if (seen.size && (item.category !== category || item.currency !== currency)) return false;
    category = item.category; currency = item.currency;
    seen.add(String(item.id));
    return true;
  }).slice(0, MAX_COMPARE_ITEMS).map(({id, title, image, category, currency}) => ({id:String(id), title, image, category, currency}));
}
function toggleCompareItem(items, item) {
  if (items.some(row => row.id === item.id)) return items.filter(row => row.id !== item.id);
  if (items.length >= MAX_COMPARE_ITEMS || (items[0] && (items[0].category !== item.category || items[0].currency !== item.currency))) return items;
  return restoreCompareItems([...items, item]);
}
module.exports = {MAX_COMPARE_ITEMS, restoreCompareItems, toggleCompareItem};
