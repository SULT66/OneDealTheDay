const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const Stripe = require("stripe");
const db = require("./db");
const c = require("./config");
const { refreshProducts } = require("./refresh");
const { detectBrand, normalizeBrand, slugifyBrand } = require("./brandDetector");
const { passwordResetEmail, subscriptionEmail } = require("./mailer");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");
const SITE = "https://www.onedailydrop.com";
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const stripePriceId = String(process.env.STRIPE_CLUB_PRICE_ID || "").trim();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

app.use(helmet({ contentSecurityPolicy: false }));
app.post("/api/stripe/webhook", express.raw({type:"application/json"}), (req, res) => {
  if (!stripe || !stripeWebhookSecret) return res.status(503).send("Stripe webhook is not configured.");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], stripeWebhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const object = event.data.object;
  const activate = subscription => {
    const userId = Number(subscription.metadata?.user_id);
    const active = ["active", "trialing"].includes(subscription.status);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (userId) {
      db.prepare(`UPDATE users SET membership=?,stripe_customer_id=?,stripe_subscription_id=?,stripe_subscription_status=? WHERE id=?`)
        .run(active ? "club" : "free", customerId || null, subscription.id, subscription.status, userId);
    } else if (customerId) {
      db.prepare(`UPDATE users SET membership=?,stripe_subscription_id=?,stripe_subscription_status=? WHERE stripe_customer_id=?`)
        .run(active ? "club" : "free", subscription.id, subscription.status, customerId);
    }
  };

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    activate(object);
  }
  if (event.type === "checkout.session.completed" && object.mode === "subscription") {
    const userId = Number(object.client_reference_id || object.metadata?.user_id);
    if (userId) {
      db.prepare("UPDATE users SET stripe_customer_id=?,stripe_subscription_id=? WHERE id=?")
        .run(String(object.customer || ""), String(object.subscription || ""), userId);
    }
  }
  res.json({received:true});
});
app.use(express.json());
app.use(express.static(publicDir));

const parseCookies = req => Object.fromEntries(String(req.headers.cookie || "").split(";").map(value => value.trim()).filter(Boolean).map(value => {
  const index = value.indexOf("=");
  return [decodeURIComponent(value.slice(0, index)), decodeURIComponent(value.slice(index + 1))];
}));
const tokenHash = token => crypto.createHash("sha256").update(token).digest("hex");
const commonPasswords = new Set(["12345678", "123456789", "password", "password1", "qwerty123", "qwertyuiop", "letmein123", "onedailydrop"]);
const passwordError = password => {
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Add at least one symbol.";
  if (commonPasswords.has(password.toLowerCase()) || /(.)\1{5,}/.test(password)) return "Choose a less common password.";
  return null;
};
const passwordHash = password => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};
const passwordMatches = (password, stored) => {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
};
const currentUser = req => {
  const token = parseCookies(req).odd_session;
  if (!token) return null;
  return db.prepare(`SELECT u.id,u.email,u.name,u.membership FROM user_sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), new Date().toISOString()) || null;
};
const requireUser = (req, res, next) => {
  req.user = currentUser(req);
  return req.user ? next() : res.status(401).json({error:"Create a free account or sign in first."});
};
const requireClub = (req, res, next) => {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({error:"Create a free account or sign in first."});
  return req.user.membership === "club" ? next() : res.status(403).json({error:"This action is included with OneDailyDrop Club."});
};
const startSession = (res, userId) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 30 * 86400000);
  db.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(tokenHash(token), userId, expires.toISOString());
  res.cookie("odd_session", token, {httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", maxAge:30 * 86400000});
};

const trustPages = {"/about":"about.html","/contact":"contact.html","/privacy":"privacy.html","/terms":"terms.html","/affiliate-disclosure":"affiliate-disclosure.html","/editorial-policy":"editorial-policy.html","/how-we-select-deals":"how-we-select-deals.html","/price-disclaimer":"price-disclaimer.html"};
Object.entries(trustPages).forEach(([route, file]) => app.get(route, (req, res) => res.sendFile(path.join(pagesDir, file))));
app.get("/club", (req, res) => res.sendFile(path.join(publicDir, "club.html")));
app.get("/account", (req, res) => res.sendFile(path.join(publicDir, "account.html")));
app.get("/reset-password", (req, res) => res.sendFile(path.join(publicDir, "account.html")));

app.post("/api/auth/register", (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 2) return res.status(400).json({error:"Enter your name."});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return res.status(400).json({error:"Enter a valid email address."});
  const invalidPassword = passwordError(password);
  if (invalidPassword) return res.status(400).json({error:invalidPassword});
  try {
    const result = db.prepare("INSERT INTO users(email,name,password_hash,membership,created_at) VALUES(?,?,?,?,?)")
      .run(email, name, passwordHash(password), "free", new Date().toISOString());
    startSession(res, result.lastInsertRowid);
    res.status(201).json({user:{id:result.lastInsertRowid,email,name,membership:"free"}});
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({error:"An account with this email already exists."});
    throw error;
  }
});
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !passwordMatches(String(req.body?.password || ""), user.password_hash)) return res.status(401).json({error:"Email or password is incorrect."});
  startSession(res, user.id);
  res.json({user:{id:user.id,email:user.email,name:user.name,membership:user.membership}});
});
app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req).odd_session;
  if (token) db.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(tokenHash(token));
  res.clearCookie("odd_session");
  res.json({ok:true});
});
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT id,email,name FROM users WHERE email=?").get(email);
  const response = {ok:true,message:"If that email belongs to an account, a password reset link is on its way."};
  if (!user) return res.json(response);

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at<=?").run(user.id, new Date().toISOString());
  db.prepare("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .run(tokenHash(token), user.id, expiresAt);

  try {
    await passwordResetEmail({name:user.name,email:user.email,token});
  } catch (error) {
    db.prepare("DELETE FROM password_reset_tokens WHERE token_hash=?").run(tokenHash(token));
    console.error("Password reset email could not be sent:", error.code, error.message, error.details || "");
    return res.status(503).json({error:"We couldn’t send the reset email right now. Please try again shortly."});
  }
  res.json(response);
});
app.post("/api/auth/reset-password", (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  const invalidPassword = passwordError(password);
  if (invalidPassword) return res.status(400).json({error:invalidPassword});
  const reset = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?")
    .get(tokenHash(token), new Date().toISOString());
  if (!reset) return res.status(400).json({error:"This reset link is invalid or has expired."});
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash(password), reset.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?").run(now, reset.token_hash);
    db.prepare("DELETE FROM user_sessions WHERE user_id=?").run(reset.user_id);
  })();
  startSession(res, reset.user_id);
  res.json({ok:true});
});
app.get("/api/me", (req, res) => res.json({user:currentUser(req)}));
app.post("/api/club/checkout", requireUser, async (req, res) => {
  if (!stripe || !stripePriceId) return res.status(503).json({error:"Secure Club checkout is being connected. Please try again shortly."});
  if (req.user.membership === "club") return res.status(409).json({error:"Your Club membership is already active."});
  try {
    const stored = db.prepare("SELECT stripe_customer_id FROM users WHERE id=?").get(req.user.id);
    const session = await stripe.checkout.sessions.create({
      mode:"subscription",
      line_items:[{price:stripePriceId,quantity:1}],
      customer:stored?.stripe_customer_id || undefined,
      customer_email:stored?.stripe_customer_id ? undefined : req.user.email,
      client_reference_id:String(req.user.id),
      metadata:{user_id:String(req.user.id)},
      subscription_data:{metadata:{user_id:String(req.user.id)}},
      success_url:`${SITE}/account?checkout=success`,
      cancel_url:`${SITE}/club?checkout=cancelled`,
      allow_promotion_codes:true
    });
    res.json({url:session.url});
  } catch (error) {
    console.error("Stripe checkout error:", error.message);
    res.status(502).json({error:"We couldn’t open secure checkout. Please try again."});
  }
});
app.post("/api/club/billing-portal", requireUser, async (req, res) => {
  if (!stripe) return res.status(503).json({error:"Billing management is not configured."});
  const stored = db.prepare("SELECT stripe_customer_id FROM users WHERE id=?").get(req.user.id);
  if (!stored?.stripe_customer_id) return res.status(404).json({error:"No Club billing account was found."});
  try {
    const session = await stripe.billingPortal.sessions.create({customer:stored.stripe_customer_id,return_url:`${SITE}/account`});
    res.json({url:session.url});
  } catch (error) {
    console.error("Stripe portal error:", error.message);
    res.status(502).json({error:"We couldn’t open billing management. Please try again."});
  }
});
app.post("/api/club/interest", requireUser, (req, res) => res.json({ok:true,membership:req.user.membership}));
app.post("/api/club/participate", requireClub, (req, res) => res.json({ok:true,message:"You are in. Every Club member receives access at the same time."}));
app.post("/api/price-alerts", requireClub, (req, res) => {
  const productUrl = String(req.body?.productUrl || "").trim().slice(0, 1000);
  const targetPrice = Number(req.body?.targetPrice);
  if (!/^https?:\/\//i.test(productUrl)) return res.status(400).json({error:"Enter a valid product link."});
  db.prepare("INSERT INTO price_alerts(user_id,product_url,target_price,created_at) VALUES(?,?,?,?)")
    .run(req.user.id, productUrl, Number.isFinite(targetPrice) ? targetPrice : null, new Date().toISOString());
  res.status(201).json({ok:true});
});

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const slug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => `/deal/${slug(product.title)}-${product.id}`;
const catPath = value => `/category/${slug(value)}`;
const brandPath = value => `/brand/${slugifyBrand(value)}`;
const money = (value, currency = "USD") => { const n = Number(value); if (!Number.isFinite(n)) return "Check latest price"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(n); } catch { return `$${n.toFixed(2)}`; } };
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };
const discountPercent = product => Number(product.original_price) > Number(product.current_price) ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const whyPicked = product => { const points = []; if (Number(product.rating) >= 4.5) points.push(`strong ${Number(product.rating).toFixed(1)}-star rating`); if (Number(product.review_count) >= 1000) points.push(`${Number(product.review_count).toLocaleString()}+ reviews`); if (Number(product.score) >= 80) points.push(`high OneDailyDrop Score of ${Math.round(Number(product.score))}`); if (discountPercent(product) > 0) points.push(`${discountPercent(product)}% verified price reduction`); return points.length ? `We selected this product for its ${points.join(", ")}.` : "We selected this product after reviewing its price, customer feedback, availability and overall value."; };

const shell = (title, description, canonical, body, schema, image = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1020"><title>${esc(title)}</title><meta name="description" content="${esc(description.slice(0,160))}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0,180))}"><meta property="og:url" content="${canonical}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description.slice(0,180))}"><link rel="stylesheet" href="/styles.css?v=20260722-brand"><link rel="stylesheet" href="/brand-theme.css?v=20260723"><link rel="stylesheet" href="/liquid-glass.css?v=20260723-serious2"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script></head><body><header class="site-header"><div class="header-top"><a class="brand" href="/"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>The Best Deals. Every Day.</small></span></a><button id="themeToggle" class="icon-button" type="button" aria-label="Switch to dark mode" title="Dark mode">☾</button></div></header>${body}<footer><div><b>OneDailyDrop</b><p>The Best Deals. Every Day.</p></div><p><a href="/affiliate-disclosure">Affiliate Disclosure</a> · <a href="/price-disclaimer">Price Disclaimer</a></p></footer><script src="/theme.js?v=20260723-serious2"></script></body></html>`;

const productCard = (product, index = 0) => `<article class="card"><a class="image-wrap" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(shortTitle(product.title))}"></a><div class="card-content">${index ? `<span class="rank">#${index}</span>` : ""}${product.brand ? `<a class="eyebrow" href="${brandPath(product.brand)}">${esc(product.brand)}</a>` : ""}<h3><a href="${dealPath(product)}">${esc(shortTitle(product.title))}</a></h3><p class="description">${esc(whyPicked(product))}</p><span class="price">${money(product.current_price, product.currency)}</span></div></article>`;
const findProduct = param => { const id = String(param).match(/-(\d+)$/)?.[1] || (/^\d+$/.test(param) ? param : null); return id ? db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(id) : null; };
const historyFor = id => db.prepare("SELECT price,original_price,currency,source,observed_at FROM price_history WHERE product_id=? ORDER BY observed_at ASC").all(id);
const minSince = (rows, days) => { const cutoff = Date.now() - days * 86400000; const values = rows.filter(row => new Date(row.observed_at).getTime() >= cutoff).map(row => Number(row.price)).filter(Number.isFinite); return values.length ? Math.min(...values) : null; };
const chartSvg = rows => { if (rows.length < 2) return "<p>Price tracking has started. A chart will appear after another price change is recorded.</p>"; const values = rows.map(row => Number(row.price)).filter(Number.isFinite); const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1); const points = values.map((value, index) => `${20 + (index / (values.length - 1)) * 560},${180 - ((value - min) / range) * 140}`).join(" "); return `<svg viewBox="0 0 600 210" role="img" aria-label="Price history chart" style="width:100%;max-width:760px"><line x1="20" y1="180" x2="580" y2="180" stroke="currentColor" opacity=".25"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4"/><text x="20" y="202" font-size="14">${esc(money(min, rows[0]?.currency))}</text><text x="500" y="24" font-size="14">${esc(money(max, rows[0]?.currency))}</text></svg>`; };

app.get("/deal/:slug", (req, res) => {
  const p = findProduct(req.params.slug);
  if (!p) return res.status(404).send("Product not found");
  if (req.path !== dealPath(p)) return res.redirect(301, dealPath(p));
  const canonical = SITE + dealPath(p), title = shortTitle(p.title), description = clean(p.description) || whyPicked(p), store = storeName(p), category = p.category || "Deals";
  const history = historyFor(p.id), allLow = history.length ? Math.min(...history.map(row => Number(row.price)).filter(Number.isFinite)) : null, low30 = minSince(history, 30), low90 = minSince(history, 90);
  const related = p.brand_slug ? db.prepare("SELECT * FROM products WHERE status='published' AND brand_slug=? AND id<>? ORDER BY score DESC LIMIT 4").all(p.brand_slug, p.id) : [];
  const productSchema = {"@context":"https://schema.org","@graph":[{"@type":"Product",name:title,brand:p.brand?{"@type":"Brand",name:p.brand}:undefined,manufacturer:p.manufacturer?{"@type":"Organization",name:p.manufacturer}:undefined,mpn:p.mpn||undefined,gtin:p.gtin||p.ean||p.upc||undefined,image:p.image_url?[p.image_url]:undefined,description,aggregateRating:Number(p.rating)?{"@type":"AggregateRating",ratingValue:Number(p.rating),reviewCount:Number(p.review_count||0)}:undefined,offers:{"@type":"Offer",url:canonical,priceCurrency:String(p.currency||"USD").toUpperCase(),price:Number(p.current_price)||undefined,availability:"https://schema.org/InStock",seller:{"@type":"Organization",name:store}}},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE},{"@type":"ListItem",position:2,name:category,item:SITE+catPath(category)},...(p.brand?[{"@type":"ListItem",position:3,name:p.brand,item:SITE+brandPath(p.brand)}]:[]),{"@type":"ListItem",position:p.brand?4:3,name:title,item:canonical}]}]};
  const brandBlock = p.brand ? `<p class="eyebrow">Brand: <a href="${brandPath(p.brand)}">${esc(p.brand)}</a></p>` : `<p class="eyebrow">${esc(store)}</p>`;
  const relatedBlock = related.length ? `<section class="deals-section"><div class="section-heading"><div><p class="eyebrow">MORE FROM THIS BRAND</p><h2>More ${esc(p.brand)} deals</h2></div><a href="${brandPath(p.brand)}">View all →</a></div><div class="grid">${related.map(product => productCard(product)).join("")}</div></section>` : "";
  const body = `<main class="product-page"><nav class="breadcrumb"><a href="/">Home</a><span>›</span><a href="${catPath(category)}">${esc(category)}</a>${p.brand?`<span>›</span><a href="${brandPath(p.brand)}">${esc(p.brand)}</a>`:""}<span>›</span><span>${esc(title)}</span></nav><article class="product-detail"><div class="product-detail-media"><img src="${esc(p.image_url)}" alt="${esc(title)}"></div><div class="product-detail-content">${brandBlock}<h1>${esc(title)}</h1><div class="product-score"><strong>${Math.round(Number(p.score)||0)}/100</strong><span>OneDailyDrop Score</span></div><p class="product-lead">${esc(description)}</p><section class="editorial-box"><h2>Why we picked it</h2><p>${esc(whyPicked(p))}</p></section><div class="detail-grid"><section><h3>Current price</h3><p>${money(p.current_price,p.currency)}</p></section><section><h3>30-day low</h3><p>${money(low30,p.currency)}</p></section><section><h3>90-day low</h3><p>${money(low90,p.currency)}</p></section><section><h3>All-time tracked low</h3><p>${money(allLow,p.currency)}</p></section></div><section class="editorial-box"><h2>Price history</h2>${chartSvg(history)}<p>${history.length} tracked price observation${history.length===1?"":"s"}.</p></section><div class="product-price-box"><span class="product-price">${money(p.current_price,p.currency)}</span>${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}<small>Final price is confirmed on the retailer website.</small></div><a class="featured-button" href="/go/${p.id}" rel="nofollow sponsored">See deal on ${esc(store)} →</a></div></article>${relatedBlock}</main>`;
  res.send(shell(`${title} | OneDailyDrop`, description, canonical, body, productSchema, p.image_url));
});

app.get("/category/:slug", (req, res) => {
  const all = db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC,updated_at DESC").all();
  const category = [...new Set(all.map(product => product.category).filter(Boolean))].find(value => slug(value) === req.params.slug);
  if (!category) return res.status(404).send("Category not found");
  const products = all.filter(product => product.category === category), canonical = SITE + catPath(category), description = `Browse the best ${category} deals selected by OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:`Best ${category} Deals`,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))};
  res.send(shell(`Best ${category} Deals | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">CATEGORY</p><h1>${esc(category)} Deals</h1></div><p class="result-count">${products.length} products</p></div><div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div></section></main>`, schema));
});

app.get("/brand/:slug", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE status='published' AND brand_slug=? ORDER BY score DESC,updated_at DESC").all(req.params.slug);
  if (!products.length) return res.status(404).send("Brand not found");
  const brand = products[0].brand, canonical = SITE + brandPath(brand), avgPrice = products.reduce((sum,p)=>sum+Number(p.current_price||0),0)/products.length, avgRating = products.reduce((sum,p)=>sum+Number(p.rating||0),0)/products.length, avgDiscount = products.reduce((sum,p)=>sum+discountPercent(p),0)/products.length;
  const description = `Browse ${products.length} ${brand} deals, price drops and top-rated products selected by OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"Brand",name:brand,url:canonical},{"@type":"ItemList",name:`Best ${brand} Deals`,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE},{"@type":"ListItem",position:2,name:"Brands",item:SITE+"/brands"},{"@type":"ListItem",position:3,name:brand,item:canonical}]}]};
  const stats = `<div class="detail-grid"><section><h3>Products</h3><p>${products.length}</p></section><section><h3>Average price</h3><p>${money(avgPrice,products[0].currency)}</p></section><section><h3>Average rating</h3><p>${avgRating.toFixed(1)} / 5</p></section><section><h3>Average discount</h3><p>${Math.round(avgDiscount)}%</p></section></div>`;
  res.send(shell(`${brand} Deals & Price Drops | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="/">Home</a><span>›</span><a href="/brands">Brands</a><span>›</span><span>${esc(brand)}</span></nav><div class="section-heading"><div><p class="eyebrow">BRAND</p><h1>${esc(brand)} Deals</h1><p>${esc(description)}</p></div></div>${stats}<div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div></section></main>`, schema));
});

app.get("/brands", (req, res) => {
  const brands = db.prepare("SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating FROM products WHERE status='published' AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC").all();
  const canonical = SITE + "/brands", description = "Explore popular brands and their best current deals on OneDailyDrop.";
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:"Popular Brands",itemListElement:brands.map((brand,index)=>({"@type":"ListItem",position:index+1,url:SITE+brandPath(brand.brand),name:brand.brand}))};
  const cards = brands.map(brand => `<article class="card"><div class="card-content"><p class="eyebrow">${brand.product_count} DEALS</p><h2><a href="${brandPath(brand.brand)}">${esc(brand.brand)}</a></h2><p>Average price ${money(brand.avg_price)} · Rating ${Number(brand.avg_rating||0).toFixed(1)}</p></div></article>`).join("");
  res.send(shell("Popular Brands & Deals | OneDailyDrop", description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">BRANDS</p><h1>Popular Brands</h1></div><p class="result-count">${brands.length} brands</p></div><div class="grid">${cards}</div></section></main>`, schema));
});

app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`));
app.get("/sitemap.xml", (req, res) => { const products = db.prepare("SELECT id,title,category,brand,brand_slug,updated_at FROM products WHERE status='published'").all(), categories = [...new Set(products.map(p=>p.category).filter(Boolean))], brands = [...new Map(products.filter(p=>p.brand_slug).map(p=>[p.brand_slug,p.brand])).values()], staticUrls = ["/","/brands",...Object.keys(trustPages)]; const urls = [...staticUrls.map(loc=>({loc:SITE+loc})),...categories.map(value=>({loc:SITE+catPath(value)})),...brands.map(value=>({loc:SITE+brandPath(value)})),...products.map(product=>({loc:SITE+dealPath(product),lastmod:product.updated_at}))]; res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(item=>`<url><loc>${esc(item.loc)}</loc>${item.lastmod?`<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>`:""}</url>`).join("")}</urlset>`); });

const admin = (req,res,next) => (req.headers["x-admin-key"] || req.query.key) === c.adminKey ? next() : res.status(401).json({error:"Unauthorized"});
app.get("/api/products", (req, res) => { const params = [], conditions = ["status='published'"]; if (req.query.brand) { conditions.push("brand_slug=?"); params.push(slugifyBrand(req.query.brand)); } if (req.query.category) { conditions.push("category=?"); params.push(String(req.query.category)); } const products = db.prepare(`SELECT * FROM products WHERE ${conditions.join(" AND ")} ORDER BY score DESC,updated_at DESC`).all(...params); res.json(products.map(product=>({...product,slug:slug(product.title),deal_url:dealPath(product),category_url:catPath(product.category||"deals"),brand_url:product.brand?brandPath(product.brand):null}))); });
app.get("/api/brands", (req,res) => res.json(db.prepare("SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating,AVG(CASE WHEN original_price>current_price THEN (1-current_price/original_price)*100 ELSE 0 END) avg_discount FROM products WHERE status='published' AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC").all().map(brand=>({...brand,url:brandPath(brand.brand)}))));
app.get("/api/brands/:slug", (req,res) => { const products = db.prepare("SELECT * FROM products WHERE status='published' AND brand_slug=? ORDER BY score DESC").all(req.params.slug); if (!products.length) return res.status(404).json({error:"Brand not found"}); const brand = products[0].brand; res.json({brand,slug:req.params.slug,url:brandPath(brand),summary:{products:products.length,average_price:products.reduce((s,p)=>s+Number(p.current_price||0),0)/products.length,average_rating:products.reduce((s,p)=>s+Number(p.rating||0),0)/products.length,average_discount:products.reduce((s,p)=>s+discountPercent(p),0)/products.length,total_clicks:db.prepare("SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE p.brand_slug=?").get(req.params.slug).n},products:products.map(p=>({...p,deal_url:dealPath(p)}))}); });
app.get("/api/products/:id/price-history", (req,res) => { const product = db.prepare("SELECT id,title,current_price,currency FROM products WHERE id=? AND status='published'").get(req.params.id); if (!product) return res.status(404).json({error:"Product not found"}); const history = historyFor(product.id); res.json({product,summary:{observations:history.length,lowest_30_days:minSince(history,30),lowest_90_days:minSince(history,90),lowest_ever:history.length?Math.min(...history.map(row=>Number(row.price)).filter(Number.isFinite)):null},history}); });
app.get("/api/status", (req,res) => res.json({provider:c.provider,products:db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n,brands:db.prepare("SELECT COUNT(DISTINCT brand_slug) n FROM products WHERE status='published' AND brand_slug<>''").get().n,clicks:db.prepare("SELECT COUNT(*) n FROM clicks").get().n,priceObservations:db.prepare("SELECT COUNT(*) n FROM price_history").get().n,lastRun:db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get()}));
app.post("/api/subscribe", async (req,res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const requested = Array.isArray(req.body?.categories) ? req.body.categories : [];
  const categories = [...new Set(requested.map(value => String(value).trim()).filter(Boolean))].slice(0, 12);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || email.length > 254) {
    return res.status(400).json({error:"Enter a valid email address."});
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO subscribers(email,categories,status,source,created_at,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      categories=excluded.categories,status='active',updated_at=excluded.updated_at
  `).run(email, JSON.stringify(categories), "active", "homepage", now, now);
  let emailSent = false;
  try {
    await subscriptionEmail({email, categories});
    emailSent = true;
  } catch (error) {
    console.error("Subscription confirmation email could not be sent:", error.code, error.message, error.details || "");
  }
  res.status(201).json({
    ok:true,
    message:emailSent ? "You're subscribed. Check your inbox for confirmation." : "You're subscribed to the Daily Drop.",
    categories,
    emailSent
  });
});
app.post("/api/admin/refresh", admin, async (req,res) => { try { res.json(await refreshProducts(c)); } catch (error) { res.status(500).json({error:error.message}); } });
app.get("/go/:id", (req,res) => { const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id); if (!product) return res.sendStatus(404); db.prepare("INSERT INTO clicks(product_id,clicked_at,referrer,user_agent) VALUES(?,?,?,?)").run(product.id,new Date().toISOString(),req.get("referer")||"",req.get("user-agent")||""); res.redirect(302,product.affiliate_url); });
app.get("/admin", (req,res) => res.sendFile(path.join(publicDir,"admin.html")));

function backfillBrands() {
  const rows = db.prepare("SELECT id,title,description,brand,manufacturer FROM products WHERE status='published' AND (brand_slug IS NULL OR brand_slug='')").all();
  const update = db.prepare("UPDATE products SET brand=?,brand_slug=? WHERE id=?");
  db.transaction(() => { for (const row of rows) { const brand = normalizeBrand(detectBrand(row)); if (brand) update.run(brand, slugifyBrand(brand), row.id); } })();
  if (rows.length) console.log(`Brand intelligence reviewed ${rows.length} existing products`);
}

cron.schedule(c.refreshCron, () => refreshProducts(c).catch(error => console.error(error.message)), {timezone:c.timezone});
(async () => { backfillBrands(); if (!db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n) await refreshProducts(c).catch(console.error); app.listen(c.port, () => console.log(`http://localhost:${c.port}`)); })();
