const db = require("./db");
const { rankProducts } = require("./ranker");

async function loadProducts(c) {
  if (c.provider !== "multi") {
    if (c.provider === "rainforest" && !c.rainforestApiKey) {
      throw new Error("RAINFOREST_API_KEY is missing; existing published products were kept");
    }
    const provider = require(`./providers/${c.provider}`);
    return provider.searchProducts({
      apiKey: c.rainforestApiKey,
      affiliateTag: c.affiliateTag,
      keywords: c.searchKeywords
    });
  }

  if (!c.rainforestApiKey) throw new Error("RAINFOREST_API_KEY is missing; existing published products were kept");
  if (!c.bluecartApiKey) throw new Error("BLUECART_API_KEY is missing; existing published products were kept");

  const amazon = require("./providers/rainforest");
  const walmart = require("./providers/walmart");
  const [amazonProducts, walmartProducts] = await Promise.all([
    amazon.searchProducts({
      apiKey: c.rainforestApiKey,
      affiliateTag: c.affiliateTag,
      keywords: c.searchKeywords
    }),
    walmart.searchProducts({
      apiKey: c.bluecartApiKey,
      keywords: c.searchKeywords
    })
  ]);
  return [...amazonProducts, ...walmartProducts];
}

exports.refreshProducts = async c => {
  const start = new Date().toISOString();
  const id = Number(
    db.prepare("INSERT INTO refresh_runs(provider,started_at,status,message) VALUES(?,?,'running','')")
      .run(c.provider, start).lastInsertRowid
  );

  try {
    const found = await loadProducts(c);
    const top = rankProducts(found, 30);

    if (!Array.isArray(found) || found.length < 10 || top.length < 10) {
      throw new Error(`Refresh returned insufficient products (${top.length}/10); existing published products were kept`);
    }

    const updatedAt = new Date().toISOString();

    db.transaction(() => {
      const statement = db.prepare(`
        INSERT INTO products(
          external_id,product_key,upc,gtin,model_number,title,category,description,image_url,affiliate_url,
          rating,review_count,current_price,original_price,currency,badge,
          score,source,status,updated_at
        ) VALUES(
          @external_id,@product_key,@upc,@gtin,@model_number,@title,@category,@description,@image_url,@affiliate_url,
          @rating,@review_count,@current_price,@original_price,@currency,@badge,
          @score,@source,'published',@updated_at
        )
        ON CONFLICT(external_id) DO UPDATE SET
          product_key=excluded.product_key,
          upc=excluded.upc,
          gtin=excluded.gtin,
          model_number=excluded.model_number,
          title=excluded.title,
          category=excluded.category,
          description=excluded.description,
          image_url=excluded.image_url,
          affiliate_url=excluded.affiliate_url,
          rating=excluded.rating,
          review_count=excluded.review_count,
          current_price=excluded.current_price,
          original_price=excluded.original_price,
          currency=excluded.currency,
          badge=excluded.badge,
          score=excluded.score,
          source=excluded.source,
          status='published',
          updated_at=excluded.updated_at
      `);

      top.forEach(product => statement.run({
        product_key: "",
        upc: "",
        gtin: "",
        model_number: "",
        ...product,
        updated_at: updatedAt
      }));
      const ids = top.map(product => product.external_id);
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`UPDATE products SET status='archived' WHERE external_id NOT IN (${placeholders})`).run(...ids);
    })();

    db.prepare("UPDATE refresh_runs SET finished_at=?,found_count=?,published_count=?,status='success',message='Amazon and Walmart products published' WHERE id=?")
      .run(new Date().toISOString(), found.length, top.length, id);

    return { provider: c.provider, found: found.length, published: top.length };
  } catch (error) {
    db.prepare("UPDATE refresh_runs SET finished_at=?,status='failed',message=? WHERE id=?")
      .run(new Date().toISOString(), error.message, id);
    throw error;
  }
};
