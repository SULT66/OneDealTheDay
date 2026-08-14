const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const {parseDelimited} = require("../src/providers/affiliateFeed");
const {identityForProduct, sourceGroupKey} = require("../src/productIdentity");
const {deduplicationCandidateKeys, selectUniqueProducts} = require("../src/ranker");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function value(record, names) {
  for (const name of names) {
    const candidate = record[name];
    if (candidate != null && String(candidate).trim()) return String(candidate).trim();
  }
  return "";
}

function normalizedTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FEEDS = [
  {merchant:"Mooncool", source:"feed-mooncool", prefix:"66494-"},
  {merchant:"Tribesigns", source:"feed-tribesigns", prefix:"92307-"},
  {merchant:"Giftlab", source:"feed-giftlab", prefix:"95201-"},
  {merchant:"King Koil", source:"feed-king-koil", prefix:"115216-"}
];

function rawProduct(record, definition) {
  return {
    source:definition.source,
    market:"us",
    retailer_name:definition.merchant,
    external_id:value(record, ["id", "aw_product_id", "merchant_product_id", "product_id", "sku"]),
    source_group_id:value(record, ["item_group_id", "parent_product_id", "source_parent_id", "group_id"]),
    source_variant_id:value(record, ["variant_id", "source_variant_id"]),
    title:value(record, ["title", "product_name", "name"]),
    brand:value(record, ["brand", "manufacturer"]),
    category:value(record, ["google_product_category", "merchant_category", "category_name", "category"]),
    gtin:value(record, ["gtin", "gtin13", "gtin14"]),
    upc:value(record, ["upc"]),
    ean:value(record, ["ean", "ean13"]),
    mpn:value(record, ["mpn", "manufacturer_part_number", "part_number"]),
    model_number:value(record, ["model", "model_number"]),
    color:value(record, ["color"]),
    size:value(record, ["size"]),
    material:value(record, ["material"]),
    retailer_shop_url:value(record, ["merchant_deep_link", "link", "product_url", "url"])
  };
}

function metrics(products) {
  const safeGroupCounts = new Map();
  const candidateGroupCounts = new Map();
  const identitySourceGroups = new Map();
  const titleCounts = new Map();
  for (const product of products) {
    const sourceGroup = sourceGroupKey(product);
    const identity = identityForProduct(product).productKey;
    const group = sourceGroup || (identity ? `product:${identity}` : "") ||
      `offer:${product.source}:${product.market}:${product.external_id}`;
    safeGroupCounts.set(group, (safeGroupCounts.get(group) || 0) + 1);
    if (sourceGroup && identity) {
      if (!identitySourceGroups.has(identity)) identitySourceGroups.set(identity, new Set());
      identitySourceGroups.get(identity).add(sourceGroup);
    }
    for (const key of deduplicationCandidateKeys(product)) {
      candidateGroupCounts.set(key, (candidateGroupCounts.get(key) || 0) + 1);
    }
    const title = normalizedTitle(product.title);
    if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const safeCards = selectUniqueProducts(products);
  const groupSizes = [...safeGroupCounts.values()];
  const identityBridges = [...identitySourceGroups.values()].filter(groups => groups.size > 1);
  return {
    inputRows:products.length,
    safeCards:safeCards.length,
    collapsedVariantRows:products.length - safeCards.length,
    sourceProductGroups:safeGroupCounts.size,
    identityBridgeGroups:identityBridges.length,
    identityBridgeReduction:Math.max(0, safeGroupCounts.size - safeCards.length),
    multiVariantGroups:groupSizes.filter(count => count > 1).length,
    largestVariantGroup:Math.max(0, ...groupSizes),
    titleCollisionGroups:[...titleCounts.values()].filter(count => count > 1).length,
    titleCandidateGroups:[...candidateGroupCounts.values()].filter(count => count > 1).length
  };
}

function auditFeeds(feedDir) {
  const files = fs.readdirSync(feedDir);
  return FEEDS.map(definition => {
    const filename = files.find(name => name.startsWith(definition.prefix) && name.endsWith(".gz"));
    if (!filename) throw new Error(`Missing ${definition.merchant} feed in ${feedDir}`);
    const body = zlib.gunzipSync(fs.readFileSync(path.join(feedDir, filename))).toString("utf8").replace(/^\uFEFF/, "");
    const records = parseDelimited(body).map(record => Object.fromEntries(
      Object.entries(record).map(([key, entryValue]) => [String(key).trim().toLowerCase(), entryValue])
    ));
    return {merchant:definition.merchant, source:definition.source, filename, ...metrics(records.map(record => rawProduct(record, definition)))};
  });
}

function auditProduction(productionDir) {
  const files = fs.readdirSync(productionDir).filter(name => /^products-[a-z]{2}\.json$/.test(name)).sort();
  const products = files.flatMap(filename => JSON.parse(fs.readFileSync(path.join(productionDir, filename), "utf8")));
  const bySource = new Map();
  for (const product of products) {
    const source = product.source || "unknown";
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(product);
  }
  return {
    files,
    total:metrics(products),
    sources:[...bySource.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([source, rows]) => ({source, ...metrics(rows)}))
  };
}

const feedDir = argument("--feed-dir");
const productionDir = argument("--production-dir");
const output = argument("--out");
if (!feedDir || !productionDir) {
  throw new Error("Usage: node scripts/audit-dedup-current-catalog.js --feed-dir DIR --production-dir DIR [--out FILE]");
}

const report = {
  generatedAt:new Date().toISOString(),
  policy:{
    automatic:["validated GTIN", "brand + MPN/model + compatible variant", "source-scoped product group"],
    candidateOnly:["brand + normalized title + category + variant attributes"],
    forbidden:["title-only global merge", "cross-source merchant URL merge", "placeholder/invalid GTIN merge"]
  },
  rawFeeds:auditFeeds(feedDir),
  productionSamples:auditProduction(productionDir)
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, serialized);
}
process.stdout.write(serialized);
