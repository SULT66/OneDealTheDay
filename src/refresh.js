const db = require("./db");
const { rankProducts } = require("./ranker");

async function loadProducts(c) {
  if (c.provider !== "multi") {
    if (c.provider === "rainforest" && !c.rainforestApiKey) throw new Error("RAINFOREST_API_KEY is missing; existing published products were kept");
    const provider = require(`./providers/${c.provider}`);
    return provider.searchProducts({ apiKey: c.rainforestApiKey, affiliateTag: c.affiliateTag, keywords: c.searchKeywords });
  }
  if (!c.rainforestApiKey) throw new Error("RAINFOREST_API_KEY is missing");
  if (!c.bluecartApiKey) throw new Error("BLUECART_API_KEY is missing");
  const amazon = require("./providers/rainforest");
  const walmart = require("./providers/walmart");
  const [amazonProducts, walmartProducts] = await Promise.all([
    amazon.searchProducts({ apiKey: c.rainforestApiKey, affiliateTag: c.affiliateTag, keywords: c.searchKeywords }),
    walmart.searchProducts({ apiKey: c.bluecartApiKey, keywords: c.searchKeywords })
  ]);
  return [...amazonProducts, ...walmartProducts];
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (["number", "bigint", "boolean"].includes(typeof value)) return String(value);
  if (Buffer.isBuffer(value)) return value.toString();
  if (typeof value === "object") return String(value.text ?? value.name ?? value.title ?? value.label ?? value.code ?? value.value ?? value.url ?? value.link ?? "");
  return String(value);
}

function numberValue(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === "object") value = value.value ?? value.price ?? value.amount ?? value.rating ?? value.count ?? null;
  if (value == null) return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

exports.refreshProducts = async c => {
  const started = new Date().toISOString();
  const runId = Number(db.prepare("INSERT INTO refresh_runs(provider,started_at,status,message) VALUES(?,?,'running','')").run(c.provider, started).lastInsertRowid);
  try {
    const found = await loadProducts(c);
    const top = rankProducts(found, 60);
    if (!Array.isArray(found) || found.length < 10 || top.length < 10) throw new Error(`Refresh returned insufficient products (${top.length}/10)`);
    const updatedAt = new Date().toISOString();

    db.transaction(() => {
      const existing = db.prepare("SELECT id,current_price,currency FROM products WHERE external_id=?");
      const productByExternalId = db.prepare("SELECT id,current_price,original_price,currency,source FROM products WHERE external_id=?");
      const insertHistory = db.prepare("INSERT INTO price_history(product_id,price,original_price,currency,source,observed_at) VALUES(?,?,?,?,?,?)");
      const stmt = db.prepare(`
        INSERT INTO products(external_id,product_key,upc,gtin,model_number,title,category,description,image_url,affiliate_url,rating,review_count,current_price,original_price,currency,badge,score,source,status,updated_at)
        VALUES(@external_id,@product_key,@upc,@gtin,@model_number,@title,@category,@description,@image_url,@affiliate_url,@rating,@review_count,@current_price,@original_price,@currency,@badge,@score,@source,'published',@updated_at)
        ON CONFLICT(external_id) DO UPDATE SET
          product_key=excluded.product_key,upc=excluded.upc,gtin=excluded.gtin,model_number=excluded.model_number,
          title=excluded.title,category=excluded.category,description=excluded.description,image_url=excluded.image_url,
          affiliate_url=excluded.affiliate_url,rating=excluded.rating,review_count=excluded.review_count,
          current_price=excluded.current_price,original_price=excluded.original_price,currency=excluded.currency,
          badge=excluded.badge,score=excluded.score,source=excluded.source,status='published',updated_at=excluded.updated_at
      `);

      for (const product of top) {
        const safe = {
          external_id: textValue(product.external_id), product_key: textValue(product.product_key), upc: textValue(product.upc),
          gtin: textValue(product.gtin), model_number: textValue(product.model_number), title: textValue(product.title),
          category: textValue(product.category), description: textValue(product.description), image_url: textValue(product.image_url),
          affiliate_url: textValue(product.affiliate_url), rating: numberValue(product.rating, 0),
          review_count: Math.round(numberValue(product.review_count, 0)),
          current_price: product.current_price == null ? null : numberValue(product.current_price, null),
          original_price: product.original_price == null ? null : numberValue(product.original_price, null),
          currency: textValue(product.currency || "USD"), badge: textValue(product.badge), score: numberValue(product.score, 0),
          source: textValue(product.source), updated_at: updatedAt
        };
        const before = existing.get(safe.external_id);
        stmt.run(safe);
        const after = productByExternalId.get(safe.external_id);
        const validPrice = Number.isFinite(Number(after?.current_price)) && Number(after.current_price) > 0;
        const changed = !before || Number(before.current_price) !== Number(after?.current_price) || String(before.currency || "USD") !== String(after?.currency || "USD");
        if (after && validPrice && changed) insertHistory.run(after.id, after.current_price, after.original_price, after.currency || "USD", after.source || "", updatedAt);
      }
    })();

    db.prepare("UPDATE refresh_runs SET finished_at=?,found_count=?,published_count=?,status='success',message=? WHERE id=?")
      .run(new Date().toISOString(), found.length, top.length, "Products refreshed and price changes recorded", runId);
    return { provider: c.provider, found: found.length, published: top.length };
  } catch (err) {
    db.prepare("UPDATE refresh_runs SET finished_at=?,status='failed',message=? WHERE id=?").run(new Date().toISOString(), err.message, runId);
    throw err;
  }
};
