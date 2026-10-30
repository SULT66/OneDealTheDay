const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function load(file, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = new Module(file);
  mod.require = (request) => (stubs[request] ? stubs[request] : require(request));
  mod._compile(outputText, `${file}.js`);
  return mod.exports;
}

const { chooseTopPicks } = load("lib/topPicks.ts", { "./types": {} });

const deal = (id, retailer, extra = {}) => ({id, retailer, title: `Useful travel item ${id}`,
  category: `category-${id}`, price: 30, image: 'https://example.com/a.jpg',
  priceIsCurrent: true, availability: 'In stock', score: null, ...extra});
const picked = chooseTopPicks([
  ...Array.from({length: 15}, (_, i) => deal(`ebay-${i}`, 'eBay', {score: 95})),
  ...Array.from({length: 6}, (_, i) => deal(`direct-${i}`, 'Direct store')),
  ...Array.from({length: 6}, (_, i) => deal(`other-${i}`, 'Other store')),
]);
assert.equal(picked.length, 12);
assert.ok(picked.some(p=>p.retailer==='Direct store' && p.score===null), 'missing reviews must not exclude a merchant');
for (const shop of ['eBay','Direct store','Other store']) assert.ok(picked.filter(p=>p.retailer===shop).length<=4);
assert.deepEqual(chooseTopPicks([deal('stale','Shop',{priceIsCurrent:false}),deal('sold','Shop',{availability:'Sold out'})]), []);
const variants = chooseTopPicks([
  deal('nano-teal','OutIn',{title:'Nano Portable Espresso Machine Teal'}),
  deal('nano-white','OutIn',{title:'Nano Portable Espresso Machine White'}),
  deal('container','Shop',{title:'Glass Food Storage Containers Set'}),
]);
assert.equal(variants.filter(p=>p.retailer==='OutIn').length,1);
console.log('Homepage recommendations include unscored shops, enforce diversity, reject stale offers and collapse product types.');
