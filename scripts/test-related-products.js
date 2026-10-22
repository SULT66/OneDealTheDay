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
