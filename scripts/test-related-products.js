const assert = require("assert");
const { relatedProducts } = require("../src/relatedProducts");
const p = (id, title, extra = {}) => ({id, title, normalized_category:"Electronics", market:"us", currency:"USD", status:"published", current_price:30, ...extra});
const cases = [
  ["Anker 7-in-1 USB C Hub MultiPort Adapter 4K 100W", "8 in 1 USB Hub Docking Station", "USB Rechargeable Cordless Tire Inflator"],
  ["Wireless Gaming Headphones", "Bluetooth Wireless Earbuds", "Wireless Mechanical Keyboard"],
  ["Lenovo Notebook Laptop with Backlit Keyboard", "Dell Laptop 16GB", "Laptop Cooling Pad with Backlit Fans"],
  ["High Back Executive Office Chair", "Mesh Office Chair", "High Back Folding Camping Chair"],
  ["Rustic Tree Bookshelf with Storage", "Wooden Bookcase", "Rustic Wooden Coffee Table"],
  ["Electric Coffee Machine", "Drip Coffee Maker", "Electric Exercise Machine"],
  ["Cordless Drill Driver", "DEWALT Power Drill", "Cordless Drill Replacement Battery"],
  ["Watercolor artist brush round", "Watercolor artist brush flat", "Watercolor Canvas Paper"],
  ["Waterproof Hiking Jacket", "Rain Jacket", "Waterproof Hiking Shoes"],
  ["Automatic Dog Feeder", "Steel Dog Feeder", "Automatic Dog Water Fountain"],
  ["Outdoor LED String Lights", "Outdoor Fairy Lights", "Outdoor LED Lighted Ghost Decoration"],
  ["Blue Queen Mattress", "Queen Foam Mattress", "Queen Mattress Protector Cover"],
];
for (const [title, wanted, unrelated] of cases) {
  const base = p(1, title, {brand:"Acme"});
  const results = relatedProducts(base, [p(3, unrelated, {brand:"Acme", score:99}), p(2, wanted)]);
  assert.deepStrictEqual(results.map(x => x.id), [2], title);
  assert.deepStrictEqual(relatedProducts(base, [p(3, unrelated)]), [], `${title}: do not fill an empty shelf with unrelated goods`);
}
const base = p(1, "USB C Hub", {brand:"Anker"});
const hub = p(2, "USB C Hub", {brand:"Other"});
assert.deepStrictEqual(relatedProducts(base, [base, {...hub,id:"1"}, hub, {...hub}, p(3,"USB C Hub",{availability:"out_of_stock"}), p(4,"USB C Hub",{market:"ca"}), p(5,"USB C Hub",{currency:"CAD"}), p(6,"USB C Hub",{status:"archived"}), p(7,"USB C Hub",{normalized_category:"Furniture"})]).map(x=>x.id), [2]);
assert.deepStrictEqual(relatedProducts(base, [hub], 0), []);
assert.deepStrictEqual(relatedProducts(base, [p(8,"Cable for USB C Hub")]), []);
assert.deepStrictEqual(relatedProducts(p(1,"Acme Premium Wireless Device",{brand:"Acme"}),[p(2,"Acme Premium Wireless Gadget",{brand:"Acme"})]), []);
// Conservative fallback works for types the explicit dictionary does not know.
assert.deepStrictEqual(relatedProducts(p(1,"Ceramic Matcha Whisk Holder"),[p(2,"Ceramic Matcha Whisk Holder Green"),p(3,"Ceramic Garden Gnome")]).map(x=>x.id),[2]);
console.log("Related picks: 12 product families, accessories, empty states, duplicates and market boundaries passed.");

// Real retailer title: descriptive words can sit between the product nouns.
const storageBag = p(217497, 'WORKPRO 16" Zipper Wide Mouth Tool Storage Bag Case Large Capacity w/21 Pockets', {brand:'Workpro', normalized_category:'Tools & DIY'});
assert.deepStrictEqual(relatedProducts(storageBag,[p(2,'DEWALT Medium Tool Bag Organizer',{normalized_category:'Tools & DIY'}),p(3,'WORKPRO Cordless Drill',{brand:'Workpro',normalized_category:'Tools & DIY'})]).map(x=>x.id),[2]);
// An unknown source title can still match a known candidate by strong overlap.
assert.deepStrictEqual(relatedProducts(p(1,'Watercolor Fine Artist Brush Round'),[p(2,'Watercolor Artist Brush Flat')]).map(x=>x.id),[2]);

// Retailer naming variants across categories, including bundled products.
const expanded = [
  ['Stanley Fatmax Tape Measure 25 ft', 'Stanley 35ft FatMax Measuring Tape', 'Milwaukee Hammer Drill'],
  ['Michael Myers Halloween Mask', 'Latex Horror Face Mask', 'Halloween Pumpkin Statue'],
  ['LEGO Icons Kingfisher Bird Model', 'LEGO Technic Submarine Building Toy', 'Board Game Ticket to Ride'],
  ['Power Bank External Battery Backup For Cell Phone', 'Portable Powerbank 20000mAh', 'Tire Inflator Portable Power Bank'],
  ['Google Nest Smart Thermostat', 'Ecobee for Pro Smart Thermostat', 'Bluetooth Speaker'],
  ['MILWAUKEE DRILL DRIVER COMBO KIT 2 BATTERIES NEW', 'Hammer Drill Driver Tool Only', 'Drill Replacement Battery'],
  ['Video Baby Monitor with Camera', 'HelloBaby Video Baby Monitor', 'Laptop Computer Monitor'],
  ['HP Printer Paper 500 Sheets', 'Hammermill Copy Paper 3 Reams', 'HP Ink Cartridge for Printer'],
  ['Gotham Steel Frying Pan and Cookware Set', 'Nonstick Ceramic Cookware Set', 'Single Frying Pan'],
  ['Sonic Electric Toothbrush 8 Brush Heads Travel Case', 'Rechargeable Electric Toothbrush', 'Toothbrush Replacement Brush Heads'],
];
for (const [title,wanted,unrelated] of expanded) {
  assert.deepStrictEqual(relatedProducts(p(1,title),[p(2,wanted),p(3,unrelated)]).map(x=>x.id),[2],title);
}
const deeperCandidates = [...Array.from({length:100},(_,i)=>p(i+10,'Cordless Hammer Drill',{score:99})),...Array.from({length:4},(_,i)=>p(i+200,'Stanley Measuring Tape',{score:70}))];
assert.equal(relatedProducts(p(1,'Stanley Tape Measure'),deeperCandidates,4).length,4,'Low-ranked relevant alternatives must remain eligible');
assert.equal(relatedProducts(p(1,'Stanley Tape Measure'),[p(2,'Stanley Measuring Tape')],4).length,1,'A sparse catalog must not fabricate four alternatives');
console.log('Expanded related picks: retailer variants, bundles, deep candidates and honest sparse shelves passed.');

assert.deepStrictEqual(relatedProducts(p(1,'Professional Chef Kitchen Knife'),[p(2,'Stainless Steel Kitchen Knives'),p(3,'Knife Sharpener Whetstone'),p(4,'Miniature Dollhouse Kitchen Knife')]).map(x=>x.id),[2]);
