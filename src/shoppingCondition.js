// Shared by mission extraction and the live provider path. Catalog refreshes
// keep their default new-only policy.
const NON_NEW = /\b(?:used|pre[- ]?owned|refurbished|renewed|open[- ]?box|second[- ]?hand)\b|б\s*\/?\s*у(?!\p{L})|подерж\p{L}*|поддержан\p{L}*|бывш\p{L}*\s+в\s+употреблен\p{L}*|восстановлен\p{L}*|\b(?:gebraucht|reconditionné|usado|reacondicionado)\b/iu;
const NEW = /\b(?:new|brand[- ]?new|neuf|nuevo|neu)\b|нов\p{L}*/iu;
function requestedCondition(value) {
  // Ignore negative clauses such as "new, do not show used products".
  const text = String(value || '').replace(/(?:do\s+not\s+show|don't\s+show|exclude|excluding|не\s+показывай(?:те)?|исключи(?:те)?)[^.!?;]*/giu, '');
  const nonNew = [...text.matchAll(new RegExp(NON_NEW.source, "giu"))].at(-1);
  const fresh = [...text.matchAll(new RegExp(NEW.source, "giu"))].at(-1);
  if (nonNew && (!fresh || nonNew.index > fresh.index)) return 'non_new';
  return fresh ? 'new' : '';
}
function matchesCondition(candidate, condition) {
  const evidence = `${candidate?.title || ''} ${candidate?.condition || ''}`;
  if (/\b(?:for parts|not working|untested)\b|на\s+запчасти|неисправ/iu.test(evidence)) return false;
  if (condition === 'non_new') return NON_NEW.test(evidence);
  return condition !== 'new' || !NON_NEW.test(evidence);
}
module.exports = { requestedCondition, matchesCondition };
