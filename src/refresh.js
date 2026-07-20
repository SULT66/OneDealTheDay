const db = require("./db");
const { rankProducts } = require("./ranker");

exports.refreshProducts = async c => {
  const start = new Date().toISOString();
  const id = Number(
    db.prepare("INSERT INTO refresh_runs(provider,started_at,status,message) VALUES(?,?,'running','')")
      .run(c.provider, start).lastInsertRowid
  );

  try {
    if (c.provider === "rainforest" && !c.rainforestApiKey) {
      throw new Error("RAINFOREST_API_KEY is missing; existing published products were kept");
    }

    const provider = require(`./providers/${c.provider}`);
    const found = await provider.searchProducts({
      apiKey: c.rainforestApiKey,
      affiliateTag: c.affiliateTag,
      keywords: c.searchKeywords
    });

    const top = rankProducts(found, 10);

    if (!Array.isArray(found) || found.length < 10 || top.length < 10) {
      throw new Error(`Refresh returned insufficient products (${top.length}/10); existing published products were kept`);
    }

    const updatedAt = new Date().toISOString();

    db.transaction(() => {
      const statement = db.prepare(`
        INSERT INTO products(
          external_id,title,category,description,image_url,affiliate_url,
          rating,review_count,current_price,original_price,currency,badge,
          score,source,status,updated_at
        ) VALUES(
          @external_id,@title,@category,@description,@image_url,@affiliate_url,
          @rating,@review_count,@current_price,@original_price,@currency,@badge,
          @score,@source,'published',@updated_at
        )
        ON CONFLICT(external_id) DO UPDATE SET
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

      top.forEach(product => statement.run({ ...product, updated_at: updatedAt }));

      const ids = top.map(product => product.external_id);
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`UPDATE products SET status='archived' WHERE external_id NOT IN (${placeholders})`).run(...ids);
    })();

    db.prepare("UPDATE refresh_runs SET finished_at=?,found_count=?,published_count=?,status='success',message='Top 10 published' WHERE id=?")
      .run(new Date().toISOString(), found.length, top.length, id);

    return { provider: c.provider, found: found.length, published: top.length };
  } catch (error) {
    db.prepare("UPDATE refresh_runs SET finished_at=?,status='failed',message=? WHERE id=?")
      .run(new Date().toISOString(), error.message, id);
    throw error;
  }
};