const assert = require('node:assert/strict');
const {packCount,quantityDetails,focusedPackComparison} = require('../src/packComparison');
const {canonicalCategory,TAXONOMY_VERSION} = require('../src/catalogTaxonomy');
const {diverseSeasonalProducts,matchesHalloweenQuery} = require('../src/seasonalProductTypes');
const {focusProductPhrase} = require('../src/shoppingAssistant');

for(const [title,count] of [['2-Pack Bed Pillows',2],['Pillows, pack of 2',2],['1 pillow',1],['Pair of pillows',2],['Pillow Queen 20 x 28',null],['Mainstays Pillow, Single',1],['Single Serve Coffee Machine',null],['Pillow 1.5 inches',null],['Pillow 1.5-pack',null],['Pillow 0-pack',null]]) assert.equal(packCount(title),count,title);
assert.equal(quantityDetails({title:'Pillows 2-Pack',price_value:5.84,currency:'USD'}).unit_price_value,2.92);
assert.equal(quantityDetails({title:'Pillow',price_value:3.44,currency:'USD'}).unit_price_value,null,'Unknown quantity is not one');
assert.equal(quantityDetails({title:'Pillows 2-Pack',price_value:null,currency:'USD'}).unit_price_value,null);
assert.match(focusProductPhrase({title:'Mainstays Pillow Standard Queen Comfortable Bed Soft Support White Set (2-Pack)'}),/2-pack/i,'Search phrase must retain the count hidden in parentheses');
const original={catalog_product_id:438496,title:'Mainstays Bed Pillows 2-Pack',price_value:5.84,currency:'USD',retailer:'Walmart',url:'/us/deal/438496'};
const single={catalog_product_id:null,title:'Mainstays 1 Pillow',price_value:3.44,currency:'USD',retailer:'Walmart',url:'https://www.walmart.com/ip/pillow/1234',position_role:'lowest_price',lowest_price:true};
const raw={scope:'shopping',message:'Nothing matched exactly. The single pillow is cheaper.',message_source:'delia',result_state:'closest_alternatives',recommendations:[single,{...original,position_role:'best_overall'}],comparison:[{title:single.title}],comparison_notes:['Cheaper'],follow_up:'Buy the cheaper one?'};
const fixed=focusedPackComparison(raw,original,'Is this a good price?');
assert.equal(fixed.recommendations.length,2);
assert.equal(fixed.recommendations[0].catalog_product_id,438496);
assert.equal(fixed.recommendations[0].unit_price_value,2.92);
assert.match(fixed.recommendations[0].quantity_label,/\$2.92 per item/);
assert.equal(fixed.recommendations[1].unit_price_value,3.44);
assert.match(fixed.recommendations[1].note,/Different pack size/);
assert.equal(fixed.recommendations[1].lowest_price,false);
assert.equal(fixed.result_state,'exact_matches');
assert(!fixed.message.includes('Nothing matched exactly'));
assert.equal(fixed.comparison.length,0,'Do not retain the model’s incompatible comparison');
const unknown=focusedPackComparison({...raw,recommendations:[{...single,title:'Mainstays Pillow'}]},original,'Compare this price');
assert.match(unknown.recommendations[1].note,/unconfirmed/);
assert.equal(unknown.recommendations[1].unit_price_value,null);
assert.equal(focusedPackComparison(raw,original,'Find me a laptop'),raw,'Product context must not hijack unrelated requests');
assert.equal(focusedPackComparison({...raw,turn_kind:'discussion'},original,'Compare this price').turn_kind,'discussion');
for(const language of ['es','fr','de']) assert.notEqual(focusedPackComparison(raw,original,'price',language).message,fixed.message);

for(const [title,category] of [
  ['HALLOWEEN II Movie Poster RARE TV Ad Horror','Halloween'],
  ['Animated Skeleton Dog Halloween Decoration','Halloween'],
  ['Halloween Dog Costume Vampire Cape','Halloween'],
  ['Halloween Michael Myers Costume Mask','Halloween'],
  ['Dog Chew Toy Halloween Pumpkin','Halloween'],
  ['Samsung OLED TV 55 inch','Electronics'],
  ['Dog Automatic Feeder','Pet Supplies'],
]) assert.equal(canonicalCategory({title,source:'ebay',category:'electronics',taxonomy_version:'old'}),category,title);
assert.notEqual(TAXONOMY_VERSION,'catalog-taxonomy-v10','Existing stored listings must be recategorized');
for (const source of ['ebay','aliexpress','feed-giftlab','feed-silver-brush','feed-mooncool','newegg']) {
  assert.equal(canonicalCategory({title:'Halloween LED Pumpkin Lights',source,category:'Electronics',normalized_category:'Home & Kitchen',taxonomy_version:'catalog-taxonomy-v10'}),'Halloween');
}
for (const [title,expected] of [
  ['Spooky Ghost Hanging Decoration','Halloween'],
  ['Jack-O-Lantern String Lights','Halloween'],
  ['Animated Skeleton Dog Decoration','Halloween'],
  ['Pumpkin Soup Kitchen Bowl','Home & Kitchen'],
  ['Medical Anatomical Skeleton Teaching Model','Other Deals'],
  ['Protective Face Mask','Other Deals'],
  ['Party Balloons','Home & Kitchen'],
]) assert.equal(canonicalCategory({title,source:'ebay',category:''}),expected,title);
assert.notEqual(canonicalCategory({title:'Samsung OLED Television',source:'ebay',category:'Halloween decorations'}),'Halloween','Search keywords cannot turn an unrelated product into Halloween');
const rows=[...Array.from({length:30},(_,i)=>({id:i,title:'Halloween Movie Poster TV Ad '+i})),{id:30,title:'Halloween Costume Mask'},{id:31,title:'Halloween Animated Skeleton Dog Decoration'},{id:32,title:'Halloween Party Balloons'}];
const diverse=diverseSeasonalProducts(rows);
assert.deepEqual(diverse.slice(0,4).map(row=>row.id),[0,30,31,32]);
assert.equal(new Set(diverse.map(row=>row.id)).size,rows.length,'Diversity must not remove products');
assert(matchesHalloweenQuery(rows[31],'decor'));
assert(!matchesHalloweenQuery(rows[0],'costume'));
assert(matchesHalloweenQuery(rows[32],'party'));
assert(matchesHalloweenQuery(rows[0],'movie poster'));
console.log('Audit 14–16: explicit pack quantities, original-first comparisons, honest unit prices, seasonal product types and diverse collections passed.');
