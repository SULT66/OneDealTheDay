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
const { localizeProduct } = require("./demoTranslations");
const { priceIntelligence } = require("./priceIntelligence");
const { sourceSql, isPublicSource } = require("./publicCatalog");
const { passwordResetEmail, subscriptionEmail, clubWaitlistEmail } = require("./mailer");
const { codes: marketCodes, normalizeMarket, market, marketFromIp, marketPath, alternateLinks } = require("./markets");
const {
  resolveLanguage,
  languageTag,
  clientCopy,
  localizeHtml,
  languageSwitcher,
  categoryLabel,
  marketName,
  t
} = require("./i18n");

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
app.use("/api", (req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use((req, res, next) => {
  const match = req.url.match(new RegExp(`^/(${marketCodes.join("|")})(?=/|\\?|$)`));
  if (!match || req.url === `/${match[1]}`) return next();
  req.market = normalizeMarket(match[1]);
  req.url = req.url.slice(match[0].length) || "/";
  next();
});
app.use((req, res, next) => {
  const marketCode = req.market || marketFromIp(req).code;
  resolveLanguage(req, res, marketCode);
  next();
});
app.use((req, res, next) => {
  if (req.method !== "GET" || req.market) return next();
  const regionalPages = /^\/(?:about|contact|privacy|terms|affiliate-disclosure|editorial-policy|how-we-select-deals|price-disclaimer|archive|brands|search|deal\/[^/]+|category\/[^/]+|brand\/[^/]+)\/?$/;
  if (!regionalPages.test(req.path)) return next();
  const destination = marketPath(marketFromIp(req).code, req.path);
  const queryIndex = String(req.originalUrl || "").indexOf("?");
  return res.redirect(301, `${destination}${queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ""}`);
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
  const selectedMarket = req.market ? market(req.market) : marketFromIp(req);
  const language = req.language || resolveLanguage(req, res, selectedMarket.code);
  const locale = languageTag(selectedMarket.code, language);
  const home = marketPath(selectedMarket.code);
  let html = fs.readFileSync(path.join(pagesDir, file), "utf8")
    .replace(/<title>[^<]*<\/title>/, `<title>${trustTitles[route]}</title>`);
  const pageTitle = trustTitles[route];
  const pageDescription = html.match(/<meta name="description" content="([^"]+)">/)?.[1] || "";
  const canonical = `${SITE}${route}`;
  const pageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "OneDailyDrop",
        url: SITE,
        logo: { "@type": "ImageObject", url: `${SITE}/favicon.svg` }
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "OneDailyDrop",
        publisher: { "@id": `${SITE}/#organization` }
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: pageTitle,
        description: pageDescription,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` }
      }
    ]
  };
  html = html.replace(
    "</head>",
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="OneDailyDrop"><meta property="og:title" content="${pageTitle}"><meta property="og:description" content="${pageDescription}"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${pageTitle}"><meta name="twitter:description" content="${pageDescription}"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g, "\\u003c")}</script><script>window.__ODD_LANGUAGE__=${JSON.stringify(language)};window.__ODD_LOCALE__=${JSON.stringify(locale)};window.__ODD_TEXT__=${JSON.stringify(clientCopy(language)).replace(/</g, "\\u003c")};</script></head>`
  );
  if (route === "/how-we-select-deals") {
    html = html.replace(
      /<article class="content-card">[\s\S]*?<\/article>/,
      `<article class="content-card"><h2>1. Editorial eligibility</h2><p>Every published item must be a real product for the visitor’s market, have a working retailer link and offer a clear, practical reason for inclusion. We do not invent prices, ratings, review counts or availability.</p><h2>2. Selection before live data</h2><p>When an approved retailer feed is not yet available, editors assess usefulness, product fit, brand confidence and how clearly the item solves an everyday need. The retailer remains the source for the current price and availability.</p><h2>3. Data-backed scoring</h2><p>When an approved API or feed supplies enough current evidence, OneDailyDrop can calculate and display a Score using price quality, product quality, review confidence, seller reliability, usefulness, shipping and returns. Missing evidence is never converted into a made-up value.</p><h2>4. Market-specific offers</h2><p>Products, currencies, retailer links and availability are kept separate by country. An offer is published only in markets supported by its source.</p><h2>5. Daily selection</h2><p>The strongest eligible item becomes Today’s Drop and additional worthwhile products may appear below it. Editorial judgment and verifiable shopper value determine placement; commission rate does not.</p><h2>6. Ongoing checks</h2><p>Approved feeds may refresh price and availability automatically. If a check expires, fails or reports an unavailable product, the site stops presenting that data as current and directs the shopper to confirm with the retailer.</p><h2>7. Corrections and history</h2><p>Material errors are corrected promptly. Past Drops retain their editorial history while clearly distinguishing historical information from a retailer’s current offer.</p><p class="updated">Last updated: July 30, 2026</p></article>`
    );
  }
  html = localizeHtml(html, language)
    .replace(/<html lang="[^"]+">/, `<html lang="${locale}">`)
    .replace(/href="\/"/g, `href="${home}"`)
    .replace(
      '<button id="themeToggle"',
      `${languageSwitcher(req, selectedMarket.code, language)}<button id="themeToggle"`
    )
    .replace("</head>", '<link rel="stylesheet" href="/cookie-consent.css?v=20260730"></head>')
    .replace("</body>", '<script src="/cookie-consent.js?v=20260730"></script></body>');
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
    return res.status(400).json({error:t(req.language, "form.validEmail")});
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
const dealPath = product => marketPath(product.market || "us", `/deal/${slug(product.canonical_title || product.title)}-${product.id}`);
const catPath = (value, code = "us") => marketPath(code, `/category/${slug(value)}`);
const brandPath = (value, code = "us") => marketPath(code, `/brand/${slugifyBrand(value)}`);
const money = (value, currency = "USD", locale = "en-US") => { if (value == null || value === "") return "Check current price on Amazon"; const n = Number(value); if (!Number.isFinite(n)) return "Check current price on Amazon"; try { return new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(n); } catch { return `$${n.toFixed(2)}`; } };
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (clean(product.retailer_name)) return clean(product.retailer_name); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };
const hasCurrentOffer = product => Number(product?.current_price) > 0 &&
  /^[A-Z]{3}$/.test(String(product?.currency || "").toUpperCase()) &&
  Boolean(clean(product?.checked_at));
const hasRetailerImage = product => Boolean(clean(product?.image_url)) &&
  !/product-placeholder\.svg(?:$|\?)/i.test(String(product.image_url));
const discountPercent = product => Number(product.original_price) > Number(product.current_price) ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const whyPicked = (product, language = "en") => {
  if (String(product?.source || "").toLowerCase() === "demo") return clean(product.description) || reasonFor(product);
  if (clean(product.selection_reason)) return clean(product.selection_reason);
  const points = [];
  if (Number(product.rating) >= 4.5) points.push(t(language, "product.ratingReason", { rating: Number(product.rating).toFixed(1) }));
  if (Number(product.review_count) >= 1000) points.push(t(language, "product.reviewsReason", { count: Number(product.review_count).toLocaleString(languageTag(product.market, language)) }));
  if (Number(product.score) >= 80) points.push(t(language, "product.scoreReason", { score: Math.round(Number(product.score)) }));
  if (discountPercent(product) > 0) points.push(t(language, "product.discountReason", { percent: discountPercent(product) }));
  return points.length
    ? t(language, "product.reasonSentence", { reasons: points.join(", ") })
    : t(language, "product.selectedFallback");
};
const searchAliases = {cat:["cat","cats","pet","pets"],cats:["cat","cats","pet","pets"],dog:["dog","dogs","pet","pets"],dogs:["dog","dogs","pet","pets"],phone:["phone","phones","smartphone","smartphones","mobile"],tv:["tv","television","televisions"],car:["car","cars","automotive","auto"]};
const matchesSearch = (product, terms) => {
  const haystack = `${product.title || ""} ${product.description || ""} ${product.category || ""} ${product.brand || ""}`.toLowerCase();
  return terms.every(term => (searchAliases[term] || [term, term.endsWith("s") ? term.slice(0,-1) : `${term}s`]).some(candidate => haystack.includes(candidate)));
};

const requestMarket = req => req.market ? market(req.market) : marketFromIp(req);
const navCategories = code => db.prepare(`SELECT DISTINCT category FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND category<>'' ORDER BY category`).all(code).map(row => row.category);
const sharedHeader = (code, language = "en", req = null) => {
  const home = marketPath(code);
  return `<header class="site-header"><div class="header-top"><a class="brand" href="${home}"><span class="brand-mark" aria-hidden="true"><img src="/header-bag.svg?v=20260731-larger-bag" alt=""></span><span class="brand-copy"><strong><span>OneDaily</span><span class="brand-drop">Drop</span></strong><small>${esc(t(language,"brand.seoTagline"))}</small></span></a><form class="header-search" action="${marketPath(code, "/search")}"><span aria-hidden="true">⌕</span><input name="q" type="search" placeholder="${esc(t(language,"search.short"))}" aria-label="${esc(t(language,"search.short"))}"></form><a class="header-subscribe" href="${home}#subscribe">${esc(t(language,"nav.subscribe"))}</a><button id="themeToggle" class="theme-button" type="button" aria-label="${esc(t(language,"theme.toDark"))}" title="${esc(t(language,"theme.dark"))}"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">${esc(t(language,"theme.dark"))}</span></button>${req ? languageSwitcher(req, code, language) : ""}<button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mainNavigation" aria-label="${esc(t(language,"menu.open"))}"><span></span><span></span><span></span></button></div><nav id="mainNavigation" class="main-nav" aria-label="${esc(t(language,"nav.primary"))}"><a href="${home}">${esc(t(language,"nav.todayShort"))}</a><div class="category-menu"><button type="button" aria-expanded="false">${esc(t(language,"nav.categories"))} <span>⌄</span></button><div class="mega-menu" hidden>${navCategories(code).map(category => `<a href="${catPath(category, code)}">${esc(categoryLabel(category, language))}</a>`).join("")}</div></div><a href="${home}#trending">${esc(t(language,"nav.trending"))}</a><a href="${marketPath(code, "/archive")}">${esc(t(language,"nav.archive"))}</a><a href="${marketPath(code, "/about")}">${esc(t(language,"nav.about"))}</a></nav></header>`;
};
const sharedFooter = (code, language = "en") => `<footer><div class="footer-brand"><b>OneDailyDrop</b><p>${esc(t(language,"brand.seoTagline"))}</p><div class="footer-links"><a href="${marketPath(code, "/about")}">${esc(t(language,"footer.about"))}</a><a href="${marketPath(code, "/contact")}">${esc(t(language,"footer.contact"))}</a><a href="${marketPath(code, "/privacy")}">${esc(t(language,"footer.privacy"))}</a><a href="${marketPath(code, "/terms")}">${esc(t(language,"footer.terms"))}</a><a href="${marketPath(code, "/affiliate-disclosure")}">${esc(t(language,"footer.affiliate"))}</a><a href="${marketPath(code, "/editorial-policy")}">${esc(t(language,"footer.editorial"))}</a></div></div><p class="disclosure">${esc(t(language,"footer.preview"))}</p></footer>`;
const shell = (title, description, canonical, body, schema = null, image = "", robots = "", code = "us", alternateCodes = marketCodes, req = null) => {
  const selectedMarket = market(code);
  const language = req?.language || "en";
  const locale = languageTag(code, language);
  const pathname = (() => {
    try { return new URL(canonical).pathname.replace(new RegExp(`^/(${marketCodes.join("|")})`), "") || "/"; }
    catch { return ""; }
  })();
  const hasCountryAlternates = /^\/(?:archive|brands|category\/[^/]+)$/.test(pathname);
  const alternates = hasCountryAlternates ? alternateLinks(pathname, alternateCodes) : "";
  const robotsContent = robots || "index,follow,max-image-preview:large";
  const ogLocale = locale.replace("-", "_");
  const suppliedNodes = schema
    ? (Array.isArray(schema["@graph"])
      ? schema["@graph"]
      : [{ ...schema, "@context": undefined }])
    : [];
  const pageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "OneDailyDrop",
        url: SITE,
        logo: { "@type": "ImageObject", url: `${SITE}/favicon.svg` }
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "OneDailyDrop",
        publisher: { "@id": `${SITE}/#organization` }
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` }
      },
      ...suppliedNodes
    ]
  };
  const ogType = suppliedNodes.some(node => node?.["@type"] === "Product") ? "product" : "website";
  const html = `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1020"><title>${esc(title)}</title><meta name="description" content="${esc(description.slice(0,160))}"><meta name="robots" content="${esc(robotsContent)}"><link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml">${alternates}<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="OneDailyDrop"><meta property="og:locale" content="${esc(ogLocale)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0,180))}"><meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(title)}">` : ""}<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description.slice(0,180))}">${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}<link rel="stylesheet" href="/styles.css?v=20260731-brand-lockup"><link rel="stylesheet" href="/brand-theme.css?v=20260731-brand-lockup"><link rel="stylesheet" href="/liquid-glass.css?v=20260731-brand-lockup"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g,"\\u003c")}</script><script>window.__ODD_LANGUAGE__=${JSON.stringify(language)};window.__ODD_LOCALE__=${JSON.stringify(locale)};window.__ODD_TEXT__=${JSON.stringify(clientCopy(language)).replace(/</g, "\\u003c")};</script></head><body>${sharedHeader(code, language, req)}${body}${sharedFooter(code, language)}<script src="/theme.js?v=20260728-i18n2"></script><script src="/site-shell.js?v=20260728-i18n2"></script></body></html>`;
  return localizeHtml(html, language);
};

const productCard = (product, index = 0, language = "en") => {
  const display = localizeProduct(product, language);
  return `<article class="card"><a class="image-wrap" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}"></a><div class="card-content">${index ? `<span class="rank">#${index}</span>` : ""}${product.brand ? `<a class="eyebrow" href="${brandPath(product.brand, product.market)}">${esc(product.brand)}</a>` : ""}<h2 class="card-title"><a href="${dealPath(product)}">${esc(shortTitle(display.title))}</a></h2><p class="description">${esc(whyPicked(display, language))}</p><span class="price card-price">${money(product.current_price, product.currency, languageTag(product.market, language))}</span><a class="button" href="${dealPath(product)}">View details</a></div></article>`;
};
const archiveCard = (product, language = "en") => {
  const display = localizeProduct(product, language);
  return `<article class="archive-card"><a class="archive-card-media" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}"></a><div class="archive-card-content">${product.category ? `<a class="eyebrow" href="${catPath(product.category, product.market)}">${esc(categoryLabel(product.category, language))}</a>` : ""}<h2><a href="${dealPath(product)}">${esc(shortTitle(display.title))}</a></h2><p class="description">${esc(whyPicked(display, language))}</p><p class="archive-meta">Drop price ${money(product.drop_price ?? product.current_price, product.drop_currency || product.currency, languageTag(product.market, language))} · Score ${Math.round(Number(product.drop_score ?? product.score) || 0)}/100</p><span class="archive-status">${esc(product.availability_status || "Available")}</span><a class="button" href="${dealPath(product)}">View details</a></div></article>`;
};
const findProduct = param => { const id = String(param).match(/-(\d+)$/)?.[1] || (/^\d+$/.test(param) ? param : null); return id ? db.prepare(`SELECT * FROM products WHERE id=? AND status='published' AND ${sourceSql()}`).get(id) : null; };
const historyFor = id => db.prepare("SELECT price,original_price,currency,source,observed_at FROM price_history WHERE product_id=? ORDER BY observed_at ASC").all(id);
const chartSvg = (rows, language = "en", marketCode = "us") => { if (rows.length < 2) return `<p>${esc(t(language,"page.trackingStarted"))}</p>`; const values = rows.map(row => Number(row.price)).filter(Number.isFinite); const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1); const points = values.map((value, index) => `${20 + (index / (values.length - 1)) * 560},${180 - ((value - min) / range) * 140}`).join(" "); const locale = languageTag(marketCode, language); return `<svg viewBox="0 0 600 210" role="img" aria-label="${esc(t(language,"page.priceChart"))}" style="width:100%;max-width:760px"><line x1="20" y1="180" x2="580" y2="180" stroke="currentColor" opacity=".25"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4"/><text x="20" y="202" font-size="14">${esc(money(min, rows[0]?.currency, locale))}</text><text x="500" y="24" font-size="14">${esc(money(max, rows[0]?.currency, locale))}</text></svg>`; };
const offerAvailability = value => {
  const text = String(value || "").toLowerCase();
  if (/in stock|available|ships|delivery/.test(text) && !/out of stock|unavailable|sold out|expired|discontinued/.test(text)) return "https://schema.org/InStock";
  if (/out of stock|sold out/.test(text)) return "https://schema.org/OutOfStock";
  if (/pre.?order/.test(text)) return "https://schema.org/PreOrder";
  return "";
};
const sendNotFound = (req, res) => {
  const selectedMarket = requestMarket(req);
  const body = `<main class="not-found"><p class="eyebrow">404 ERROR</p><h1>This drop got away.</h1><p>That page does not exist or may have moved. Let’s get you back to the deals.</p><div class="hero-actions"><a class="primary-cta" href="${marketPath(selectedMarket.code)}">Back to Today’s Drop</a><a class="secondary-cta" href="${marketPath(selectedMarket.code, "/search")}">Search deals</a></div></main>`;
  const requestedPath = String(req.originalUrl || "/").split("?")[0];
  return res.status(404).send(shell("Page Not Found | OneDailyDrop", "The requested OneDailyDrop page could not be found.", `${SITE}${requestedPath}`, body, null, "", "noindex,nofollow", selectedMarket.code, marketCodes, req));
};

app.get("/deal/:slug", (req, res) => {
  const p = findProduct(req.params.slug);
  if (!p) {
    const selectedMarket = requestMarket(req);
    const body = `<main class="not-found"><p class="eyebrow">410 GONE</p><h1>${esc(t(req.language, "page.notFoundTitle"))}</h1><p>${esc(t(req.language, "page.notFoundText"))}</p><div class="hero-actions"><a class="primary-cta" href="${marketPath(selectedMarket.code)}">${esc(t(req.language, "page.backToday"))}</a></div></main>`;
    const requestedPath = String(req.originalUrl || "/").split("?")[0];
    res.set("X-Robots-Tag", "noindex, nofollow");
    return res.status(410).send(shell("Removed Drop | OneDailyDrop", "This product page has been permanently removed.", `${SITE}${requestedPath}`, body, null, "", "noindex,nofollow", selectedMarket.code, marketCodes, req));
  }
  const expectedPath = dealPath(p);
  if (String(req.originalUrl || "").split("?")[0] !== expectedPath) return res.redirect(301, expectedPath);
  const display = localizeProduct(p, req.language);
  const canonical = SITE + dealPath(p), title = shortTitle(display.title), description = clean(display.description) || whyPicked(display, req.language), store = storeName(p), category = p.category || "Deals";
  const displayCategory = categoryLabel(category, req.language);
  const pageLocale = languageTag(p.market, req.language);
  const history = historyFor(p.id), intelligence = priceIntelligence(history);
  const low30 = intelligence.day30.sufficient ? intelligence.day30.low : null;
  const low90 = intelligence.day90.sufficient ? intelligence.day90.low : null;
  const allLow = intelligence.allTime.sufficient ? intelligence.allTime.low : null;
  const related = p.brand_slug ? db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug=? AND id<>? ORDER BY score DESC LIMIT 4`).all(p.market, p.brand_slug, p.id) : [];
  const liveOffer = String(p.source || "").toLowerCase() !== "demo";
  const availability = offerAvailability(p.availability);
  const validOffer = liveOffer && /^https?:\/\//i.test(String(p.affiliate_url || "")) &&
    Number(p.current_price) > 0 && /^[A-Z]{3}$/.test(String(p.currency || "").toUpperCase()) && availability;
  const productNode = {"@type":"Product","@id":`${canonical}#product`,url:canonical,sku:String(p.provider_external_id||p.external_id||p.id),name:title,category:displayCategory,brand:p.brand?{"@type":"Brand",name:p.brand}:undefined,manufacturer:p.manufacturer?{"@type":"Organization",name:p.manufacturer}:undefined,mpn:p.mpn||undefined,gtin:p.gtin||p.ean||p.upc||undefined,image:p.image_url?[p.image_url]:undefined,description,aggregateRating:Number(p.rating)>0&&Number(p.review_count)>0?{"@type":"AggregateRating",ratingValue:Number(p.rating),reviewCount:Number(p.review_count),bestRating:5,worstRating:1}:undefined};
  if (validOffer) productNode.offers = {"@type":"Offer",url:canonical,priceCurrency:String(p.currency).toUpperCase(),price:Number(p.current_price),availability,itemCondition:"https://schema.org/NewCondition",seller:{"@type":"Organization",name:store}};
  const productSchema = {"@context":"https://schema.org","@graph":[productNode,{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:t(req.language,"page.home"),item:SITE+marketPath(p.market)},{"@type":"ListItem",position:2,name:displayCategory,item:SITE+catPath(category,p.market)},...(p.brand?[{"@type":"ListItem",position:3,name:p.brand,item:SITE+brandPath(p.brand,p.market)}]:[]),{"@type":"ListItem",position:p.brand?4:3,name:title,item:canonical}]}]};
  const brandBlock = p.brand ? `<p class="eyebrow">Brand: <a href="${brandPath(p.brand, p.market)}">${esc(p.brand)}</a></p>` : `<p class="eyebrow">${esc(store)}</p>`;
  const relatedBlock = related.length ? `<section class="deals-section"><div class="section-heading"><div><p class="eyebrow">MORE FROM THIS BRAND</p><h2>More ${esc(p.brand)} deals</h2></div><a href="${brandPath(p.brand, p.market)}">View all →</a></div><div class="grid">${related.map(product => productCard(product, 0, req.language)).join("")}</div></section>` : "";
  const checkedAt = p.checked_at || p.updated_at;
  const checkedLabel = checkedAt && !Number.isNaN(new Date(checkedAt).getTime())
    ? new Date(checkedAt).toLocaleString(pageLocale)
    : "Recently";
  const currentOffer = hasCurrentOffer(p);
  const retailerDetails = liveOffer ? `<div class="detail-grid retailer-detail-grid" aria-label="${esc(t(req.language,"product.offerDetails"))}"><section><h3>${esc(t(req.language,"product.retailer"))}</h3><p>${esc(store)}</p></section><section><h3>${esc(t(req.language,"product.soldBy"))}</h3><p>${esc(clean(p.seller_name) || t(req.language,"product.confirmRetailer"))}</p></section><section><h3>${esc(t(req.language,"product.delivery"))}</h3><p>${esc(clean(p.shipping_summary) || t(req.language,"product.confirmRetailer"))}</p></section><section><h3>${esc(t(req.language,"product.returns"))}</h3><p>${esc(clean(p.return_summary) || t(req.language,"product.retailerPolicy"))}</p></section><section><h3>${esc(t(req.language,"page.availability"))}</h3><p>${esc(clean(p.availability) || t(req.language,"product.confirmRetailer"))}</p></section>${currentOffer ? `<section><h3>${esc(t(req.language,"page.priceChecked"))}</h3><p>${esc(checkedLabel)}</p></section>` : ""}</div>` : "";
  const historyLabel = stats => stats.sufficient ? money(stats.low,p.currency,pageLocale) : t(req.language,"page.notEnoughHistory");
  const ratingSummary = Number(p.rating)>0&&Number(p.review_count)>0
    ? `<section><h3>Customer rating</h3><p>${esc(t(req.language,"product.ratingSummary",{rating:Number(p.rating).toFixed(1),count:Number(p.review_count).toLocaleString(pageLocale)}))}</p></section>`
    : "";
  const scoreBlock = Number(p.score) > 0 && currentOffer ? `<div class="product-score"><strong>${Math.round(Number(p.score))}/100</strong><span>OneDailyDrop ${esc(t(req.language,"product.score"))}</span></div>` : "";
  const priceDetails = !currentOffer
    ? `<div class="detail-grid"><section><h3>${esc(t(req.language,"product.currentPrice"))}</h3><p>${esc(t(req.language,"product.checkPrice"))} ${esc(store)}</p></section></div>`
    : `<div class="detail-grid"><section><h3>${esc(t(req.language,"product.currentPrice"))}</h3><p>${money(p.current_price,p.currency,pageLocale)}</p></section>${ratingSummary}<section><h3>${esc(t(req.language,"page.low30"))}</h3><p>${historyLabel(intelligence.day30)}</p></section><section><h3>${esc(t(req.language,"page.low90"))}</h3><p>${historyLabel(intelligence.day90)}</p></section><section><h3>${esc(t(req.language,"page.lowAll"))}</h3><p>${historyLabel(intelligence.allTime)}</p></section></div><section id="price-history" class="editorial-box">${retailerDetails}<h2>${esc(t(req.language,"page.priceHistory"))}</h2>${chartSvg(history,req.language,p.market)}<p>${esc(t(req.language,"page.historySummary",{observations:history.length,days:intelligence.allTime.distinctDays}))}</p></section>`;
  const body = `<main class="product-page"><nav class="breadcrumb"><a href="${marketPath(p.market)}">${esc(t(req.language,"page.home"))}</a><span>›</span><a href="${catPath(category,p.market)}">${esc(displayCategory)}</a>${p.brand?`<span>›</span><a href="${brandPath(p.brand,p.market)}">${esc(p.brand)}</a>`:""}<span>›</span><span>${esc(title)}</span></nav><article class="product-detail"><div class="product-detail-media"><img src="${esc(p.image_url)}" alt="${esc(hasRetailerImage(p) ? title : `${store} ${t(req.language,"product.editorPick")}`)}" decoding="async"></div><div class="product-detail-content">${brandBlock}<h1>${esc(title)}</h1>${scoreBlock}<p class="product-lead">${esc(description)}</p><section class="editorial-box"><h2>${esc(t(req.language,"page.whyPicked"))}</h2><p>${esc(whyPicked(display, req.language))}</p></section>${priceDetails}<div class="product-price-box"><span class="product-price">${currentOffer ? money(p.current_price,p.currency,pageLocale) : `${esc(t(req.language,"product.checkPrice"))} ${esc(store)}`}</span>${currentOffer && p.original_price?`<span class="old">${money(p.original_price,p.currency,pageLocale)}</span>`:""}<small>${esc(t(req.language,"page.finalPrice"))}</small></div><a class="featured-button" href="${marketPath(p.market, `/go/${p.id}`)}" rel="nofollow sponsored">${esc(t(req.language,"product.viewDealAt",{store}))} →</a></div></article>${relatedBlock}</main>`;
  const enrichedBody = currentOffer ? body : body.replace('<div class="product-price-box">', `${retailerDetails}<div class="product-price-box">`);
  res.send(shell(`${title} | OneDailyDrop`, description, canonical, enrichedBody, productSchema, p.image_url, "", p.market, marketCodes, req));
});

app.get("/category/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const localizedMarketName = marketName(selectedMarket.code, req.language);
  const all = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} ORDER BY score DESC,updated_at DESC`).all(selectedMarket.code);
  const category = [...new Set(all.map(product => product.category).filter(Boolean))].find(value => slug(value) === req.params.slug);
  if (!category) return sendNotFound(req, res);
  const products = all.filter(product => product.category === category), canonical = SITE + catPath(category, selectedMarket.code);
  const categoryTitle = categoryLabel(category.toLowerCase() === "pets" ? "Pets" : category, req.language);
  const description = t(req.language, "seo.categoryDescription", { category: categoryTitle, country: localizedMarketName });
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"ItemList",name:t(req.language,"seo.categoryHeading",{category:categoryTitle}),numberOfItems:products.length,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(localizeProduct(product,req.language).title)}))},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:t(req.language,"page.home"),item:SITE+marketPath(selectedMarket.code)},{"@type":"ListItem",position:2,name:categoryTitle,item:canonical}]}]};
  const count = t(req.language, "search.products", { count: products.length });
  const prices = products.map(product => Number(product.current_price)).filter(value => Number.isFinite(value) && value > 0);
  const ratings = products.map(product => Number(product.rating)).filter(value => Number.isFinite(value) && value > 0);
  const pageLocale = languageTag(selectedMarket.code, req.language);
  const priceRange = prices.length ? `${money(Math.min(...prices), selectedMarket.currency, pageLocale)} – ${money(Math.max(...prices), selectedMarket.currency, pageLocale)}` : "Check current offers";
  const averageRating = ratings.length ? `${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)} / 5` : "Not yet available";
  const categorySummary = `<div class="detail-grid"><section><h2>Products checked</h2><p>${products.length}</p></section><section><h2>Current price range</h2><p>${esc(priceRange)}</p></section><section><h2>Average rating</h2><p>${esc(averageRating)}</p></section></div><section class="editorial-box"><h2>${esc(t(req.language,"page.howSelectCategory",{category:categoryTitle.toLowerCase()}))}</h2><p>${esc(t(req.language,"page.categoryMethod",{country:localizedMarketName}))}</p></section>`;
  const alternateCodes = marketCodes.filter(code => db.prepare(`SELECT 1 FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND category=? LIMIT 1`).get(code, category));
  res.send(shell(t(req.language,"seo.categoryTitle",{category:categoryTitle,country:localizedMarketName}), description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="${marketPath(selectedMarket.code)}">Home</a><span>›</span><span>${esc(t(req.language,"seo.categoryHeading",{category:categoryTitle}))}</span></nav><div class="section-heading"><div><p class="eyebrow">${esc(localizedMarketName.toUpperCase())} · ${esc(t(req.language,"nav.categories").toUpperCase())}</p><h1>${esc(t(req.language,"seo.categoryHeading",{category:categoryTitle}))}</h1><p>${esc(description)}</p></div><p class="result-count">${count}</p></div>${categorySummary}<div class="grid">${products.map((product,index)=>productCard(product,index+1,req.language)).join("")}</div></section></main>`, schema, "", "", selectedMarket.code, alternateCodes, req));
});

app.get("/search", (req, res) => {
  const selectedMarket = requestMarket(req);
  const query = clean(req.query.q).slice(0, 80);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} ORDER BY score DESC,updated_at DESC`).all(selectedMarket.code);
  const products = query ? all.filter(product => matchesSearch(product, terms)) : [];
  const count = t(req.language, "search.found", { count: products.length });
  const empty = query ? `No deals matched “${esc(query)}”. Try a product type, brand, or category.` : "Enter a product, brand, or category above.";
  const body = `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(marketName(selectedMarket.code, req.language).toUpperCase())} · ${esc(t(req.language,"search.results").toUpperCase())}</p><h1>${query ? `${esc(t(req.language,"search.results"))}: “${esc(query)}”` : esc(t(req.language,"search.short"))}</h1></div><p class="result-count">${count}</p></div>${products.length ? `<div class="grid">${products.map((product,index)=>productCard(product,index+1,req.language)).join("")}</div>` : `<div class="empty-state">${empty}<div class="empty-actions"><a class="primary-cta" href="${marketPath(selectedMarket.code)}">Back to today’s drop</a></div></div>`}</section></main>`;
  const canonicalPath = marketPath(selectedMarket.code, "/search");
  res.send(shell(`${query ? `${query} Deals in ${selectedMarket.name}` : `Search ${selectedMarket.name} Deals`} | OneDailyDrop`, `Search OneDailyDrop deals in ${selectedMarket.name}${query ? ` for ${query}` : ""}.`, `${SITE}${canonicalPath}${query ? `?q=${encodeURIComponent(query)}` : ""}`, body, null, "", "noindex,follow", selectedMarket.code, marketCodes, req));
});

app.get("/archive", (req, res) => {
  const selectedMarket = requestMarket(req);
  const pageLocale = languageTag(selectedMarket.code, req.language);
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
    WHERE d.market=? AND d.drop_date<? AND ${sourceSql("p")}
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
    const label = new Date(`${dateValue}T12:00:00Z`).toLocaleDateString(pageLocale, {month:"long", day:"numeric", year:"numeric", timeZone:"UTC"});
    return `<article class="archive-row"><time datetime="${dateValue}">${label}</time><div class="archive-day-grid">${dailyProducts.map(product => archiveCard(product, req.language)).join("")}</div></article>`;
  }).join("");
  const body = `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} ARCHIVE</p><h1>Past Drops</h1><p class="description">Every previous daily selection stays available with its original date, Score and current deal status.</p></div></div><div class="archive-list">${dates || '<div class="empty-state">The archive is being prepared.</div>'}</div></section></main>`;
  res.send(shell(`Past Drops in ${selectedMarket.name} | OneDailyDrop`, `Browse previous OneDailyDrop selections for ${selectedMarket.name}, including original Scores and current availability.`, `${SITE}${marketPath(selectedMarket.code, "/archive")}`, body, null, "", products.length ? "" : "noindex,follow", selectedMarket.code, marketCodes, req));
});

app.get("/brand/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const products = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug=? ORDER BY score DESC,updated_at DESC`).all(selectedMarket.code, req.params.slug);
  if (!products.length) return sendNotFound(req, res);
  const brand = products[0].brand, canonical = SITE + brandPath(brand, selectedMarket.code), avgPrice = products.reduce((sum,p)=>sum+Number(p.current_price||0),0)/products.length, avgRating = products.reduce((sum,p)=>sum+Number(p.rating||0),0)/products.length, avgDiscount = products.reduce((sum,p)=>sum+discountPercent(p),0)/products.length;
  const description = `Browse ${products.length} ${brand} deals, price drops and top-rated products selected by OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"Brand",name:brand,url:canonical},{"@type":"ItemList",name:`Best ${brand} Deals`,numberOfItems:products.length,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE+marketPath(selectedMarket.code)},{"@type":"ListItem",position:2,name:"Brands",item:SITE+marketPath(selectedMarket.code,"/brands")},{"@type":"ListItem",position:3,name:brand,item:canonical}]}]};
  const stats = `<div class="detail-grid"><section><h3>Products</h3><p>${products.length}</p></section><section><h3>Average price</h3><p>${money(avgPrice,products[0].currency)}</p></section><section><h3>Average rating</h3><p>${avgRating.toFixed(1)} / 5</p></section><section><h3>Average discount</h3><p>${Math.round(avgDiscount)}%</p></section></div>`;
  res.send(shell(`${brand} Deals in ${selectedMarket.name} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="${marketPath(selectedMarket.code)}">Home</a><span>›</span><a href="${marketPath(selectedMarket.code, "/brands")}">Brands</a><span>›</span><span>${esc(brand)}</span></nav><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())} BRAND</p><h1>${esc(brand)} Deals</h1><p>${esc(description)}</p></div></div>${stats}<div class="grid">${products.map((product,index)=>productCard(product,index+1)).join("")}</div></section></main>`, schema, "", "", selectedMarket.code, marketCodes, req));
});

app.get("/brands", (req, res) => {
  const selectedMarket = requestMarket(req);
  const brands = db.prepare(`SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC`).all(selectedMarket.code);
  if (!brands.length) {
    res.set("X-Robots-Tag", "noindex, follow");
    return sendNotFound(req, res);
  }
  const canonical = SITE + marketPath(selectedMarket.code, "/brands"), description = `Explore popular brands and their best current deals in ${selectedMarket.name} on OneDailyDrop.`;
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:"Popular Brands",numberOfItems:brands.length,itemListElement:brands.map((brand,index)=>({"@type":"ListItem",position:index+1,url:SITE+brandPath(brand.brand,selectedMarket.code),name:brand.brand}))};
  const cards = brands.map(brand => `<article class="card"><div class="card-content"><p class="eyebrow">${brand.product_count} DEALS</p><h2><a href="${brandPath(brand.brand, selectedMarket.code)}">${esc(brand.brand)}</a></h2><p>Average price ${money(brand.avg_price, selectedMarket.currency)} · Rating ${Number(brand.avg_rating||0).toFixed(1)}</p></div></article>`).join("");
  res.send(shell(`Popular Brands in ${selectedMarket.name} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(selectedMarket.name.toUpperCase())}</p><h1>Popular Brands</h1></div><p class="result-count">${brands.length} brands</p></div><div class="grid">${cards}</div></section></main>`, schema, "", brands.length ? "" : "noindex,follow", selectedMarket.code, marketCodes, req));
});

app.get("/robots.txt", (req, res) => res
  .set("Cache-Control", "public, max-age=3600")
  .type("text/plain")
  .send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /go/\nDisallow: /us/go/\nDisallow: /ca/go/\nDisallow: /uk/go/\nDisallow: /fr/go/\nDisallow: /de/go/\n\nSitemap: ${SITE}/sitemap.xml\n`));
app.get("/sitemap.xml", (req, res) => {
  const products = db.prepare(`SELECT id,title,category,brand,brand_slug,market,updated_at,image_url FROM products WHERE status='published' AND ${sourceSql()}`).all();
  const urls = [];
  const localizedAlternates = (pathname, codes = marketCodes) => {
    const supported = [...new Set(codes.map(normalizeMarket).filter(Boolean))];
    const defaultCode = supported.includes("us") ? "us" : supported[0];
    if (!defaultCode) return "";
    return supported
    .map(code => `<xhtml:link rel="alternate" hreflang="${market(code).hreflang}" href="${SITE}${marketPath(code, pathname)}"/>`)
    .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${marketPath(defaultCode, pathname)}"/>`)
    .join("");
  };
  const validLastmod = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };
  const categoryMarkets = new Map();
  for (const product of products) {
    const key = slug(product.category);
    if (!categoryMarkets.has(key)) categoryMarkets.set(key, new Set());
    categoryMarkets.get(key).add(product.market);
  }
  const archiveMarkets = new Set(db.prepare(`SELECT DISTINCT d.market FROM daily_drops d JOIN products p ON p.id=d.product_id WHERE ${sourceSql("p")}`).all().map(row => row.market));
  for (const code of marketCodes) {
    const marketProducts = products.filter(product => product.market === code);
    const categories = [...new Set(marketProducts.map(product => product.category).filter(Boolean))];
    const brands = [...new Map(marketProducts.filter(product => product.brand_slug).map(product => [product.brand_slug, product.brand])).values()];
    const latestUpdate = marketProducts.map(product => validLastmod(product.updated_at)).filter(Boolean).sort().at(-1);
    urls.push({ loc: SITE + marketPath(code), alternates: localizedAlternates("/"), lastmod: latestUpdate });
    if (archiveMarkets.has(code)) urls.push({ loc: SITE + marketPath(code, "/archive"), alternates: localizedAlternates("/archive", [...archiveMarkets]), lastmod: latestUpdate });
    if (brands.length) urls.push({ loc: SITE + marketPath(code, "/brands"), alternates: localizedAlternates("/brands"), lastmod: latestUpdate });
    categories.forEach(value => urls.push({
      loc: SITE + catPath(value, code),
      alternates: localizedAlternates(`/category/${slug(value)}`, [...(categoryMarkets.get(slug(value)) || [])]),
      lastmod: marketProducts.filter(product => product.category === value).map(product => validLastmod(product.updated_at)).filter(Boolean).sort().at(-1)
    }));
    brands.forEach(value => urls.push({
      loc: SITE + brandPath(value, code),
      lastmod: marketProducts.filter(product => product.brand_slug === slugifyBrand(value)).map(product => validLastmod(product.updated_at)).filter(Boolean).sort().at(-1)
    }));
    marketProducts.forEach(product => urls.push({
      loc: SITE + dealPath(product),
      lastmod: validLastmod(product.updated_at),
      image: product.image_url,
      imageTitle: shortTitle(product.title)
    }));
  }
  for (const code of marketCodes) {
    Object.keys(trustPages).forEach(pathname => urls.push({ loc: SITE + marketPath(code, pathname) }));
  }
  res.set("Cache-Control", "public, max-age=1800").type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.map(item => `<url><loc>${esc(item.loc)}</loc>${item.alternates || ""}${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ""}${item.image ? `<image:image><image:loc>${esc(item.image)}</image:loc><image:title>${esc(item.imageTitle)}</image:title></image:image>` : ""}</url>`).join("")}</urlset>`
  );
});

const secretMatches = (provided, expected) => {
  const left = Buffer.from(String(provided || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};
const admin = (req,res,next) => {
  if (!c.adminKey) return res.status(503).json({error:"Admin access is not configured."});
  return secretMatches(req.headers["x-admin-key"], c.adminKey)
    ? next()
    : res.status(401).json({error:"Unauthorized"});
};
app.get("/api/products", (req, res) => {
  const selectedMarket = normalizeMarket(req.query.market) || requestMarket(req).code;
  const params = [selectedMarket];
  const conditions = ["market=?", "status='published'", sourceSql()];
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
    return localizeProduct({
      ...product,
      daily_rank: snapshot?.rank || null,
      selection_reason: snapshot?.selection_reason || product.selection_reason,
      slug: slug(product.title),
      deal_url: dealPath(product),
      category_url: catPath(product.category || "deals", selectedMarket),
      brand_url: product.brand ? brandPath(product.brand, selectedMarket) : null
    }, req.language);
  }));
});
app.get("/api/brands", (req,res) => {
  const selectedMarket = normalizeMarket(req.query.market) || requestMarket(req).code;
  const brands = db.prepare(`SELECT brand,brand_slug,COUNT(*) product_count,AVG(current_price) avg_price,AVG(rating) avg_rating,AVG(CASE WHEN original_price>current_price THEN (1-current_price/original_price)*100 ELSE 0 END) avg_discount FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug<>'' GROUP BY brand,brand_slug ORDER BY product_count DESC,brand ASC`).all(selectedMarket);
  res.json(brands.map(brand => ({...brand,url:brandPath(brand.brand, selectedMarket)})));
});
app.get("/api/brands/:slug", (req,res) => { const products = db.prepare(`SELECT * FROM products WHERE status='published' AND ${sourceSql()} AND brand_slug=? ORDER BY score DESC`).all(req.params.slug); if (!products.length) return res.status(404).json({error:"Brand not found"}); const brand = products[0].brand; res.json({brand,slug:req.params.slug,url:brandPath(brand),summary:{products:products.length,average_price:products.reduce((s,p)=>s+Number(p.current_price||0),0)/products.length,average_rating:products.reduce((s,p)=>s+Number(p.rating||0),0)/products.length,average_discount:products.reduce((s,p)=>s+discountPercent(p),0)/products.length,total_clicks:db.prepare(`SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE ${sourceSql("p")} AND p.brand_slug=?`).get(req.params.slug).n},products:products.map(p=>({...p,deal_url:dealPath(p)}))}); });
app.get("/api/products/:id/price-history", (req,res) => { const product = db.prepare(`SELECT id,title,current_price,currency FROM products WHERE id=? AND status='published' AND ${sourceSql()}`).get(req.params.id); if (!product) return res.status(404).json({error:"Product not found"}); const history = historyFor(product.id); res.json({product,summary:{observations:history.length,lowest_30_days:minSince(history,30),lowest_90_days:minSince(history,90),lowest_ever:history.length?Math.min(...history.map(row=>Number(row.price)).filter(Number.isFinite)):null},history}); });
app.get("/api/status", (req,res) => {
  const latestRun = db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null;
  res.json({
    provider:c.provider,
    products:db.prepare(`SELECT COUNT(*) n FROM products WHERE status='published' AND ${sourceSql()}`).get().n,
    brands:db.prepare(`SELECT COUNT(DISTINCT brand_slug) n FROM products WHERE status='published' AND ${sourceSql()} AND brand_slug<>''`).get().n,
    clicks:db.prepare(`SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE ${sourceSql("p")}`).get().n,
    priceObservations:db.prepare(`SELECT COUNT(*) n FROM price_history h JOIN products p ON p.id=h.product_id WHERE ${sourceSql("p")}`).get().n,
    lastRun:isPublicSource(latestRun?.provider) ? latestRun : null
  });
});
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
    message:emailSent ? t(req.language, "form.subscribedEmail") : t(req.language, "form.subscribed"),
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
  res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "private, no-store");
  const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id);
  if (!product || !isPublicSource(product.source)) return res.sendStatus(404);
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
  return sendNotFound(req, res);
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
    if (!count && c.provider !== "unconfigured") await refreshProducts(c, {market:marketCode}).catch(console.error);
  }
  app.listen(c.port, () => console.log(`http://localhost:${c.port}`));
})();
