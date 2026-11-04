const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname,"../components/site/CampaignCarousel.tsx"),"utf8");
const grid = src.indexOf('<div className="grid">');
const navigation = src.indexOf('aria-label="Campaign slides"');
const gridEnd = src.lastIndexOf("    </div>\n  </div>;");
assert(grid >= 0 && navigation > grid && navigation < gridEnd,
  "Campaign tabs should overlay the hero grid, not render in a detached footer");
assert(src.includes('col-start-1 row-start-1 self-end'),
  "Tabs must share the slide artwork rather than occupy their own row");
assert(!src.includes('border-t border-[#10101020] bg-[#f3f0e8]'),
  "Detached beige banner footer must not return");
assert(src.includes('pb-36') && src.includes('sm:pb-20'),
  "Slides must reserve space so mobile navigation never covers CTA");
assert(!src.includes("Impact,"),
  "Extremely condensed Impact heading must not return");
assert(!src.includes('"Arial Black"') && src.includes('font-sans text-[30px] font-semibold') && src.includes('lg:text-[44px]'),
  "Campaign headings must use the site's Outfit font at a compact responsive size");
assert(src.includes('min-h-11') && src.includes('focus-visible:outline'),
  "Campaign navigation must remain touch-sized and keyboard-accessible");
console.log("Hero carousel layout: integrated slide tabs, readable headline, and mobile controls verified.");
