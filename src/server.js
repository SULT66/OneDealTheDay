const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const db = require("./db");
const c = require("./config");
const { refreshProducts } = require("./refresh");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(publicDir));

const trustPages = {
  "/about": "about.html",
  "/contact": "contact.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/affiliate-disclosure": "affiliate-disclosure.html",
  "/editorial-policy": "editorial-policy.html",
  "/how-we-select-deals": "how-we-select-deals.html",
  "/price-disclaimer": "price-disclaimer.html"
};
Object.entries(trustPages).forEach(([route, file]) => app.get(route, (req, res) => res.sendFile(path.join(pagesDir, file))));

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const money = (value, currency = "USD") => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Check latest price";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(number); }
  catch { return `$${number.toFixed(2)}`; }
};
const shortTitle = title => {
  const cleaned = String(title || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 78) return cleaned;
  const cut = cleaned.slice(0, 78).replace(/[,;:|\-][^,;:|\-]*$/, "").trim();
  return `${cut || cleaned.slice(0, 75).trim()}…`;
};
const storeName = product => {
  const source = String(product.source || "").toLowerCase();
  if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
  if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
  return product.source || "Retailer";
};
const dealLabel = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0 ? "Verified discount" : "Popular pick";
const whyPicked = product => {
  const parts = [];
  if (Number(product.rating) >= 4.5) parts.push(`strong ${Number(product.rating).toFixed(1)}-star customer rating`);
  if (Number(product.review_count) >= 1000) parts.push(`${Number(product.review_count).toLocaleString()}+ reviews`);
  if (Number(product.score) >= 80) parts.push(`high OneDailyDrop Score of ${Math.round(Number(product.score))}`);
  if (Number(product.original_price) > Number(product.current_price)) parts.push("a currently verified price reduction");
  return parts.length ? `We selected this product for its ${parts.join(", ")}.` : "We selected this product after reviewing its price, customer feedback, availability and overall value.";
};

app.get("/deal/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id);
  if (!product) return res.status(404).send("Product not found");
  const title = shortTitle(product.title);
  const store = storeName(product);
  const updated = product.updated_at ? new Date(product.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Recently";
  const description = String(product.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const canonical = `https://www.onedailydrop.com/deal/${encodeURIComponent(product.id)}`;
  const schema = JSON.stringify({
    "@context":"https://schema.org","@type":"Product",name:title,image:product.image_url ? [product.image_url] : undefined,
    description:description || whyPicked(product),aggregateRating:Number(product.rating) ? {"@type":"AggregateRating",ratingValue:Number(product.rating),reviewCount:Number(product.review_count || 0)} : undefined,
    offers:{"@type":"Offer",url:canonical,priceCurrency:String(product.currency || "USD").toUpperCase(),price:Number(product.current_price) || undefined,availability:"https://schema.org/InStock",seller:{"@type":"Organization",name:store}}
  });
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | OneDailyDrop</title><meta name="description" content="${esc((description || whyPicked(product)).slice(0,155))}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="product"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc((description || whyPicked(product)).slice(0,180))}"><meta property="og:image" content="${esc(product.image_url)}"><meta property="og:url" content="${canonical}"><link rel="stylesheet" href="/styles.css?v=20260722-product"><script type="application/ld+json">${schema.replace(/</g,"\\u003c")}</script></head><body><header class="site-header"><div class="header-top"><a class="brand" href="/"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>The Best Deals. Every Day.</small></span></a></div></header><main class="product-page"><nav class="breadcrumb"><a href="/">Home</a><span>›</span><span>${esc(product.category || "Deals")}</span><span>›</span><span>${esc(title)}</span></nav><article class="product-detail"><div class="product-detail-media"><img src="${esc(product.image_url)}" alt="${esc(title)}"></div><div class="product-detail-content"><p class="eyebrow">${esc(dealLabel(product))} · ${esc(store)}</p><h1>${esc(title)}</h1><div class="product-score"><strong>${esc(Math.round(Number(product.score) || 0))}/100</strong><span>OneDailyDrop Score</span></div><p class="product-lead">${esc(description || whyPicked(product))}</p><section class="editorial-box"><h2>Why we picked it</h2><p>${esc(whyPicked(product))}</p></section><div class="detail-grid"><section><h3>Best for</h3><p>${esc(product.category || "Everyday shoppers")}</p></section><section><h3>Pros</h3><p>Strong shopper signals, easy retailer access and current availability.</p></section><section><h3>Things to know</h3><p>Prices, shipping and availability can change after you leave OneDailyDrop.</p></section><section><h3>Price verified</h3><p>${esc(updated)} · Source: ${esc(store)}</p></section></div><div class="product-price-box"><span class="product-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}<small>Final price is confirmed on the retailer's website.</small></div><a class="featured-button" href="/go/${encodeURIComponent(product.id)}" rel="nofollow sponsored">See deal on ${esc(store)} →</a><p class="inline-disclosure">We may earn a commission from qualifying purchases at no extra cost to you.</p></div></article></main><footer><div><b>OneDailyDrop</b><p>The Best Deals. Every Day.</p></div><p><a href="/affiliate-disclosure">Affiliate Disclosure</a> · <a href="/price-disclaimer">Price Disclaimer</a></p></footer></body></html>`);
});

const admin = (req, res, next) => (req.headers["x-admin-key"] || req.query.key) === c.adminKey ? next() : res.status(401).json({ error: "Unauthorized" });
app.get("/api/products", (req, res) => res.json(db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC, updated_at DESC").all()));
app.get("/api/status", (req, res) => res.json({provider:c.provider,products:db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n,clicks:db.prepare("SELECT COUNT(*) n FROM clicks").get().n,lastRun:db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get()}));
app.post("/api/admin/refresh", admin, async (req, res) => { try { res.json(await refreshProducts(c)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get("/go/:id", (req, res) => { const product=db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id); if(!product)return res.sendStatus(404); db.prepare("INSERT INTO clicks(product_id,clicked_at,referrer,user_agent) VALUES(?,?,?,?)").run(product.id,new Date().toISOString(),req.get("referer")||"",req.get("user-agent")||""); res.redirect(302,product.affiliate_url); });
app.get("/admin", (req, res) => res.sendFile(path.join(publicDir, "admin.html")));
cron.schedule(c.refreshCron, () => refreshProducts(c).catch(error => console.error(error.message)), { timezone: c.timezone });
(async()=>{if(!db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n)await refreshProducts(c).catch(console.error);app.listen(c.port,()=>console.log(`http://localhost:${c.port}`));})();
