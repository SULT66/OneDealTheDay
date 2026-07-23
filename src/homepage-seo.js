const db = require("./db");
const config = require("./config");
const renderHomepage = require("./homepage");
const buildHomepageSchema = require("./homepage-schema");

const SITE = "https://www.onedailydrop.com";
const slug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => `/deal/${slug(product.title)}-${product.id}`;
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const fullTitle = value => clean(value);
const storeName = product => {
  const source = String(product.source || "").toLowerCase();
  if (source === "demo") return "Preview catalog";
  if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
  if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
  return product.source || "Retailer";
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const discount = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0 ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const oldWhyPicked = product => {
  const reasons = [];
  if (Number(product.rating) >= 4.5) reasons.push(`${Number(product.rating).toFixed(1)}-star rating`);
  if (Number(product.review_count) >= 1000) reasons.push(`${Number(product.review_count).toLocaleString()}+ reviews`);
  if (Number(product.score) >= 80) reasons.push(`score ${Math.round(Number(product.score))}/100`);
  if (discount(product)) reasons.push(`${discount(product)}% verified discount`);
  return reasons.length ? `Picked for its ${reasons.join(", ")}.` : "Picked for its price, shopper feedback and overall value.";
};
const editorialWhyPicked = product => {
  const title = clean(product.title) || "This product";
  const category = clean(product.category) || "its category";
  const retailer = clean(storeName(product));
  const rating = Number(product.rating || 0);
  const reviews = Number(product.review_count || 0);
  const score = Math.round(Number(product.score || 0));
  const savings = discount(product);
  const evidence = [];
  if (rating > 0) evidence.push(`${rating.toFixed(1)}-star customer rating`);
  if (reviews > 0) evidence.push(`${reviews.toLocaleString("en-US")} customer reviews`);
  if (score > 0) evidence.push(`${score}/100 OneDailyDrop Score`);
  const first = `${title} stands out among today’s ${category} offers${retailer ? ` from ${retailer}` : ""}.`;
  const second = evidence.length ? `We selected it based on its ${evidence.join(", ")}${savings ? ` and a verified ${savings}% price reduction` : ""}.` : "We selected it after comparing current price, product relevance and available shopper feedback.";
  return `${first} ${second}`;
};

module.exports = function homepageSeo(req, res) {
  const originalSend = res.send.bind(res);

  res.send = body => {
    if (typeof body !== "string" || !body.includes("application/ld+json")) return originalSend(body);

    let enhanced = body.replace(
      '<link rel="canonical" href="https://www.onedailydrop.com/">',
      '<link rel="canonical" href="https://www.onedailydrop.com/"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:site_name" content="OneDailyDrop">'
    );

    if (!config.demoMode) {
      const top = db.prepare("SELECT * FROM products WHERE status='published' AND LOWER(COALESCE(source,''))<>'demo' ORDER BY score DESC, updated_at DESC LIMIT 10").all();
      const schema = buildHomepageSchema({ SITE, top, dealPath, shortTitle: fullTitle, storeName });
      const json = JSON.stringify(schema).replace(/</g, "\\u003c");
      enhanced = enhanced.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">${json}</script>`
      );
      for (const product of top) {
        enhanced = enhanced.split(esc(oldWhyPicked(product))).join(esc(editorialWhyPicked(product)));
      }
    }

    enhanced = enhanced.replace(
      '<script src="/app.js?v=20260723-demo-polish"></script>',
      '<script>(function(){const q=new URLSearchParams(location.search).get("q");if(!q)return;const input=document.getElementById("searchInput");if(input)input.value=q;})();</script><script src="/app.js?v=20260723-demo-polish"></script>'
    );

    return originalSend(enhanced);
  };

  return renderHomepage(req, res);
};
