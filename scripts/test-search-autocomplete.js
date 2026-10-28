const assert=require('node:assert/strict');
const {buildSuggestIndex}=require('../src/searchSuggest');
const {autocompleteVocabulary,autocompleteTerms,autocompleteSelection}=require('../src/searchAutocomplete');
const {searchCard}=require('../src/searchCard');
const rows=[
  {title:'Wireless Bluetooth Headphones Black',category:'Electronics'},
  {title:'Wireless Bluetooth Headphones Blue',category:'Electronics'},
  {title:'Anker USB C Hub Adapter',category:'Electronics'},
  {title:'UGREEN USB C Hub Adapter',category:'Electronics'},
];
const vocabulary=autocompleteVocabulary(buildSuggestIndex(rows));
assert(autocompleteTerms(vocabulary,'head').some(x=>x.term==='headphones'),'Broad feed departments must not hide product-name completions');
assert(autocompleteTerms(vocabulary,'h').some(x=>x.term==='headphones'),'One letter is cheap when matching a local vocabulary');
assert(autocompleteTerms(vocabulary,'usb c').some(x=>x.term==='usb c hub'));
assert.deepEqual(autocompleteTerms(vocabulary,'zzzz'),[]);
assert.deepEqual(autocompleteTerms(vocabulary,''),[]);
assert(autocompleteTerms(vocabulary,'wire',2).length<=2);
assert(!vocabulary.some(x=>x.term==='electronics'));
const terms=[{term:'coffee maker',count:2},{term:'office chair',count:4}];
assert.equal(autocompleteTerms(terms,'cóff')[0].term,'coffee maker');
assert.deepEqual(autocompleteTerms(terms,'offi').map(x=>x.term),['office chair']);
assert.equal(autocompleteSelection(-1,1,3),0);
assert.equal(autocompleteSelection(-1,-1,3),2);
assert.equal(autocompleteSelection(2,1,3),0);
assert.equal(autocompleteSelection(0,-1,3),2);
assert.equal(autocompleteSelection(0,1,0),-1);
const compact=searchCard({id:1,title:'Headphones',current_price:20,display_score:85,checked_at:'2026-10-22',description:'x'.repeat(100000),score_breakdown:{internal:'large'}});
assert.equal(compact.current_price,20);assert.equal(compact.display_score,85);assert.equal(compact.checked_at,'2026-10-22');
assert(!('description' in compact));assert(!('score_breakdown' in compact));
console.log('Search autocomplete: product nouns, prefixes, keyboard selection and compact search cards passed.');
