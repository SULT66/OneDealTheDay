// A small serializable vocabulary, shared by the API and the browser. No
// product ranking, prices or descriptions are needed while someone types.
function fold(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function autocompleteVocabulary(index) {
  const terms = new Map();
  for (const [term,count] of [...index.keywords, ...index.titles]) {
    if (/^(?:electronics|home kitchen|health beauty|fashion|other deals|gifts|toys games|sports outdoors|tools diy)$/.test(term)) continue;
    if (term.length > 70) continue;
    terms.set(term, Math.max(terms.get(term)||0,count));
  }
  return [...terms].map(([term,count])=>({term,count})).sort((a,b)=>b.count-a.count||a.term.localeCompare(b.term));
}
function autocompleteTerms(vocabulary, query, limit=8) {
  const typed=fold(query);
  if (!typed) return [];
  return vocabulary.filter(item=>item.term!==typed&&(item.term.startsWith(typed)||item.term.includes(` ${typed}`)))
    .sort((a,b)=>Number(b.term.startsWith(typed))-Number(a.term.startsWith(typed))||b.count-a.count||a.term.length-b.term.length||a.term.localeCompare(b.term))
    .slice(0,limit);
}
function autocompleteSelection(current,direction,count) {
  if (!count) return -1;
  if (current < 0) return direction < 0 ? count-1 : 0;
  return (current+direction+count)%count;
}
module.exports={autocompleteVocabulary,autocompleteTerms,autocompleteSelection};
