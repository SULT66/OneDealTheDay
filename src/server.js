const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const Stripe = require("stripe");
const db = require("./db");
const c = require("./config");
const { refreshProducts, localDate } = require("./refresh");
const { detectBrand, normalizeBrand, slugifyBrand } = require("./brandDetector");
const { reasonFor } = require("./demoEditorial");
const { passwordResetEmail, subscriptionEmail, clubWaitlistEmail } = require("./mailer");
const { codes: marketCodes, normalizeMarket, market, marketFromIp, marketPath, alternateLinks } = require("./markets");

const app = express();
app.set("trust proxy", 1);
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");
const SITE = "https://www.onedailydrop.com";
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const stripePriceId = String(process.env.STRIPE_CLUB_PRICE_ID || "").trim();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const clubEnrollmentOpen = String(process.env.CLUB_ENROLLMENT_OPEN || "false").trim().toLowerCase() === "true";

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
app.use((req, res, next) => {
  const match = req.url.match(new RegExp(`^/(${marketCodes.join("|")})(?=/|\\?|$)`));
  if (!match || req.url === `/${match[1]}`) return next();
  req.market = normalizeMarket(match[1]);
  req.url = req.url.slice(match[0].length) || "/";
  next();
});
app.use((req, res, next) => {
  const legacyPages = {
    "/index.html": "/",
    "/about.html": "/about",
    "/contact.html": "/contact",
    "/privacy.html": "/privacy",
    "/terms.html": "/terms",
    "/affiliate-disclosure.html": "/affiliate-disclosure",
    "/editorial-policy.html": "/editorial-policy",
    "/how-we-select-deals.html": "/how-we-select-deals",
    "/price-disclaimer.html": "/price-disclaimer",
    "/club.html": "/club",
    "/account.html": "/account",
    "/admin.html": "/admin"
  };
  const legacyPath = req.path.replace(/^\/pages\//, "/");
  return legacyPages[legacyPath] ? res.redirect(301, legacyPages[legacyPath]) : next();
});
app.use(express.static(publicDir));

const authAttempts = new Map();
const authRateLimit = (req, res, next) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const recent = (authAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 12) return res.status(429).json({error:"Too many attempts. Please wait a few minutes and try again."});
  recent.push(now);
  authAttempts.set(key, recent);
  next();
};

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
const trustTitles = {
  "/about": "About | OneDailyDrop",
  "/contact": "Contact | OneDailyDrop",
  "/privacy": "Privacy Policy | OneDailyDrop",
  "/terms": "Terms of Use | OneDailyDrop",
  "/affiliate-disclosure": "Affiliate Disclosure | OneDailyDrop",
  "/editorial-policy": "Editorial Policy | OneDailyDrop",
  "/how-we-select-deals": "How We Select Deals | OneDailyDrop",
  "/price-disclaimer": "Price Disclaimer | OneDailyDrop"
};
Object.entries(trustPages).forEach(([route, file]) => app.get(route, (req, res) => {
  let html = fs.readFileSync(path.join(pagesDir, file), "utf8")
    .replace(/<title>[^<]*<\/title>/, `<title>${trustTitles[route]}</title>`);
  if (route === "/how-we-select-deals") {
    html = html.replace(
      /<article class="content-card">[\s\S]*?<\/article>/,
      `<article class="content-card"><h2>1. Eligibility checks</h2><p>A product must match the visitor’s country, be in stock, have a valid current price, a usable image, a working retailer or affiliate link, a rating of at least 3.8 and at least 25 reviews. Products that fail these checks are not ranked.</p><h2>2. OneDailyDrop Score</h2><p>Every eligible product is scored out of 100 using the same six-part framework.</p><ul><li><strong>Price quality and price history: 30 points.</strong> Tracked 30–90 day prices take priority; a retailer list price by itself receives limited credit.</li><li><strong>Product quality: 20 points.</strong></li><li><strong>Review confidence: 15 points.</strong></li><li><strong>Seller reliability: 15 points.</strong></li><li><strong>Demand and usefulness: 10 points.</strong></li><li><strong>Shipping and returns: 10 points.</strong></li></ul><h2>3. Minimum standard</h2><p>A live product must score at least 60 out of 100. We remove duplicate offers and keep the stronger offer when the same product appears at more than one retailer.</p><h2>4. Daily selection</h2><p>At 12:15 a.m. local time in each supported market, the highest eligible product becomes Today’s Drop and the next nine become 9 More Worth Seeing. Recent products are held back when enough fresh qualified products are available.</p><h2>5. Clear reasons</h2><p>The system saves the Score breakdown and a product-specific explanation based on the actual price, rating, review, seller and delivery evidence used for that selection.</p><h2>6. Ongoing checks</h2><p>Price and availability can be checked between daily rotations when live offer checking is enabled. Unavailable offers can be replaced without deleting the day’s other valid selections.</p><h2>7. Permanent history</h2><p>Each daily set is saved by country and date. Previous products remain in Past Drops with their original price, original Score and current status.</p><p class="updated">Last updated: July 27, 2026</p></article>`
    );
  }
  res.type("html").send(html);
}));
app.get("/club", (req, res) => res.sendFile(path.join(publicDir, "club.html")));
app.get("/account", (req, res) => res.set("X-Robots-Tag", "noindex, nofollow").sendFile(path.join(publicDir, "account.html")));
app.get("/reset-password", (req, res) => res.set("X-Robots-Tag", "noindex, nofollow").sendFile(path.join(publicDir, "account.html")));

app.post("/api/auth/register", authRateLimit, (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 2) return res.status(400).json({error:"Enter your name."});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return res.status(400).json({error:"Enter a valid email address."});
  const invalidPassword = passwordError(password);
  if (invalidPassword) return res.status(400).json({error:invalidPassword});
  try {
    const userMarket = marketFromIp(req).code;
    const result = db.prepare("INSERT INTO users(email,name,password_hash,membership,market,created_at) VALUES(?,?,?,?,?,?)")
      .run(email, name, passwordHash(password), "free", userMarket, new Date().toISOString());
    startSession(res, result.lastInsertRowid);
    res.status(201).json({user:{id:result.lastInsertRowid,email,name,membership:"free"}});
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({error:"An account with this email already exists."});
    throw error;
  }
});
app.post("/api/auth/login", authRateLimit, (req, res) => {
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
app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
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
app.post("/api/auth/reset-password", authRateLimit, (req, res) => {
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
  if (!clubEnrollmentOpen) return res.status(503).json({error:"Club enrollment is not open yet. Join the waitlist for launch news."});
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
app.post("/api/club/interest", authRateLimit, async (req, res) => {
  const selectedMarket = requestMarket(req);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || email.length > 254) {
    return res.status(400).json({error:"Enter a valid email address."});
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at)
    VALUES(?,?,'active','club-waitlist',?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      status='active',
      market=excluded.market,
      source=CASE
        WHEN instr(subscribers.source,'club-waitlist')>0 THEN subscribers.source
        WHEN subscribers.source='' THEN 'club-waitlist'
        ELSE subscribers.source||',club-waitlist'
      END,
      updated_at=excluded.updated_at
  `).run(email, "[]", selectedMarket.code, now, now);
  let emailSent = false;
  try {
    await clubWaitlistEmail({email});
    emailSent = true;
  } catch (error) {
    console.error("Club waitlist confirmation email could not be sent:", error.code, error.message, error.details || "");
  }
  return res.status(201).json({
    ok:true,
    message:emailSent ? "You're on the Club waitlist. Check your inbox." : "You're on the Club waitlist.",
    emailSent
  });
});
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
const dealPath = product => marketPath(product.market || "us", `/deal/${slug(product.title)}-${product.id}`);
const catPath = (value, code = "us") => marketPath(code, `/category/${slug(value)}`);
const brandPath = (value, code = "us") => marketPath(code, `/brand/${slugifyBrand(value)}`);
const money = (value, currency = "USD") => { const n = Number(value); if (!Number.isFinite(n)) return "Check latest price"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(n); } catch { return `$${n.toFixed(2)}`; } };
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (clean(product.retailer_name)) return clean(product.retailer_name); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };
const discountPercent = product => Number(product.original_price) > Number(product.current_price) ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const whyPicked = product => {
  if (String(product?.source || "").toLowerCase() === "demo") return reasonFor(product);
  if (clean(product.selection_reason)) return clean(product.selection_reason);
  const points = [];
  if (Number(product.rating) >= 4.5) points.push(`strong ${Number(product.rating).toFixed(1)}-star rating`);
  if (Number(product.review_count) >= 1000) points.push(`${Number(product.review_count).toLocaleString()}+ reviews`);
  if (Number(product.score) >= 80) points.push(`high OneDailyDrop Score of ${Math.round(Number(product.score))}`);
  if (discountPercent(product) > 0) points.push(`${discountPercent(product)}% verified price reduction`);
  return points.length
    ? `We selected this product for its ${points.join(", ")}.`
    : "We selected this product after reviewing its price, customer feedback, availability and overall value.";
};
const searchAliases = {cat:["cat","cats","pet","pets"],cats:["cat","cats","pet","pets"],dog:["dog","dogs","pet","pets"],dogs:["dog","dogs","pet","pets"],phone:["phone","phones","smartphone","smartphones","mobile"],tv:["tv","television","televisions"],car:["car","cars","automotive","auto"]};
const matchesSearch = (product, terms) => {
  const haystack = `${product.title || ""} ${product.description || ""} ${product.category || ""} ${product.brand || ""}`.toLowerCase();
  return terms.every(term => (searchAliases[term] || [term, term.endsWith("s") ? term.slice(0,-1) : `${term}s`]).some(candidate => haystack.includes(candidate)));
};

const requestMarket = req => req.market ? market(req.market) : marketFromIp(req);
const navCategories = code => db.prepare("SELECT DISTINCT category FROM products WHERE market=? AND status='published' AND category<>'' ORDER BY category").all(code).map(row => row.category);
const sharedHeader = code => {
  const home = marketPath(code);
  return `<header class="site-header"><div class="header-top"><a class="brand" href="${home}"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>The Best Deals. Every Day.</small></span></a><form class="header-search" action="${marketPath(code, "/search")}"><span aria-hidden="true">⌕</span><input name="q" type="search" placeholder="Search deals" aria-label="Search deals"></form><a class="header-subscribe" href="${home}#subscribe">Get Daily Drops</a><button id="themeToggle" class="theme-button" type="button" aria-label="Switch to dark mode" title="Dark mode"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">Dark</span></button><button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mainNavigation" aria-label="Open menu"><span></span><span></span><span></span></button></div><nav id="mainNavigation" class="main-nav" aria-label="Primary navigation"><a href="${home}">Today</a><div class="category-menu"><button type="button" aria-expanded="false">Categories <span>⌄</span></button><div class="mega-menu" hidden>${navCategories(code).map(category => `<a href="${catPath(category, code)}">${esc(category)}</a>`).join("")}</div></div><a href="${home}#trending">Trending</a><a href="${marketPath(code, "/archive")}">Past Drops</a><a href="/about">About</a></nav></header>`;
};
const sharedFooter = () => `<footer><div class="footer-brand"><b>OneDailyDrop</b><p>The Best Deals. Every Day.</p><div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate Disclosure</a><a href="/editorial-policy">Editorial Policy</a></div></div><p class="disclosure">Preview products and prices are sample data while OneDailyDrop is being built.</p></footer>`;
const shell = (title, description, canonical, body, schema = null, image = "", robots = "", code = "us") => {
  const pathname = (() => {
    try { return new URL(canonical).pathname.replace(new RegExp(`^/(${marketCodes.join("|")})`), "") || "/"; }
    catch { return ""; }
  })();
  const hasCountryAlternates = /^\/(?:archive|brands|category\/[^/]+)$/.test(pathname);
  const alternates = hasCountryAlternates ? alternateLinks(pathname) : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1020"><title>${esc(title)}</title><meta name="description" content="${esc(description.slice(0,160))}"><link rel="canonical" href="${canonical}">${alternates}${robots ? `<meta name="robots" content="${robots}">` : ""}<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0,180))}"><meta property="og:url" content="${canonical}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css?v=20260727-mobile-menu"><link rel="stylesheet" href="/brand-theme.css?v=20260724-theme-fix"><link rel="stylesheet" href="/liquid-glass.css?v=20260724-theme-fix">${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script>` : ""}</head><body>${sharedHeader(code)}${body}${sharedFooter()}<script src="/theme.js?v=20260724-search-scroll"></script><script src="/site-shell.js?v=20260727-mobile-menu"></script></body></html>`;
};

const productCard = (product, index = 0) => `<article class="card"><a class="image-wrap" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(shortTitle(product.title))}"></a><div class="card-content">${index ? `<span class="rank">#${index}</span>` : ""}${product.brand ? `<a class="eyebrow" href="${brandPath(product.brand, product.market)}">${esc(product.brand)}</a>` : ""}<h2 class="card-title"><a href="${dealPath(product)}">${esc(shortTitle(product.title))}</a></h2><p class="description">${esc(whyPicked(product))}</p><span class="price card-price">${money(product.current_price, product.currency)}</span><a class="button" href="${dealPath(product)}">View details</a></div></article>`;
const archiveCard = product => `<article class="archive-card"><a class="archive-card-media" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(shortTitle(product.title))}"></a><div class="archive-card-content">${product.category ? `<a class="eyebrow" href="${catPath(product.category, product.market)}">${esc(product.category)}</a>` : ""}<h2><a href="${dealPath(product)}">${esc(shortTitle(product.title))}</a></h2><p class="description">${esc(whyPicked(product))}</p><p class="archive-meta">Drop price ${money(product.drop_price ?? product.current_price, product.drop_currency || product.currency)} · Score ${Math.round(Number(product.drop_score ?? product.score) || 0)}/100</p><span class="archive-status">${esc(product.availability_status || "Available")}</span><a class="button" href="${dealPath(product)}">View details</a></div></article>`;
const findProduct = param => { const id = String(param).match(/-(\d+)$/)?.[1] || (/^\d+$/.test(param) ? param : null); return id ? db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(id) : null; };
const historyFor = id => db.prepare("SELECT price,original_price,currency,source,observed_at FROM price_history WHERE product_id=? ORDER BY observed_at ASC").all(id);
const minSince = (rows, days) => { const cutoff = Date.now() - days * 86400000; const values = rows.filter(row => new Date(row.observed_at).getTime() >= cutoff).map(row => Number(row.price)).filter(Number.isFinite); return values.length ? Math.min(...values) : null; };
const chartSvg = rows => { if (rows.length < 2) return "<p>Price tracking has started. A chart will appear after another price change is recorded.</p>"; const values = rows.map(row => Number(row.price)).filter(Number.isFinite); const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1); const points = values.map((value, index) => `${20 + (index / (values.length - 1)) * 560},${180 - ((value - min) / range) * 140}`).join(" "); return `<svg viewBox="0 0 600 210" role="img" aria-label="Price history chart" style="width:100%;max-width:760px"><line x1="20" y1="180" x2="580" y2="180" stroke="currentColor" opacity=".25"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4"/><text x="20" y="202" font-size="14">${esc(money(min, rows[0]?.currency))}</text><text x="500" y="24" font-size="14">${esc(money(max, rows[0]?.currency))}</text></svg>`; };

app.get("/deal/:slug", (req, res) => {
  const p = findProduct(req.params.slug);
  if (!p) return res.status(404).send("Product not found");
  const expectedPath = dealPath(p);
  if (String(req.originalUrl || "").split("?")[0] !== expectedPath) return res.redirect(301, expectedPath);
  const canonical = SITE + dealPath(p), title = shortTitle(p.title), description = clean(p.description) || whyPicked(p), store = storeName(p), category = p.category || "Deals";
  const history = historyFor(p.id), allLow = history.length ? Math.min(...history.map(row => Number(row.price)).filter(Number.isFinite)) : null, low30 = minSince(history, 30), low90 = minSince(history, 90);
  const related = p.brand_slug ? db.prepare("SELECT * FROM products WHERE market=? AND status='published' AND brand_slug=? AND id<>? ORDER BY score DESC LIMIT 4").all(p.market, p.brand_slug, p.id) : [];
  const productSchema = {"@context":"https://schema.org","@graph":[{"@type":"Product",name:title,brand:p.brand?{"@type":"Brand",name:p.brand}:undefined,manufacturer:p.manufacturer?{"@type":"Organization",name:p.manufacturer}:undefined,mpn:p.mpn||undefined,gtin:p.gtin||p.ean||p.upc||undefined,image:p.image_url?[p.image_url]:undefined,description,aggregateRating:Number(p.rating)?{"@type":"AggregateRating",ratingValue:Number(p.rating),reviewCount:Number(p.review_count||0)}:undefined,offers:{"@type":"Offer",url:canonical,priceCurrency:String(p.currency||"USD").toUpperCase(),price:Number(p.current_price)||undefined,availability:"https://schema.org/InStock",seller:{"@type":"Organization",name:store}}},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE+marketPath(p.market)},{"@type":"ListItem",position:2,name:category,item:SITE+catPath(category,p.market)},...(p.brand?[{"@type":"ListItem",position:3,name:p.brand,item:SITE+brandPath(p.brand,p.market)}]:[]),{"@type":"ListItem",position:p.brand?4:3,name:title,item:canonical}]}]};
  const brandBlock = p.brand ? `<p class="eyebrow">Brand: <a href="${brandPath(p.brand, p.market)}">${esc(p.brand)}</a></p>` : `<p class="eyebrow">${esc(store)}</p>`;
  const relatedBlock = related.length ? `<section class="deals-section"><div class="section-heading"><div><p class="eyebrow">MORE FROM THIS BRAND</p><h2>More ${esc(p.brand)} deals</h2></div><a href="${brandPath(p.brand, p.market)}">View all →</a></div><div class="grid">${related.map(product => productCard(product)).join("")}</div></section>` : "";
  const liveOffer = String(p.source || "").toLowerCase() !== "demo";
  const checkedAt = p.checked_at || p.updated_at;
  const checkedLabel = checkedAt && !Number.isNaN(new Date(checkedAt).getTime())
    ? new Date(checkedAt).toLocaleString("en-US")
    : "Recently";
  const retailerDetails = liveOffer ? `<div class="detail-grid retailer-detail-grid" aria-label="Retailer details"><section><h3>Retailer</h3><p>${esc(store)}</p></section><section><h3>Sold by</h3><p>${esc(clean(p.seller_name) || store)}</p></section><section><h3>Delivery</h3><p>${esc(clean(p.shipping_summary) || "Confirm at retailer")}</p></section><section><h3>Returns</h3><p>${esc(clean(p.return_summary) || "See retailer policy")}</p></section><section><h3>Availability</h3><p>${esc(clean(p.availability) || "Confirm at retailer")}</p></section><section><h3>Price checked</h3><p>${esc(checkedLabel)}</p></section></div>` : "";
  const body = `<main class="product-page"><nav class="breadcrumb"><a href="${marketPath(p.market)}">Home</a><span>›</span><a href="${catPath(category,p.market)}">${esc(category)}</a>${p.brand?`<span>›</span><a href="${brandPath(p.brand,p.market)}">${esc(p.brand)}</a>`:""}<span>›</span><span>${esc(title)}</span></nav><article class="product-detail"><div class="product-detail-media"><img src="${esc(p.image_url)}" alt="${esc(title)}"></div><div class="product-detail-content">${brandBlock}<h1>${esc(title)}</h1><div class="product-score"><strong>${Math.round(Number(p.score)||0)}/100</strong><span>OneDailyDrop Score</span></div><p class="product-lead">${esc(description)}</p><section class="editorial-box"><h2>Why we picked it</h2><p>${esc(whyPicked(p))}</p></section><div class="detail-grid"><section><h3>Current price</h3><p>${money(p.current_price,p.currency)}</p></section><section><h3>30-day low</h3><p>${money(low30,p.currency)}</p></section><section><h3>90-day low</h3><p>${money(low90,p.currency)}</p></section><section><h3>All-time tracked low</h3><p>${money(allLow,p.currency)}</p></section></div><section class="editorial-box"><h2>Price history</h2>${chartSvg(history)}<p>${history.length} tracked price observation${history.length===1?"":"s"}.</p></section><div class="product-price-box"><span class="product-price">${money(p.current_price,p.currency)}</span>${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}<small>Final price is confirmed on the retailer website.</small></div><a class="featured-button" href="${marketPath(p.market, `/go/${p.id}`)}" rel="nofollow sponsored">See deal on ${esc(store)} →</a></div></article>${relatedBlock}</main>`;
  const enrichedBody = body
    .replace('<section class="editorial-box"><h2>Price history</h2>', `${retailerDetails}<section id="price-history" class="editorial-box"><h2>Price history</h2>`)
    .replace(`See deal on ${esc(store)} →`, liveOffer ? `View Deal at ${esc(store)}` : "View details");
  res.send(shell(`${title} | OneDailyDrop`, description, canonical, enrichedBody, productSchema, p.image_url, "", p.market));
});

app.get("/category/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const all = db.prepare("SELECT * FROM products WHERE market=? AND status='published' ORDER BY score DESC,updated_at DESC").all(selectedMarket.code);
  const category = [...new Set(all.map(product => product.category).filter(Boolean))].find(value => slug(value) === req.params.slug);
  if (!category) return res.status(404).send("Category not found");
  const products = all.filter(product => product.category === category), canonical = SITE + catPath(category, selectedMarket.code), description = `Browse the best ${category} deals available in ${selectedMarket.name}, selected by OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:`Best ${category} Deals`,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))};
  const categoryTitle = category.toLowerCase() === "pets" ? "Pet" : category;
  const count = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  res.send(shell(`Best ${categoryTitle} Deals in ${selectedMarket.name} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} CATEGORY</p><h1>Best ${esc(categoryTitle)} Deals</h1></div><p class="result-count">${count}</p></div><div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div></section></main>`, schema, "", "", selectedMarket.code));
});

app.get("/search", (req, res) => {
  const selectedMarket = requestMarket(req);
  const query = clean(req.query.q).slice(0, 80);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = db.prepare("SELECT * FROM products WHERE market=? AND status='published' ORDER BY score DESC,updated_at DESC").all(selectedMarket.code);
  const products = query ? all.filter(product => matchesSearch(product, terms)) : [];
  const count = `${products.length} ${products.length === 1 ? "result" : "results"}`;
  const empty = query ? `No deals matched “${esc(query)}”. Try a product type, brand, or category.` : "Enter a product, brand, or category above.";
  const body = `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} SEARCH</p><h1>${query ? `Results for “${esc(query)}”` : "Search deals"}</h1></div><p class="result-count">${count}</p></div>${products.length ? `<div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div>` : `<div class="empty-state">${empty}<div class="empty-actions"><a class="primary-cta" href="${marketPath(selectedMarket.code)}">Back to today’s drop</a></div></div>`}</section></main>`;
  const canonicalPath = marketPath(selectedMarket.code, "/search");
  res.send(shell(`${query ? `${query} Deals in ${selectedMarket.name}` : `Search ${selectedMarket.name} Deals`} | OneDailyDrop`, `Search OneDailyDrop deals in ${selectedMarket.name}${query ? ` for ${query}` : ""}.`, `${SITE}${canonicalPath}${query ? `?q=${encodeURIComponent(query)}` : ""}`, body, null, "", "noindex,follow", selectedMarket.code));
});

app.get("/archive", (req, res) => {
  const selectedMarket = requestMarket(req);
  const today = localDate(selectedMarket.timezone);
  const products = db.prepare(`
    SELECT p.*,d.drop_date,d.rank,d.score AS drop_score,d.current_price AS drop_price,
      d.currency AS drop_currency,d.selection_reason AS daily_selection_reason,
      CASE
        WHEN LOWER(COALESCE(p.availability,'')) LIKE '%out of stock%' THEN 'Out of Stock'
        WHEN LOWER(COALESCE(p.availability,'')) LIKE '%unavailable%' THEN 'Deal Expired'
        WHEN p.current_price<>d.current_price THEN 'Price Changed'
        ELSE d.availability_status
      END AS availability_status
    FROM daily_drops d
    JOIN products p ON p.id=d.product_id
    WHERE d.market=? AND d.drop_date<?
    ORDER BY d.drop_date DESC,d.rank
    LIMIT 180
  `).all(selectedMarket.code, today).map(product => ({
    ...product,
    selection_reason: product.daily_selection_reason || product.selection_reason
  }));
  const groups = new Map();
  for (const product of products) {
    if (!groups.has(product.drop_date)) groups.set(product.drop_date, []);
    groups.get(product.drop_date).push(product);
  }
  const dates = [...groups.entries()].map(([dateValue, dailyProducts]) => {
    const label = new Date(`${dateValue}T12:00:00Z`).toLocaleDateString("en-US", {month:"long", day:"numeric", year:"numeric", timeZone:"UTC"});
    return `<article class="archive-row"><time datetime="${dateValue}">${label}</time><div class="archive-day-grid">${dailyProducts.map(archiveCard).join("")}</div></article>`;
  }).join("");
  const body = `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} ARCHIVE</p><h1>Past Drops</h1><p class="description">Every previous daily selection stays available with its original date, Score and current deal status.</p></div></div><div class="archive-list">${dates || '<div class="empty-state">The archive is being prepared.</div>'}</div></section></main>`;
  res.send(shell(`Past Drops in ${selectedMarket.name} | OneDailyDrop`, `Browse previous OneDailyDrop selections for ${selectedMarket.name}, including original Scores and current availability.`, `${SITE}${marketPath(selectedMarket.code, "/archive")}`, body, null, "", "", selectedMarket.code));
});

app.get("/brand/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const products = db.prepare("SELECT * FROM products WHERE market=? AND status='published' AND brand_slug=? ORDER BY score DESC,updated_at DESC").all(selectedMarket.code, req.params.slug);
  if (!products.length) return res.status(404).send("Brand not found");
  const brand = products[0].brand, canonical = SITE + brandPath(brand, selectedMarket.code), avgPrice = products.reduce((sum,p)=>sum+Number(p.current_price||0),0)/products.length, avgRating = products.reduce((sum,p)=>sum+Number(p.rating||0),0)/products.length, avgDiscount = products.reduce((sum,p)=>sum+discountPercent(p),0)/products.length;
  const description = `Browse ${products.length} ${brand} deals, price drops and top-rated products selected by OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"Brand",name:brand,url:canonical},{"@type":"ItemList",name:`Best ${brand} Deals`,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE},{"@type":"ListItem",position:2,name:"Brands",item:SITE+"/brands"},{"@type":"ListItem",position:3,name:brand,item:canonical}]}]};
  const stats = `<div class="detail-grid"><section><h3>Products</h3><p>${products.length}</p></section><section><h3>Average price</h3><p>${money(avgPrice,products[0].currency)}</p></section><section><h3>Average rating</h3><p>${avgRating.toFixed(1)} / 5</p></section><section><h3>Average discount</h3><p>${Math.round(avgDiscount)}%</p></section></div>`;
  res.send(shell(`${brand} Deals in ${selectedMarket.name} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="${marketPath(selectedMarket.code)}">Home</a><span>›</span><a href="${marketPath(selectedMarket.code, "/brands")}">Brands</a><span>›</span><span>${esc(brand)}</span></nav><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} BRAND</p><h1>${esc(brand)} Deals</h1><p>${esc(description)}</p></div></div>${stats}<div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div></section></main>`, schema, "", "", selectedMarket.code));
});

app.get("/brands", (req, res) => {
  const selectedMarket = requestMarket(req);
  const brands = db.prepare("SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating FROM products WHERE market=? AND status='published' AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC").all(selectedMarket.code);
  const canonical = SITE + marketPath(selectedMarket.code, "/brands"), description = `Explore popular brands and their best current deals in ${selectedMarket.name} on OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:"Popular Brands",itemListElement:brands.map((brand,index)=>({"@type":"ListItem",position:index+1,url:SITE+brandPath(brand.brand),name:brand.brand}))};
  const cards = brands.map(brand => `<article class="card"><div class="card-content"><p class="eyebrow">${brand.product_count} DEALS</p><h2><a href="${brandPath(brand.brand, selectedMarket.code)}">${esc(brand.brand)}</a></h2><p>Average price ${money(brand.avg_price, selectedMarket.currency)} · Rating ${Number(brand.avg_rating||0).toFixed(1)}</p></div></article>`).join("");
  res.send(shell(`Popular Brands in ${selectedMarket.name} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())}</p><h1>Popular Brands</h1></div><p class="result-count">${brands.length} brands</p></div><div class="grid">${cards}</div></section></main>`, schema, "", "", selectedMarket.code));
});

app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`));
app.get("/sitemap.xml", (req, res) => {
  const products = db.prepare("SELECT id,title,category,brand,brand_slug,market,updated_at FROM products WHERE status='published'").all();
  const urls = [];
  const localizedAlternates = pathname => marketCodes
    .map(code => `<xhtml:link rel="alternate" hreflang="${market(code).hreflang}" href="${SITE}${marketPath(code, pathname)}"/>`)
    .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${marketPath("us", pathname)}"/>`)
    .join("");
  for (const code of marketCodes) {
    const marketProducts = products.filter(product => product.market === code);
    const categories = [...new Set(marketProducts.map(product => product.category).filter(Boolean))];
    const brands = [...new Map(marketProducts.filter(product => product.brand_slug).map(product => [product.brand_slug, product.brand])).values()];
    urls.push({ loc: SITE + marketPath(code), alternates: localizedAlternates("/") });
    urls.push({ loc: SITE + marketPath(code, "/archive"), alternates: localizedAlternates("/archive") });
    urls.push({ loc: SITE + marketPath(code, "/brands"), alternates: localizedAlternates("/brands") });
    categories.forEach(value => urls.push({
      loc: SITE + catPath(value, code),
      alternates: localizedAlternates(`/category/${slug(value)}`)
    }));
    brands.forEach(value => urls.push({ loc: SITE + brandPath(value, code) }));
    marketProducts.forEach(product => urls.push({
      loc: SITE + dealPath(product),
      lastmod: product.updated_at
    }));
  }
  Object.keys(trustPages).forEach(pathname => urls.push({ loc: SITE + pathname }));
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.map(item => `<url><loc>${esc(item.loc)}</loc>${item.alternates || ""}${item.lastmod ? `<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`
  );
});

const admin = (req,res,next) => (req.headers["x-admin-key"] || req.query.key) === c.adminKey ? next() : res.status(401).json({error:"Unauthorized"});
app.get("/api/products", (req, res) => {
  const selectedMarket = normalizeMarket(req.query.market) || requestMarket(req).code;
  const params = [selectedMarket];
  const conditions = ["market=?", "status='published'"];
  if (req.query.brand) {
    conditions.push("brand_slug=?");
    params.push(slugifyBrand(req.query.brand));
  }
  if (req.query.category) {
    conditions.push("category=?");
    params.push(String(req.query.category));
  }
  const catalog = db.prepare(`SELECT * FROM products WHERE ${conditions.join(" AND ")} ORDER BY score DESC,updated_at DESC`).all(...params);
  const daily = db.prepare(`
    SELECT product_id,rank,selection_reason
    FROM daily_drops
    WHERE market=? AND drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=?)
  `).all(selectedMarket, selectedMarket);
  const dailyById = new Map(daily.map(row => [row.product_id, row]));
  const products = [...catalog].sort((left, right) => {
    const leftRank = dailyById.get(left.id)?.rank || Number.MAX_SAFE_INTEGER;
    const rightRank = dailyById.get(right.id)?.rank || Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || Number(right.score || 0) - Number(left.score || 0);
  });
  res.json(products.map(product => {
    const snapshot = dailyById.get(product.id);
    return {
      ...product,
      daily_rank: snapshot?.rank || null,
      selection_reason: snapshot?.selection_reason || product.selection_reason,
      slug: slug(product.title),
      deal_url: dealPath(product),
      category_url: catPath(product.category || "deals", selectedMarket),
      brand_url: product.brand ? brandPath(product.brand, selectedMarket) : null
    };
  }));
});
app.get("/api/brands", (req,res) => {
  const selectedMarket = normalizeMarket(req.query.market) || requestMarket(req).code;
  const brands = db.prepare("SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating,AVG(CASE WHEN original_price>current_price THEN (1-current_price/original_price)*100 ELSE 0 END) avg_discount FROM products WHERE market=? AND status='published' AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC").all(selectedMarket);
  res.json(brands.map(brand => ({...brand,url:brandPath(brand.brand, selectedMarket)})));
});
app.get("/api/brands/:slug", (req,res) => { const products = db.prepare("SELECT * FROM products WHERE status='published' AND brand_slug=? ORDER BY score DESC").all(req.params.slug); if (!products.length) return res.status(404).json({error:"Brand not found"}); const brand = products[0].brand; res.json({brand,slug:req.params.slug,url:brandPath(brand),summary:{products:products.length,average_price:products.reduce((s,p)=>s+Number(p.current_price||0),0)/products.length,average_rating:products.reduce((s,p)=>s+Number(p.rating||0),0)/products.length,average_discount:products.reduce((s,p)=>s+discountPercent(p),0)/products.length,total_clicks:db.prepare("SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE p.brand_slug=?").get(req.params.slug).n},products:products.map(p=>({...p,deal_url:dealPath(p)}))}); });
app.get("/api/products/:id/price-history", (req,res) => { const product = db.prepare("SELECT id,title,current_price,currency FROM products WHERE id=? AND status='published'").get(req.params.id); if (!product) return res.status(404).json({error:"Product not found"}); const history = historyFor(product.id); res.json({product,summary:{observations:history.length,lowest_30_days:minSince(history,30),lowest_90_days:minSince(history,90),lowest_ever:history.length?Math.min(...history.map(row=>Number(row.price)).filter(Number.isFinite)):null},history}); });
app.get("/api/status", (req,res) => res.json({provider:c.provider,products:db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n,brands:db.prepare("SELECT COUNT(DISTINCT brand_slug) n FROM products WHERE status='published' AND brand_slug<>''").get().n,clicks:db.prepare("SELECT COUNT(*) n FROM clicks").get().n,priceObservations:db.prepare("SELECT COUNT(*) n FROM price_history").get().n,lastRun:db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get()}));
app.post("/api/subscribe", async (req,res) => {
  const selectedMarket = requestMarket(req);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const requested = Array.isArray(req.body?.categories) ? req.body.categories : [];
  const categories = [...new Set(requested.map(value => String(value).trim()).filter(Boolean))].slice(0, 12);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || email.length > 254) {
    return res.status(400).json({error:"Enter a valid email address."});
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      categories=excluded.categories,status='active',market=excluded.market,updated_at=excluded.updated_at
  `).run(email, JSON.stringify(categories), "active", "homepage", selectedMarket.code, now, now);
  let emailSent = false;
  try {
    await subscriptionEmail({email, categories, market: selectedMarket.code});
    emailSent = true;
  } catch (error) {
    console.error("Subscription confirmation email could not be sent:", error.code, error.message, error.details || "");
  }
  res.status(201).json({
    ok:true,
    message:emailSent ? "You're subscribed. Check your inbox for confirmation." : "You're subscribed to the Daily Drop.",
    categories,
    market:selectedMarket.code,
    emailSent
  });
});
app.post("/api/admin/refresh", admin, async (req,res) => {
  try {
    const requestedMarket = normalizeMarket(req.query.market);
    res.json(await refreshProducts(c, requestedMarket ? {market:requestedMarket} : {}));
  } catch (error) {
    res.status(500).json({error:error.message});
  }
});
app.get("/go/:id", (req,res) => {
  const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id);
  if (!product) return res.sendStatus(404);
  if (String(product.source || "").toLowerCase() === "demo") return res.redirect(302, dealPath(product));
  db.prepare("INSERT INTO clicks(product_id,market,clicked_at,referrer,user_agent) VALUES(?,?,?,?,?)")
    .run(product.id, product.market || "us", new Date().toISOString(), req.get("referer") || "", req.get("user-agent") || "");
  res.redirect(302, product.affiliate_url);
});
app.get("/admin", (req,res) => {
  const html = fs.readFileSync(path.join(publicDir, "admin.html"), "utf8")
    .replace("<title>Admin</title>", "<title>Admin | OneDailyDrop</title>");
  res.set("X-Robots-Tag", "noindex, nofollow").type("html").send(html);
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({error:"Not found"});
  const selectedMarket = requestMarket(req);
  const body = `<main class="not-found"><p class="eyebrow">404 ERROR</p><h1>This drop got away.</h1><p>That page does not exist or may have moved. Let’s get you back to the deals.</p><div class="hero-actions"><a class="primary-cta" href="${marketPath(selectedMarket.code)}">Back to Today’s Drop</a><a class="secondary-cta" href="${marketPath(selectedMarket.code, "/search")}">Search deals</a></div></main>`;
  res.status(404).send(shell("Page Not Found | OneDailyDrop", "The requested OneDailyDrop page could not be found.", `${SITE}${req.originalUrl.split("?")[0]}`, body, null, "", "noindex,nofollow", selectedMarket.code));
});

function backfillBrands() {
  const rows = db.prepare("SELECT id,title,description,brand,manufacturer FROM products WHERE status='published' AND (brand_slug IS NULL OR brand_slug='')").all();
  const update = db.prepare("UPDATE products SET brand=?,brand_slug=? WHERE id=?");
  db.transaction(() => { for (const row of rows) { const brand = normalizeBrand(detectBrand(row)); if (brand) update.run(brand, slugifyBrand(brand), row.id); } })();
  if (rows.length) console.log(`Brand intelligence reviewed ${rows.length} existing products`);
}

for (const marketCode of c.markets) {
  const selectedMarket = c.marketConfig(marketCode);
  cron.schedule(
    c.refreshCron,
    () => refreshProducts(c, {market:marketCode}).catch(error => console.error(error.message)),
    {timezone:selectedMarket.timezone}
  );
  if (c.offerCheckEnabled) {
    cron.schedule(
      c.offerCheckCron,
      () => refreshProducts(c, {market:marketCode,preserveDailySelection:true}).catch(error => console.error(error.message)),
      {timezone:selectedMarket.timezone}
    );
  }
}
(async () => {
  backfillBrands();
  for (const marketCode of c.markets) {
    const count = db.prepare("SELECT COUNT(*) n FROM products WHERE market=? AND status='published'").get(marketCode).n;
    if (!count) await refreshProducts(c, {market:marketCode}).catch(console.error);
  }
  app.listen(c.port, () => console.log(`http://localhost:${c.port}`));
})();
