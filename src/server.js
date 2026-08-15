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
const { enabledProviders, searchForAssistant } = require("./providers/registry");
const { coverage: retailerCoverage } = require("./retailerCatalog");
const { presentProduct } = require("./productPresentation");
const { deduplicationKeys, isDailyPickEligible, scoreOffers, selectUniqueProducts } = require("./ranker");
const { parseSearchOptions, searchCatalogProducts } = require("./catalogSearch");
const { applySearchIntent } = require("./searchIntent");
const { offerIdentity, offerSummary, sourceKey } = require("./productOffers");
const { rankingValidationReport } = require("./rankingValidation");
const { methodology, methodologyMain } = require("./methodology");
const { createEditorialBrief } = require("./editorialBrief");
const {
  createShoppingAssistant,
  mergeShoppingMission,
  shoppingMissionText,
  timeoutResponse,
} = require("./shoppingAssistant");
const renderShoppingAssistantPanel = require("./shoppingAssistantPanel");
const { passwordResetEmail, subscriptionEmail, clubWaitlistEmail } = require("./mailer");
const {
  normalizeAction,
  normalizePlacement,
  normalizeSourcePage,
  outboundPath,
  retailerShopUrl
} = require("./retailerLinks");
const {
  challengeResponse: ebayChallengeResponse,
  createEbayPublicKeyClient,
  tokenIsValid: ebayTokenIsValid,
  verifySignature: verifyEbaySignature
} = require("./ebayAccountDeletion");
const { codes: marketCodes, normalizeMarket, market, marketFromIp, marketPath, alternateLinks } = require("./markets");
const {
  resolveLanguage,
  languageTag,
  defaultLanguages,
  clientCopy,
  localizeHtml,
  languageSwitcher,
  categoryLabel,
  marketName,
  t
} = require("./i18n");

const app = express();
const SHOPPING_ASSISTANT_HARD_TIMEOUT_MS = 32000;
const assistantRetailerSearch = ({ query, queries, market: selectedMarket, signal }) =>
  searchForAssistant(c, {query, queries, market:selectedMarket, signal});
const shoppingAssistant = createShoppingAssistant({
  db,
  sourceSql,
  market,
  retailerSearch: assistantRetailerSearch,
});
app.set("trust proxy", 1);
app.disable("x-powered-by");
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");
const SITE = "https://www.onedailydrop.com";
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const stripePriceId = String(process.env.STRIPE_CLUB_PRICE_ID || "").trim();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const clubEnrollmentOpen = String(process.env.CLUB_ENROLLMENT_OPEN || "false").trim().toLowerCase() === "true";
const getEbayPublicKey = createEbayPublicKeyClient({
  clientId:c.ebayClientId,
  clientSecret:c.ebayClientSecret,
  environment:c.ebayEnvironment
});

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
app.get("/api/ebay/account-deletion", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "no-store");
  const challengeCode = typeof req.query.challenge_code === "string" ? req.query.challenge_code : "";
  if (!challengeCode || challengeCode.length > 512) return res.status(400).json({error:"Missing or invalid challenge_code."});
  if (!ebayTokenIsValid(c.ebayVerificationToken)) {
    return res.status(503).json({error:"eBay account-deletion endpoint is not configured."});
  }
  try {
    return res.status(200).json({
      challengeResponse:ebayChallengeResponse({
        challengeCode,
        verificationToken:c.ebayVerificationToken,
        endpoint:c.ebayAccountDeletionEndpoint
      })
    });
  } catch (error) {
    console.error("eBay endpoint validation failed:", error.message);
    return res.sendStatus(500);
  }
});
app.post("/api/ebay/account-deletion", express.raw({type:"application/json", limit:"64kb"}), async (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "no-store");
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({error:"Invalid notification payload."});
  let verified;
  try {
    verified = await verifyEbaySignature({
      rawBody:req.body,
      signatureHeader:req.get("X-EBAY-SIGNATURE"),
      getPublicKey:getEbayPublicKey
    });
  } catch (error) {
    console.error("eBay notification validation failed:", error.message);
    const configurationError = error.message.includes("credentials are not configured") || error.message.includes("request failed");
    return res.sendStatus(configurationError ? 503 : 412);
  }
  if (!verified) return res.sendStatus(412);

  let message;
  try {
    message = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({error:"Invalid notification JSON."});
  }
  const topic = String(message?.metadata?.topic || "");
  const notificationId = String(message?.notification?.notificationId || "").trim();
  const eventDate = String(message?.notification?.eventDate || "").trim().slice(0, 64);
  if (topic !== "MARKETPLACE_ACCOUNT_DELETION" || !notificationId || notificationId.length > 200) {
    return res.status(400).json({error:"Unsupported eBay notification."});
  }

  // OneDailyDrop does not persist eBay member accounts or user-level eBay data.
  // Store only a receipt ID for idempotency; never store the deletion payload,
  // eBay username, or eBay user ID.
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO ebay_account_deletion_receipts
      (notification_id,event_date,received_at,processed_at,status)
    VALUES(?,?,?,?,?)
  `).run(notificationId, eventDate || null, now, now, "acknowledged_no_user_data_stored");
  return res.sendStatus(204);
});
app.use(express.json());
app.use("/api", (req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

const shoppingAssistantAttempts = new Map();
const shoppingAssistantRateLimit = (req, res, next) => {
  const key = String(req.ip || req.socket?.remoteAddress || "unknown");
  const now = Date.now();
  const recent = (shoppingAssistantAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 20) return res.status(429).json({error:"Too many requests. Please wait a few minutes and try again."});
  recent.push(now);
  shoppingAssistantAttempts.set(key, recent);
  next();
};

app.get("/api/shopping-assistant/status", (req, res) => {
  res.set("Cache-Control", "no-store").json({available:shoppingAssistant.configured});
});

app.post("/api/shopping-assistant", shoppingAssistantRateLimit, async (req, res) => {
  const requestedMarket = normalizeMarket(req.body?.market);
  const selectedMarket = market(requestedMarket || req.market || marketFromIp(req).code);
  const requestedLanguage = String(req.body?.language || req.language || "en").trim().toLowerCase().split("-")[0];
  const language = ["en", "ru", "az", "es", "fr", "de"].includes(requestedLanguage) ? requestedLanguage : "en";
  const requestController = new AbortController();
  req.once("aborted", () => requestController.abort());
  res.once("close", () => {
    if (!res.writableEnded) requestController.abort();
  });
  let hardTimeoutTimer;
  try {
    const assistantTask = shoppingAssistant.respond({
      message:req.body?.message,
      messages:req.body?.messages,
      shoppingContext:req.body?.shopping_context,
      shoppingMission:req.body?.shopping_mission,
      excludedOfferUrls:req.body?.excluded_offer_urls,
      marketCode:selectedMarket.code,
      language,
      signal:requestController.signal
    });
    const hardTimeoutTask = new Promise(resolve => {
      hardTimeoutTimer = setTimeout(() => {
        const timeoutMission = mergeShoppingMission(
          req.body?.shopping_mission,
          {},
          req.body?.message,
          false,
        );
        resolve(timeoutResponse(
          req.body?.message,
          language,
          [],
          shoppingAssistant.model,
          selectedMarket,
          timeoutMission,
          shoppingMissionText(timeoutMission, req.body?.message),
        ));
        requestController.abort();
      }, SHOPPING_ASSISTANT_HARD_TIMEOUT_MS);
    });
    const result = await Promise.race([assistantTask, hardTimeoutTask]);
    clearTimeout(hardTimeoutTimer);
    return res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    clearTimeout(hardTimeoutTimer);
    const status = Number(error.statusCode) || 502;
    if (status >= 500) console.error("Shopping assistant request failed:", error.message);
    return res.status(status).set("Cache-Control", "no-store").json({
      error:status === 503
        ? "The AI Shopping Assistant is being connected. Please try again shortly."
        : status === 400
          ? error.message
          : "The AI Shopping Assistant could not complete that request. Please try again."
    });
  }
});
app.post("/api/shopping-assistant/feedback", shoppingAssistantRateLimit, (req, res) => {
  const feedbackType = String(req.body?.feedback_type || "").trim();
  const conversationId = String(req.body?.conversation_id || "").trim().slice(0, 80);
  const messageId = String(req.body?.message_id || "").trim().slice(0, 80);
  const selectedMarket = normalizeMarket(req.body?.market) || "us";
  const productIds = (Array.isArray(req.body?.product_ids) ? req.body.product_ids : [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)
    .slice(0, 6);
  if (!conversationId || !messageId || !["helpful", "not_helpful", "wrong_price"].includes(feedbackType)) {
    return res.status(400).set("Cache-Control", "no-store").json({error:"Invalid feedback."});
  }
  const ipHash = crypto
    .createHash("sha256")
    .update(`${String(req.ip || req.socket?.remoteAddress || "unknown")}:${process.env.SESSION_SECRET || "local"}`)
    .digest("hex")
    .slice(0, 24);
  db.prepare(`
    INSERT OR IGNORE INTO shopping_assistant_feedback(
      conversation_id,message_id,feedback_type,market,product_ids,created_at,ip_hash
    ) VALUES(?,?,?,?,?,?,?)
  `).run(
    conversationId,
    messageId,
    feedbackType,
    selectedMarket,
    JSON.stringify(productIds),
    new Date().toISOString(),
    ipHash
  );
  return res.status(201).set("Cache-Control", "no-store").json({ok:true});
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
  if ((req.method === "GET" || req.method === "HEAD") && req.language !== defaultLanguages[marketCode]) {
    res.set("X-Robots-Tag", "noindex, follow");
  }
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
  const legacyTarget = legacyPages[legacyPath];
  if (!legacyTarget) return next();
  const regionalLegacyTargets = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy", "/how-we-select-deals", "/price-disclaimer"]);
  const destination = regionalLegacyTargets.has(legacyTarget)
    ? marketPath(req.market || marketFromIp(req).code, legacyTarget)
    : legacyTarget;
  const queryIndex = String(req.originalUrl || "").indexOf("?");
  return res.redirect(301, `${destination}${queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ""}`);
});
app.use(express.static(publicDir, {
  etag:true,
  setHeaders:(res, filePath) => {
    if (!/\.(?:css|js|svg|png|jpe?g|webp|gif|woff2?)$/i.test(filePath)) return;
    const versioned = String(res.req?.originalUrl || "").includes("?");
    res.set("Cache-Control", versioned
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600, stale-while-revalidate=86400");
  }
}));

const publicHtmlCache = new Map();
app.use((req, res, next) => {
  if (req.method !== "GET" || !/^\/(?:deal\/[^/]+|category\/[^/]+|search|archive|brand\/[^/]+|brands|about|contact|privacy|terms|affiliate-disclosure|editorial-policy|how-we-select-deals|price-disclaimer)\/?$/.test(req.path)) return next();
  const cacheKey = `${req.language || "en"}:${req.originalUrl}`;
  const cached = publicHtmlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.robots) res.set("X-Robots-Tag", cached.robots);
    return res.set("X-ODD-Cache", "HIT")
      .set("Cache-Control", cached.cacheControl)
      .type("html")
      .send(cached.body);
  }
  if (cached) publicHtmlCache.delete(cacheKey);
  const originalSend = res.send.bind(res);
  res.send = body => {
    if (res.statusCode === 200 && typeof body === "string" && body.length < 1000000) {
      if (publicHtmlCache.size >= 500) publicHtmlCache.delete(publicHtmlCache.keys().next().value);
      const isProductPage = /^\/deal\/[^/]+\/?$/.test(req.path);
      const isDefaultLanguage = req.language === defaultLanguages[req.market || marketFromIp(req).code];
      const cacheControl = isProductPage && isDefaultLanguage
        ? "public, max-age=120, s-maxage=600, stale-while-revalidate=3600"
        : "private, max-age=45, stale-while-revalidate=180";
      const cacheTtlMs = isProductPage ? 10 * 60 * 1000 : 45 * 1000;
      publicHtmlCache.set(cacheKey, {
        body,
        cacheControl,
        robots:String(res.get("X-Robots-Tag") || ""),
        expiresAt:Date.now() + cacheTtlMs
      });
      res.set("X-ODD-Cache", "MISS").set("Cache-Control", cacheControl);
    }
    return originalSend(body);
  };
  return next();
});

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
  let pageTitle = trustTitles[route];
  let pageDescription = html.match(/<meta name="description" content="([^"]+)">/)?.[1] || "";
  if (route === "/how-we-select-deals") {
    const method = methodology(language);
    pageTitle = `${method.title} | OneDailyDrop`;
    pageDescription = method.description;
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${method.description}">`)
      .replace(/<main class="page-main">[\s\S]*?<\/main>/, methodologyMain(language));
  }
  const canonical = `${SITE}${marketPath(selectedMarket.code, route)}`;
  const robotsContent = language === defaultLanguages[selectedMarket.code]
    ? "index,follow,max-image-preview:large"
    : "noindex,follow";
  html = html.replace(
    /<link rel="canonical" href="[^"]+">/,
    `<link rel="canonical" href="${canonical}">${alternateLinks(route)}`
  );
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
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="robots" content="${robotsContent}"><meta property="og:type" content="website"><meta property="og:site_name" content="OneDailyDrop"><meta property="og:locale" content="${locale.replace("-", "_")}"><meta property="og:title" content="${esc(pageTitle)}"><meta property="og:description" content="${esc(pageDescription)}"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(pageTitle)}"><meta name="twitter:description" content="${esc(pageDescription)}"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g, "\\u003c")}</script><script>window.__ODD_LANGUAGE__=${JSON.stringify(language)};window.__ODD_LOCALE__=${JSON.stringify(locale)};window.__ODD_TEXT__=${JSON.stringify(clientCopy(language)).replace(/</g, "\\u003c")};</script></head>`
  );
  html = localizeHtml(html, language)
    .replace(/<html lang="[^"]+">/, `<html lang="${locale}">`)
    .replace(/href="\/"/g, `href="${home}"`)
    .replace(
      '<button id="themeToggle"',
      `${languageSwitcher(req, selectedMarket.code, language)}<button id="themeToggle"`
    )
    .replace("</head>", '<link rel="stylesheet" href="/i18n.css?v=20260808-assistant"><link rel="stylesheet" href="/cookie-consent.css?v=20260730"></head>')
    .replace("</body>", '<script src="/cookie-consent.js?v=20260730"></script></body>');
  res.set(
    "Cache-Control",
    language === defaultLanguages[selectedMarket.code]
      ? "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
      : "private, no-cache"
  ).type("html").send(html);
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
const money = (value, currency = "USD", locale = "en-US") => { if (value == null || value === "") return "Check current price"; const n = Number(value); if (!Number.isFinite(n)) return "Check current price"; try { return new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(n); } catch { return `$${n.toFixed(2)}`; } };
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (clean(product.retailer_name)) return clean(product.retailer_name); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };
const hasCurrentOffer = product => Number(product?.current_price) > 0 &&
  /^[A-Z]{3}$/.test(String(product?.currency || "").toUpperCase()) &&
  Boolean(clean(product?.checked_at));
const hasRetailerImage = product => Boolean(clean(product?.image_url)) &&
  !/product-placeholder\.svg(?:$|\?)/i.test(String(product.image_url));
const imageConnectionHints = image => {
  try {
    const origin = new URL(String(image || "")).origin;
    return origin.startsWith("https://")
      ? `<link rel="preconnect" href="${esc(origin)}"><link rel="dns-prefetch" href="${esc(origin)}">`
      : "";
  } catch {
    return "";
  }
};
const discountPercent = product => Number(product.original_price) > Number(product.current_price) ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const whyPicked = (product, language = "en") => {
  if (String(product?.source || "").toLowerCase() === "demo") return clean(product.description) || reasonFor(product);
  return clean(product.display_selection_reason) || presentProduct(product, language).display_selection_reason;
};
const searchAliases = {cat:["cat","cats","pet","pets"],cats:["cat","cats","pet","pets"],dog:["dog","dogs","pet","pets"],dogs:["dog","dogs","pet","pets"],phone:["phone","phones","smartphone","smartphones","mobile"],tv:["tv","television","televisions"],car:["car","cars","automotive","auto"]};
const matchesSearch = (product, terms) => {
  const haystack = `${product.title || ""} ${product.description || ""} ${product.category || ""} ${product.brand || ""} ${product.retailer_name || ""} ${product.source || ""}`.toLowerCase();
  return terms.every(term => (searchAliases[term] || [term, term.endsWith("s") ? term.slice(0,-1) : `${term}s`]).some(candidate => haystack.includes(candidate)));
};
const trackingAttributes = (product, sourcePage, placement) => `data-track-product="${Number(product.id)}" data-track-source="${normalizeSourcePage(sourcePage)}" data-track-placement="${normalizePlacement(placement)}" data-track-action="view_details"`;
const analyticsToken = value => {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(token) ? token : "";
};
const analyticsPosition = value => {
  const position = Number(value);
  return Number.isInteger(position) && position > 0 && position <= 10000 ? position : null;
};
const askDeliaButton = (product, language = "en") =>
  `<button class="ask-delia-button" type="button" data-ask-delia data-product-id="${Number(product.id)}" data-product-title="${esc(shortTitle(localizeProduct(product, language).title))}" data-product-score="${Number(product.display_score || product.score || 0)}" data-product-url="${esc(dealPath(product))}">✦ ${esc(t(language,"assistant.askProduct"))}</button>`;
const externalAttributes = 'target="_blank" rel="sponsored noopener noreferrer"';
const recordClick = (req, product, {
  sourcePage = "unknown",
  placement = "unknown",
  action = "view_deal",
  destinationType = "retailer",
  sessionId = "",
  eventId = ""
} = {}) => {
  db.prepare(`
    INSERT OR IGNORE INTO clicks(
      event_id,session_id,product_id,market,retailer_name,source_page,placement,action_type,
      destination_type,clicked_at,referrer,user_agent
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    analyticsToken(eventId) || null,
    analyticsToken(sessionId),
    product.id,
    product.market || "us",
    storeName(product).slice(0, 120),
    normalizeSourcePage(sourcePage),
    normalizePlacement(placement),
    normalizeAction(action),
    destinationType === "internal" ? "internal" : "retailer",
    new Date().toISOString(),
    String(req.get("referer") || "").slice(0, 1000),
    String(req.get("user-agent") || "").slice(0, 500)
  );
};

const requestMarket = req => req.market ? market(req.market) : marketFromIp(req);
const isGenericBrand = value => /^(?:unbranded(?:-generic)?|generic|unknown|branded)$/i.test(clean(value));
const isPubliclyIndexable = product => isDailyPickEligible(product);
const navigationCategoryCache = new Map();
const searchCatalogCache = new Map();
const navCategories = code => {
  const cached = navigationCategoryCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.categories;
  // The header only needs category names. Loading every product and scoring it
  // again made each cold product-page request scale with the whole catalog.
  // Eligibility is already persisted during ingestion, so keep this query on
  // indexed, precomputed columns and validate only one representative row per
  // category.
  const candidates = db.prepare(`
    SELECT category
    FROM products
    WHERE market=? AND status='published' AND ${sourceSql()} AND category<>''
      AND title<>'' AND image_url<>'' AND affiliate_url LIKE 'http%'
      AND current_price>0 AND shipping_cost IS NOT NULL
      AND commerce_quality>=45 AND evidence_confidence>=55
      AND LOWER(COALESCE(return_summary,'')) NOT LIKE '%no return%'
      AND LOWER(COALESCE(return_summary,'')) NOT LIKE '%not accepted%'
      AND LOWER(COALESCE(return_summary,'')) NOT LIKE '%final sale%'
    GROUP BY category
    ORDER BY category
  `).all(code);
  const categories = candidates.map(row => row.category).filter(Boolean);
  navigationCategoryCache.set(code, {categories, expiresAt:Date.now() + 15 * 60 * 1000});
  return categories;
};
const searchRowsForMarket = code => {
  const cached = searchCatalogCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const rows = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()}`).all(code).filter(isPubliclyIndexable);
  searchCatalogCache.set(code, {rows, expiresAt:Date.now() + 60000});
  return rows;
};
const sharedHeader = (code, language = "en", req = null) => {
  const home = marketPath(code);
  const search = marketPath(code, "/search");
  return `<header class="site-header">
    <div class="header-top">
      <a class="brand" href="${home}"><span class="brand-mark" aria-hidden="true"><img src="/header-bag.svg?v=20260731-larger-bag" alt=""></span><span class="brand-copy"><strong><span>OneDaily</span><span class="brand-drop">Drop</span></strong><small>${esc(t(language,"brand.seoTagline"))}</small></span></a>
      <a class="header-search-link" href="${search}"><span aria-hidden="true">⌕</span><span>${esc(t(language,"search.short"))}</span></a>
      <a class="header-subscribe" href="${home}#subscribe">${esc(t(language,"nav.subscribe"))}</a>
      <button id="themeToggle" class="theme-button" type="button" aria-label="${esc(t(language,"theme.toDark"))}" title="${esc(t(language,"theme.dark"))}"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">${esc(t(language,"theme.dark"))}</span></button>
      ${req ? languageSwitcher(req, code, language) : ""}
      <button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mainNavigation" aria-label="${esc(t(language,"menu.open"))}"><span></span><span></span><span></span></button>
    </div>
    <nav id="mainNavigation" class="main-nav" aria-label="${esc(t(language,"nav.primary"))}"><a href="${home}">${esc(t(language,"nav.todayShort"))}</a><div class="category-menu"><button type="button" aria-expanded="false">${esc(t(language,"nav.categories"))} <span>⌄</span></button><div class="mega-menu" hidden>${navCategories(code).map(category => `<a href="${catPath(category, code)}">${esc(categoryLabel(category, language))}</a>`).join("")}</div></div><a href="${home}#top">${esc(t(language,"nav.more"))}</a><a href="${marketPath(code, "/archive")}">${esc(t(language,"nav.archive"))}</a><a href="${marketPath(code, "/about")}">${esc(t(language,"nav.about"))}</a></nav>
  </header>`;
};
const sharedFooter = (code, language = "en") => `<footer><div class="footer-brand"><b>OneDailyDrop</b><p>${esc(t(language,"brand.seoTagline"))}</p><div class="footer-links"><a href="${marketPath(code, "/about")}">${esc(t(language,"footer.about"))}</a><a href="${marketPath(code, "/contact")}">${esc(t(language,"footer.contact"))}</a><a href="${marketPath(code, "/privacy")}">${esc(t(language,"footer.privacy"))}</a><a href="${marketPath(code, "/terms")}">${esc(t(language,"footer.terms"))}</a><a href="${marketPath(code, "/affiliate-disclosure")}">${esc(t(language,"footer.affiliate"))}</a><a href="${marketPath(code, "/editorial-policy")}">${esc(t(language,"footer.editorial"))}</a></div></div><p class="disclosure">${esc(t(language,"footer.preview"))}</p></footer>`;
const shoppingAssistantPanel = renderShoppingAssistantPanel;
const shell = (title, description, canonical, body, schema = null, image = "", robots = "", code = "us", alternateCodes = marketCodes, req = null) => {
  const selectedMarket = market(code);
  const language = req?.language || "en";
  const locale = languageTag(code, language);
  const pathname = (() => {
    try { return new URL(canonical).pathname.replace(new RegExp(`^/(${marketCodes.join("|")})`), "") || "/"; }
    catch { return ""; }
  })();
  const hasCountryAlternates = /^\/(?:about|contact|privacy|terms|affiliate-disclosure|editorial-policy|how-we-select-deals|price-disclaimer|archive|brands|category\/[^/]+|brand\/[^/]+)$/.test(pathname);
  const alternates = hasCountryAlternates ? alternateLinks(pathname, alternateCodes) : "";
  const robotsContent = robots || (language === defaultLanguages[selectedMarket.code]
    ? "index,follow,max-image-preview:large"
    : "noindex,follow");
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
  const html = `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1020"><title>${esc(title)}</title><meta name="description" content="${esc(description.slice(0,160))}"><meta name="robots" content="${esc(robotsContent)}"><link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml">${alternates}${imageConnectionHints(image)}<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="OneDailyDrop"><meta property="og:locale" content="${esc(ogLocale)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description.slice(0,180))}"><meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(title)}">` : ""}<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description.slice(0,180))}">${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}<link rel="stylesheet" href="/styles.css?v=20260731-brand-lockup"><link rel="stylesheet" href="/brand-theme.css?v=20260731-brand-lockup"><link rel="stylesheet" href="/liquid-glass.css?v=20260731-brand-lockup"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g,"\\u003c")}</script><script>window.__ODD_LANGUAGE__=${JSON.stringify(language)};window.__ODD_LOCALE__=${JSON.stringify(locale)};window.__ODD_TEXT__=${JSON.stringify(clientCopy(language)).replace(/</g, "\\u003c")};</script></head><body>${sharedHeader(code, language, req)}${body}${sharedFooter(code, language)}<script src="/theme.js?v=20260728-i18n2"></script><script src="/site-shell.js?v=20260728-i18n2"></script><script src="/click-tracking.js?v=20260814-day5"></script></body></html>`;
  const versionedHtml = html
    .replace("/styles.css?v=20260731-brand-lockup", "/styles.css?v=20260814-day12-unified-search")
    .replace("/site-shell.js?v=20260728-i18n2", "/site-shell.js?v=20260814-day11-prefetch")
    .replace("</head>", '<link rel="stylesheet" href="/i18n.css?v=20260808-assistant"><link rel="stylesheet" href="/shopping-assistant.css?v=20260812-all-markets-v2"></head>')
    .replace("</body>", `${shoppingAssistantPanel(code, language)}<script src="/shopping-assistant.js?v=20260814-day12-product-gate"></script></body>`);
  return localizeHtml(versionedHtml, language);
};

const scoreMetrics = (display, language = "en", { atSelection = false } = {}) => {
  const score = display?.display_score == null ? NaN : Number(display.display_score);
  const hasScore = Number.isFinite(score) && score >= 60;
  const productRating = clean(display?.display_product_rating);
  const sellerRating = clean(display?.display_seller_rating);
  if (!hasScore && !productRating && !sellerRating) return "";
  const ratings = [
    productRating ? `<span class="deal-rating"><strong>★ ${esc(productRating)}</strong><small>${esc(display.display_product_rating_label || t(language,"product.productRating"))}</small></span>` : "",
    sellerRating ? `<span class="deal-rating"><strong>${esc(sellerRating)}</strong><small>${esc(display.display_seller_rating_label || t(language,"product.sellerRating"))}${display.display_seller_feedback ? ` · ${esc(display.display_seller_feedback)}` : ""}</small></span>` : ""
  ].filter(Boolean).join("");
  return `<div class="deal-metrics${atSelection ? " is-selection" : ""}">
    ${hasScore ? `<div class="deal-score"><strong>${score}/100</strong><span>${esc(atSelection ? display.display_score_at_selection_label : display.display_score_label)}<small>${esc(display.display_score_context)}</small></span></div>` : ""}
    ${ratings ? `<div class="deal-ratings">${ratings}</div>` : ""}
  </div>`;
};

const productCard = (product, index = 0, language = "en", sourcePage = "unknown") => {
  const display = presentProduct(localizeProduct(product, language), language);
  return `<article class="card catalog-card"><a class="image-wrap" href="${dealPath(product)}" ${trackingAttributes(product, sourcePage, "catalog_media")}><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}" loading="lazy" decoding="async"></a><div class="card-content">${index ? `<span class="rank">#${index}</span>` : ""}${product.brand ? `<a class="eyebrow" href="${brandPath(product.brand, product.market)}">${esc(product.brand)}</a>` : ""}<h2 class="card-title"><a href="${dealPath(product)}" ${trackingAttributes(product, sourcePage, "catalog_title")}>${esc(shortTitle(display.title))}</a></h2><p class="description editorial-teaser"><strong>${esc(t(language,"product.why"))}</strong> ${esc(whyPicked(display, language))}</p>${scoreMetrics(display, language)}<span class="price card-price">${money(product.current_price, product.currency, languageTag(product.market, language))}</span><div class="card-actions"><a class="button" href="${dealPath(product)}" ${trackingAttributes(product, sourcePage, "catalog_details")}>${esc(t(language,"page.viewDetails"))}</a>${askDeliaButton(product, language)}</div></div></article>`;
};
const searchResultCard = (product, index = 0, language = "en", hasQuery = false) => {
  const display = presentProduct(localizeProduct(product, language), language);
  const relevance = Math.max(0, Math.min(100, Math.round(Number(product.relevance_score) || 0)));
  const quality = Math.max(0, Math.min(100, Math.round(Number(product.commerce_quality) || 0)));
  const badges = [
    `<span class="search-badge search-badge-store">${esc(t(language,"search.badgeStore"))}: ${esc(storeName(product))}</span>`,
    hasQuery && relevance > 0 ? `<span class="search-badge search-badge-match">${esc(t(language,"search.badgeMatch",{score:relevance}))}</span>` : "",
    quality > 0 ? `<span class="search-badge search-badge-quality">${esc(t(language,"search.badgeQuality",{score:quality}))}</span>` : "",
    display.display_availability ? `<span class="search-badge search-badge-availability">${esc(display.display_availability)}</span>` : ""
  ].filter(Boolean).join("");
  return `<article class="card catalog-card search-result-card"><a class="image-wrap" href="${dealPath(product)}" ${trackingAttributes(product,"search","catalog_media")}><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}" loading="lazy" decoding="async"></a><div class="card-content">${index ? `<span class="rank">#${index}</span>` : ""}<div class="search-result-badges" aria-label="${esc(t(language,"search.badges"))}">${badges}</div><h2 class="card-title"><a href="${dealPath(product)}" ${trackingAttributes(product,"search","catalog_title")}>${esc(shortTitle(display.title))}</a></h2><p class="description editorial-teaser"><strong>${esc(t(language,"product.why"))}</strong> ${esc(whyPicked(display,language))}</p>${scoreMetrics(display,language)}<span class="price card-price">${money(product.current_price,product.currency,languageTag(product.market,language))}</span><div class="card-actions"><a class="button" href="${dealPath(product)}" ${trackingAttributes(product,"search","catalog_details")}>${esc(t(language,"page.viewDetails"))}</a>${askDeliaButton(product,language)}</div></div></article>`;
};
const alternativeCard = (product, language = "en") => {
  const display = presentProduct(localizeProduct(product, language), language);
  return `<article class="alternative-card"><a class="alternative-card-media" href="${dealPath(product)}" ${trackingAttributes(product,"related","catalog_media")}><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}" loading="lazy" decoding="async"></a><div class="alternative-card-body"><p class="cat">${esc(display.display_category)} · ${esc(storeName(product))}</p><h3><a href="${dealPath(product)}" ${trackingAttributes(product,"related","catalog_title")}>${esc(shortTitle(display.title))}</a></h3><div class="alternative-meta">${display.display_score != null ? `<span>${esc(display.display_score_label)} <strong>${Number(display.display_score)}/100</strong></span>` : ""}<span class="price">${money(product.current_price,product.currency,languageTag(product.market,language))}</span></div><div class="card-actions"><a class="alternative-link" href="${dealPath(product)}" ${trackingAttributes(product,"related","catalog_details")}>${esc(t(language,"page.viewDetails"))} →</a>${askDeliaButton(product, language)}</div></div></article>`;
};
const archiveCard = (product, language = "en") => {
  const display = presentProduct(localizeProduct(product, language), language);
  const locale = languageTag(product.market, language);
  return `<article class="archive-card"><a class="archive-card-media" href="${dealPath(product)}" ${trackingAttributes(product, "archive", "archive_media")}><img src="${esc(product.image_url)}" alt="${esc(shortTitle(display.title))}" loading="lazy" decoding="async"></a><div class="archive-card-content">${product.category ? `<a class="eyebrow" href="${catPath(product.category, product.market)}">${esc(display.display_category)}</a>` : ""}<h2><a href="${dealPath(product)}" ${trackingAttributes(product, "archive", "archive_title")}>${esc(shortTitle(display.title))}</a></h2><p class="description editorial-teaser">${esc(whyPicked(display, language))}</p>${scoreMetrics(display, language, { atSelection:true })}<div class="archive-prices"><p><span>${esc(t(language,"product.selectionPrice"))}</span><strong>${money(product.drop_price ?? product.current_price, product.drop_currency || product.currency, locale)}</strong></p><p><span>${esc(t(language,"product.currentPrice"))}</span><strong>${money(product.current_price, product.currency, locale)}</strong></p></div><span class="archive-status">${esc(display.display_availability)}</span><div class="card-actions"><a class="button" href="${dealPath(product)}" ${trackingAttributes(product, "archive", "archive_details")}>${esc(t(language,"page.viewDetails"))}</a>${askDeliaButton(product, language)}</div></div></article>`;
};
const findProduct = param => { const id = String(param).match(/-(\d+)$/)?.[1] || (/^\d+$/.test(param) ? param : null); return id ? db.prepare(`SELECT * FROM products WHERE id=? AND status='published' AND ${sourceSql()}`).get(id) : null; };
const sameProductOffers = product => {
  const identity = offerIdentity(product);
  if (!identity.reliable) return offerSummary(product, [product]);
  const conditions = ["market=?", "status='published'", sourceSql(), "LOWER(product_key)=?"];
  const params = [product.market, identity.productKey];
  if (identity.sourceScoped) {
    conditions.push("LOWER(COALESCE(source,''))=?");
    params.push(sourceKey(product));
  }
  const candidates = db.prepare(`SELECT * FROM products WHERE ${conditions.join(" AND ")} ORDER BY current_price ASC,score DESC`).all(...params);
  return offerSummary(product, candidates.length ? candidates : [product]);
};
const significantWords = value => new Set(clean(value).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3 && !new Set([
  "with","from","this","that","pack","new","black","white","blue","red","for","and","the","your","plus","free"
]).has(word)));
const uniqueProductsInOrder = products => {
  const used = new Set();
  const unique = [];
  for (const product of products || []) {
    const marketPrefix = String(product.market || "").toLowerCase();
    const keys = deduplicationKeys(product).map(key => `${marketPrefix}:${key}`);
    if (keys.some(key => used.has(key))) continue;
    unique.push(product);
    keys.forEach(key => used.add(key));
  }
  return unique;
};
const summarizeBrands = products => {
  const groups = new Map();
  for (const product of uniqueProductsInOrder(products)) {
    const key = clean(product.brand_slug);
    if (!key) continue;
    const group = groups.get(key) || {
      brand:product.brand,
      brand_slug:key,
      product_count:0,
      price_total:0,
      rating_total:0,
      discount_total:0
    };
    group.product_count += 1;
    group.price_total += Number(product.current_price || 0);
    group.rating_total += Number(product.rating || 0);
    group.discount_total += discountPercent(product);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    brand:group.brand,
    brand_slug:group.brand_slug,
    product_count:group.product_count,
    avg_price:group.product_count ? group.price_total / group.product_count : 0,
    avg_rating:group.product_count ? group.rating_total / group.product_count : 0,
    avg_discount:group.product_count ? group.discount_total / group.product_count : 0
  })).sort((left, right) => right.product_count - left.product_count || left.brand.localeCompare(right.brand));
};
const alternativesFor = (product, limit = 3) => {
  const words = significantWords(product?.canonical_title || product?.title);
  const price = Number(product?.current_price);
  const currentKeys = new Set(deduplicationKeys(product));
  const candidates = db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND category=? AND id<>? ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC LIMIT 40`)
    .all(product.market, product.category || "Deals", product.id)
    .filter(isPubliclyIndexable)
    .filter(candidate => !deduplicationKeys(candidate).some(key => currentKeys.has(key)))
    .map(candidate => {
      const candidateWords = significantWords(candidate.canonical_title || candidate.title);
      const sharedWords = [...words].filter(word => candidateWords.has(word)).length;
      const sameBrand = clean(product.brand_slug) && clean(product.brand_slug) === clean(candidate.brand_slug) ? 1 : 0;
      const candidatePrice = Number(candidate.current_price);
      const priceCloseness = Number.isFinite(price) && price > 0 && Number.isFinite(candidatePrice) && candidatePrice > 0
        ? Math.max(0, 1 - Math.abs(candidatePrice - price) / Math.max(price, candidatePrice))
        : 0;
      return { candidate, relevance: sharedWords * 12 + sameBrand * 8 + priceCloseness * 5 + Number(candidate.score || 0) / 20 };
    })
    .sort((left, right) => right.relevance - left.relevance)
    .map(result => result.candidate);
  return uniqueProductsInOrder(candidates).slice(0, limit);
};
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
  const display = presentProduct(localizeProduct(p, req.language), req.language);
  const canonical = SITE + dealPath(p), title = shortTitle(display.title), store = storeName(p), category = p.category || "Deals";
  const displayCategory = categoryLabel(category, req.language);
  const pageLocale = languageTag(p.market, req.language);
  const history = historyFor(p.id), intelligence = priceIntelligence(history);
  const low30 = intelligence.day30.sufficient ? intelligence.day30.low : null;
  const low90 = intelligence.day90.sufficient ? intelligence.day90.low : null;
  const allLow = intelligence.allTime.sufficient ? intelligence.allTime.low : null;
  const alternatives = alternativesFor(p);
  const alternativeIds = new Set(alternatives.map(product => product.id));
  const related = p.brand_slug ? uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug=? AND id<>? ORDER BY COALESCE(ranking_score,score) DESC,score DESC LIMIT 16`).all(p.market, p.brand_slug, p.id).filter(isPubliclyIndexable).filter(product => !alternativeIds.has(product.id))).slice(0, 4) : [];
  const offerGroup = sameProductOffers(p);
  const offerRows = offerGroup.offers;
  const brief = createEditorialBrief(p, display, {
    language: req.language,
    store,
    marketName: marketName(p.market, req.language),
    reason: whyPicked(display, req.language)
  });
  const description = brief.seoDescription;
  const liveOffer = String(p.source || "").toLowerCase() !== "demo";
  const productNode = {"@type":"Product","@id":`${canonical}#product`,url:canonical,sku:String(p.provider_external_id||p.external_id||p.id),name:title,category:displayCategory,brand:p.brand?{"@type":"Brand",name:p.brand}:undefined,manufacturer:p.manufacturer?{"@type":"Organization",name:p.manufacturer}:undefined,mpn:p.mpn||undefined,gtin:p.gtin||p.ean||p.upc||undefined,image:p.image_url?[p.image_url]:undefined,description:brief.verdict,aggregateRating:Number(p.rating)>0&&Number(p.review_count)>0?{"@type":"AggregateRating",ratingValue:Number(p.rating),reviewCount:Number(p.review_count),bestRating:5,worstRating:1}:undefined};
  const schemaOffers = offerRows.map(offer => {
    const offerState = offerAvailability(offer.availability);
    const eligible = String(offer.source || "").toLowerCase() !== "demo" && /^https?:\/\//i.test(String(offer.affiliate_url || "")) && Number(offer.current_price) > 0 && /^[A-Z]{3}$/.test(String(offer.currency || "").toUpperCase()) && offerState;
    return eligible ? {"@type":"Offer",url:canonical,priceCurrency:String(offer.currency).toUpperCase(),price:Number(offer.current_price),availability:offerState,itemCondition:"https://schema.org/NewCondition",seller:{"@type":"Organization",name:storeName(offer)}} : null;
  }).filter(Boolean);
  if (schemaOffers.length) productNode.offers = schemaOffers.length === 1 ? schemaOffers[0] : schemaOffers;
  const productSchema = {"@context":"https://schema.org","@graph":[productNode,{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:t(req.language,"page.home"),item:SITE+marketPath(p.market)},{"@type":"ListItem",position:2,name:displayCategory,item:SITE+catPath(category,p.market)},...(p.brand?[{"@type":"ListItem",position:3,name:p.brand,item:SITE+brandPath(p.brand,p.market)}]:[]),{"@type":"ListItem",position:p.brand?4:3,name:title,item:canonical}]}]};
  const brandBlock = p.brand ? `<p class="eyebrow">${esc(t(req.language,"product.brand"))}: <a href="${brandPath(p.brand, p.market)}">${esc(p.brand)}</a></p>` : `<p class="eyebrow">${esc(store)}</p>`;
  const relatedBlock = related.length ? `<section class="deals-section related-drops"><div class="section-heading"><div><p class="eyebrow">${esc(brief.copy.related.toUpperCase())}</p><h2>${esc(t(req.language,"page.moreBrandDeals",{brand:p.brand}))}</h2></div><a href="${brandPath(p.brand, p.market)}">${esc(t(req.language,"page.viewAll"))} →</a></div><div class="grid">${related.map(product => productCard(product, 0, req.language, "related")).join("")}</div></section>` : "";
  const checkedAt = p.checked_at || p.updated_at;
  const checkedLabel = checkedAt && !Number.isNaN(new Date(checkedAt).getTime())
    ? new Date(checkedAt).toLocaleString(pageLocale)
    : t(req.language,"page.recently");
  const offerMatchLabels = {
    gtin:t(req.language,"product.offerMatchGtin"),
    "brand-model-variant":t(req.language,"product.offerMatchModel"),
    "provider-product":t(req.language,"product.offerMatchProvider")
  };
  const offerCountLabel = offerGroup.offerCount === 1
    ? t(req.language,"product.offerCountOne")
    : t(req.language,"product.offerCountMany",{count:offerGroup.offerCount});
  const offerSummaryBlock = `<aside class="product-offer-summary" data-offer-match="${esc(offerGroup.identity.matchType)}"><div><strong>${esc(offerCountLabel)}</strong>${offerGroup.identity.reliable ? `<span>${esc(offerMatchLabels[offerGroup.identity.matchType] || t(req.language,"product.offerMatchSafe"))}</span>` : ""}</div><p>${esc(t(req.language,"product.offerMatchSafe"))}</p></aside>`;
  const currentOffer = hasCurrentOffer(p);
  const retailerDetails = liveOffer ? `<div class="detail-grid retailer-detail-grid" aria-label="${esc(t(req.language,"product.offerDetails"))}"><section><h3>${esc(t(req.language,"product.retailer"))}</h3><p>${esc(store)}</p></section><section><h3>${esc(t(req.language,"product.soldBy"))}</h3><p>${esc(clean(p.seller_name) || t(req.language,"product.confirmRetailer"))}</p></section><section><h3>${esc(t(req.language,"product.delivery"))}</h3><p>${esc(display.display_shipping_summary)}</p></section><section><h3>${esc(t(req.language,"product.returns"))}</h3><p>${esc(display.display_return_summary)}</p></section><section><h3>${esc(t(req.language,"page.availability"))}</h3><p>${esc(display.display_availability)}</p></section>${currentOffer ? `<section><h3>${esc(t(req.language,"page.priceChecked"))}</h3><p>${esc(checkedLabel)}</p></section>` : ""}</div>` : "";
  const historyLabel = stats => stats.sufficient ? money(stats.low,p.currency,pageLocale) : t(req.language,"page.notEnoughHistory");
  const ratingSummary = Number(p.rating)>0&&Number(p.review_count)>0
    ? `<section><h3>${esc(t(req.language,"page.customerRating"))}</h3><p>${esc(t(req.language,"product.ratingSummary",{rating:Number(p.rating).toFixed(1),count:Number(p.review_count).toLocaleString(pageLocale)}))}</p></section>`
    : "";
  const scoreBlock = scoreMetrics(display, req.language);
  const shopUrl = retailerShopUrl(p);
  const retailerActions = `<div class="card-actions retailer-actions"><a class="featured-button" href="${esc(outboundPath(p, { sourcePage:"product", placement:"product_cta", action:"view_deal" }))}" ${externalAttributes}>${esc(t(req.language,"product.viewDealAt",{store}))} →</a>${shopUrl ? `<a class="price-history-link retailer-shop-link" href="${esc(outboundPath(p, { sourcePage:"product", placement:"shop_all", action:"shop_all" }))}" ${externalAttributes}>${esc(t(req.language,"product.shopAllAt",{store}))} →</a>` : ""}${askDeliaButton(display, req.language)}</div>`;
  const briefBlock = `<section id="buying-brief" class="buying-brief" aria-labelledby="buyingBriefTitle"><header class="buying-brief-header"><div><p class="eyebrow">${esc(brief.eyebrow)}</p><h2 id="buyingBriefTitle">${esc(brief.heading)}</h2></div><p class="verified-editorial-note">✓ ${esc(brief.verifiedNote)}</p></header><div class="quick-verdict"><strong>${esc(brief.copy.quickVerdict)}</strong><p>${esc(brief.verdict)}</p></div><dl class="buying-facts">${brief.facts.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl><div class="brief-pros-cons"><section><h3>✓ ${esc(brief.copy.strengths)}</h3><ul>${brief.strengths.map(item => `<li>${esc(item)}</li>`).join("")}</ul></section><section><h3>! ${esc(brief.copy.watchouts)}</h3><ul>${brief.watchouts.map(item => `<li>${esc(item)}</li>`).join("")}</ul></section></div><div class="buying-brief-grid">${brief.sections.map(section => `<section class="buying-brief-section buying-brief-${esc(section.key)}"><h3>${esc(section.title)}</h3>${section.paragraphs.map(paragraph => `<p>${esc(paragraph)}</p>`).join("")}${section.key === "score" ? `<div class="score-component-list">${brief.components.map(component => `<div class="score-component"><span>${esc(component.label)}</span><div aria-hidden="true"><i style="--component:${Math.round(component.points/component.max*100)}%"></i></div><strong>${component.points}/${component.max}</strong></div>`).join("")}</div>` : ""}</section>`).join("")}</div></section>`;
  const comparisonOffers = offerRows.filter(offer => String(offer.source || "").toLowerCase() !== "demo" && /^https?:\/\//i.test(String(offer.affiliate_url || "")) && Number(offer.current_price) > 0);
  const bestOfferId = Number(comparisonOffers[0]?.id || 0);
  const offerComparisonBlock = offerGroup.identity.reliable && comparisonOffers.length > 1 ? `<section class="offer-comparison" data-offer-comparison="reliable-entity-v1" aria-labelledby="offerComparisonTitle"><div class="section-heading compact-heading"><div><p class="eyebrow">${esc(brief.copy.compareOffers.toUpperCase())}</p><h2 id="offerComparisonTitle">${esc(brief.compareOffersTitle)}</h2><p>${esc(brief.compareOffersIntro)} ${esc(t(req.language,"product.offerMatchSafe"))}</p></div></div><div class="offer-comparison-list">${comparisonOffers.map(offer => { const offerDisplay=presentProduct(localizeProduct(offer,req.language),req.language); const offerStore=storeName(offer); const offerChecked=offer.checked_at||offer.updated_at; const offerCheckedLabel=offerChecked&&!Number.isNaN(new Date(offerChecked).getTime())?new Date(offerChecked).toLocaleString(pageLocale):t(req.language,"page.recently"); return `<article class="verified-offer${Number(offer.id)===bestOfferId?" is-best-offer":""}" data-verified-offer="${Number(offer.id)}">${Number(offer.id)===bestOfferId?`<span class="best-offer-badge">${esc(t(req.language,"product.bestCurrentPrice"))}</span>`:""}<div class="offer-merchant"><strong>${esc(offerStore)}</strong><span>${esc(clean(offer.seller_name)||offerStore)}</span></div><div class="offer-price"><strong>${money(offer.current_price,offer.currency,pageLocale)}</strong><span>${esc(offerDisplay.display_shipping_summary)} · ${esc(offerDisplay.display_return_summary)}</span><small>${esc(t(req.language,"product.offerChecked",{date:offerCheckedLabel}))}</small></div><a href="${esc(outboundPath(offer,{sourcePage:"product",placement:"offer_comparison",action:"view_deal"}))}" ${externalAttributes}>${esc(brief.copy.viewOffer)} →</a></article>`; }).join("")}</div></section>` : "";
  const alternativesBlock = alternatives.length ? `<section class="alternatives-section" aria-labelledby="alternativesTitle"><div class="section-heading compact-heading"><div><p class="eyebrow">${esc(brief.copy.alternatives.toUpperCase())}</p><h2 id="alternativesTitle">${esc(brief.alternativesTitle)}</h2><p>${esc(brief.alternativesIntro)}</p></div></div><div class="alternative-grid">${alternatives.map(product => alternativeCard(product,req.language)).join("")}</div></section>` : "";
  const priceDetails = !currentOffer
    ? `<div class="detail-grid"><section><h3>${esc(t(req.language,"product.currentPrice"))}</h3><p>${esc(t(req.language,"product.checkPrice"))} ${esc(store)}</p></section></div>`
    : `<div class="detail-grid"><section><h3>${esc(t(req.language,"product.currentPrice"))}</h3><p>${money(p.current_price,p.currency,pageLocale)}</p></section>${ratingSummary}<section><h3>${esc(t(req.language,"page.low30"))}</h3><p>${historyLabel(intelligence.day30)}</p></section><section><h3>${esc(t(req.language,"page.low90"))}</h3><p>${historyLabel(intelligence.day90)}</p></section><section><h3>${esc(t(req.language,"page.lowAll"))}</h3><p>${historyLabel(intelligence.allTime)}</p></section></div><section id="price-history" class="editorial-box">${retailerDetails}<h2>${esc(t(req.language,"page.priceHistory"))}</h2>${chartSvg(history,req.language,p.market)}<p>${esc(t(req.language,"page.historySummary",{observations:history.length,days:intelligence.allTime.distinctDays}))}</p></section>`;
  const body = `<main class="product-page" data-product-offer-ui="reliable-entity-v1"><nav class="breadcrumb"><a href="${marketPath(p.market)}">${esc(t(req.language,"page.home"))}</a><span>›</span><a href="${catPath(category,p.market)}">${esc(displayCategory)}</a>${p.brand?`<span>›</span><a href="${brandPath(p.brand,p.market)}">${esc(p.brand)}</a>`:""}<span>›</span><span>${esc(title)}</span></nav><article class="product-detail"><div class="product-detail-media"><img src="${esc(p.image_url)}" alt="${esc(hasRetailerImage(p) ? title : `${store} ${t(req.language,"product.editorPick")}`)}" decoding="async" fetchpriority="high"></div><div class="product-detail-content">${brandBlock}<h1>${esc(title)}</h1>${scoreBlock}<p class="product-lead">${esc(brief.verdict)}</p>${offerSummaryBlock}<a class="brief-jump-link" href="#buying-brief">${esc(brief.eyebrow)} ↓</a>${priceDetails}<div class="product-price-box"><span class="product-price">${currentOffer ? money(p.current_price,p.currency,pageLocale) : `${esc(t(req.language,"product.checkPrice"))} ${esc(store)}`}</span>${currentOffer && p.original_price?`<span class="old">${money(p.original_price,p.currency,pageLocale)}</span>`:""}<small>${esc(t(req.language,"page.finalPrice"))}</small></div>${retailerActions}</div></article>${briefBlock}${offerComparisonBlock}${alternativesBlock}${relatedBlock}</main>`;
  const enrichedBody = currentOffer ? body : body.replace('<div class="product-price-box">', `${retailerDetails}<div class="product-price-box">`);
  const robots = isPubliclyIndexable(p) ? "" : "noindex,follow";
  if (robots) res.set("X-Robots-Tag", "noindex, follow");
  res.send(shell(brief.seoTitle, description, canonical, enrichedBody, productSchema, p.image_url, robots, p.market, marketCodes, req));
});

app.get("/category/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const localizedMarketName = marketName(selectedMarket.code, req.language);
  const all = uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all(selectedMarket.code)).filter(isPubliclyIndexable);
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
  const priceRange = prices.length ? `${money(Math.min(...prices), selectedMarket.currency, pageLocale)} – ${money(Math.max(...prices), selectedMarket.currency, pageLocale)}` : t(req.language,"page.checkCurrentOffers");
  const averageRating = ratings.length ? `${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)} / 5` : t(req.language,"page.notAvailable");
  const categorySummary = `<div class="detail-grid"><section><h2>Products checked</h2><p>${products.length}</p></section><section><h2>Current price range</h2><p>${esc(priceRange)}</p></section><section><h2>Average rating</h2><p>${esc(averageRating)}</p></section></div><section class="editorial-box"><h2>${esc(t(req.language,"page.howSelectCategory",{category:categoryTitle.toLowerCase()}))}</h2><p>${esc(t(req.language,"page.categoryMethod",{country:localizedMarketName}))}</p></section>`;
  const alternateCodes = marketCodes.filter(code => db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND category=?`).all(code, category).some(isPubliclyIndexable));
  res.send(shell(t(req.language,"seo.categoryTitle",{category:categoryTitle,country:localizedMarketName}), description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="${marketPath(selectedMarket.code)}">${esc(t(req.language,"page.home"))}</a><span>›</span><span>${esc(t(req.language,"seo.categoryHeading",{category:categoryTitle}))}</span></nav><div class="section-heading"><div><p class="eyebrow">${esc(localizedMarketName.toUpperCase())} · ${esc(t(req.language,"nav.categories").toUpperCase())}</p><h1>${esc(t(req.language,"seo.categoryHeading",{category:categoryTitle}))}</h1><p>${esc(description)}</p></div><p class="result-count">${count}</p></div>${categorySummary}<div class="grid">${products.map((product,index)=>productCard(product,index+1,req.language,"category")).join("")}</div></section></main>`, schema, "", "", selectedMarket.code, alternateCodes, req));
});

app.get("/search", (req, res) => {
  const selectedMarket = requestMarket(req);
  const rows = searchRowsForMarket(selectedMarket.code);
  const interpreted = applySearchIntent(req.query, rows);
  let invalidFilters = false;
  let options;
  try {
    options = parseSearchOptions({...interpreted.query, limit:24});
  } catch {
    invalidFilters = true;
    options = parseSearchOptions({q:req.query.q, limit:24});
  }
  let result = searchCatalogProducts(rows, options);
  if (result.pagination.total_pages > 0 && options.page > result.pagination.total_pages) {
    options = {...options,page:result.pagination.total_pages};
    result = searchCatalogProducts(rows, options);
  }
  const query = options.query;
  const displayQuery = interpreted.intent.originalQuery || query;
  const products = result.products;
  const pagination = result.pagination;
  const searchPath = marketPath(selectedMarket.code, "/search");
  const preserveLanguage = req.language !== defaultLanguages[selectedMarket.code];
  const state = {
    query,
    categories:options.categories,
    merchants:options.merchants,
    availability:options.availability,
    minimumPrice:options.minimumPrice,
    maximumPrice:options.maximumPrice,
    sort:options.sort,
    page:options.page
  };
  const searchHref = (overrides = {}) => {
    const next = {...state,...overrides};
    const params = new URLSearchParams();
    if (next.query) params.set("q",next.query);
    if (next.categories?.length) params.set("category",next.categories.join(","));
    if (next.merchants?.length) params.set("merchant",next.merchants.join(","));
    if (next.availability && next.availability !== "available") params.set("availability",next.availability);
    if (next.minimumPrice != null) params.set("min_price",String(next.minimumPrice));
    if (next.maximumPrice != null) params.set("max_price",String(next.maximumPrice));
    if (next.sort && next.sort !== "best_match") params.set("sort",next.sort);
    if (Number(next.page) > 1) params.set("page",String(next.page));
    if (preserveLanguage) params.set("lang",req.language);
    return `${searchPath}${params.size ? `?${params}` : ""}`;
  };
  const hidden = (name,value) => value == null || value === "" ? "" : `<input type="hidden" name="${name}" value="${esc(value)}">`;
  const selectedCategories = new Set(options.categories);
  const selectedMerchants = new Set(options.merchants);
  const categoryFacets = [...result.facets.categories];
  options.categories.forEach(value => {
    if (!categoryFacets.some(facet => facet.value === value)) categoryFacets.push({value,count:0});
  });
  const merchantFacets = [...result.facets.merchants];
  options.merchants.forEach(value => {
    if (!merchantFacets.some(facet => facet.value === value)) merchantFacets.push({value,count:0});
  });
  const checkbox = (name,facet,selected,label) => `<label class="search-facet-option"><input type="checkbox" name="${name}" value="${esc(facet.value)}" ${selected.has(facet.value)?"checked":""}><span>${esc(label)}</span><small>${Number(facet.count).toLocaleString(languageTag(selectedMarket.code,req.language))}</small></label>`;
  const activeFilters = [
    ...options.categories.map(value => ({label:categoryLabel(value,req.language),href:searchHref({categories:options.categories.filter(item=>item!==value),page:1})})),
    ...options.merchants.map(value => ({label:value,href:searchHref({merchants:options.merchants.filter(item=>item!==value),page:1})})),
    ...(options.minimumPrice != null ? [{label:`${t(req.language,"search.minPrice")}: ${money(options.minimumPrice,selectedMarket.currency,languageTag(selectedMarket.code,req.language))}`,href:searchHref({minimumPrice:null,page:1})}] : []),
    ...(options.maximumPrice != null ? [{label:`${t(req.language,"search.maxPrice")}: ${money(options.maximumPrice,selectedMarket.currency,languageTag(selectedMarket.code,req.language))}`,href:searchHref({maximumPrice:null,page:1})}] : []),
    ...(options.availability !== "available" ? [{label:t(req.language,`search.availability.${options.availability}`),href:searchHref({availability:"available",page:1})}] : [])
  ];
  const filterFields = `${hidden("q",query)}${hidden("sort",options.sort)}${preserveLanguage?hidden("lang",req.language):""}`;
  const filterPanel = `<details class="search-filters" data-results-filters><summary><span>${esc(t(req.language,"search.filters"))}</span><strong>${activeFilters.length||""}</strong></summary><form class="search-filter-body" action="${searchPath}" method="get">${filterFields}${invalidFilters?`<p class="search-filter-error" role="alert">${esc(t(req.language,"search.invalidFilters"))}</p>`:""}<fieldset><legend>${esc(t(req.language,"search.categories"))}</legend><div class="search-facet-list">${categoryFacets.slice(0,16).map(facet=>checkbox("category",facet,selectedCategories,categoryLabel(facet.value,req.language))).join("")}</div></fieldset><fieldset><legend>${esc(t(req.language,"search.stores"))}</legend><div class="search-facet-list">${merchantFacets.slice(0,16).map(facet=>checkbox("merchant",facet,selectedMerchants,facet.value)).join("")}</div></fieldset><fieldset><legend>${esc(t(req.language,"search.price"))}</legend><div class="search-price-fields"><label><span>${esc(t(req.language,"search.minPrice"))}</span><input name="min_price" type="number" min="0" step="0.01" inputmode="decimal" value="${options.minimumPrice??""}"></label><label><span>${esc(t(req.language,"search.maxPrice"))}</span><input name="max_price" type="number" min="0" step="0.01" inputmode="decimal" value="${options.maximumPrice??""}"></label></div></fieldset><fieldset><legend>${esc(t(req.language,"search.availability"))}</legend><select name="availability"><option value="available" ${options.availability==="available"?"selected":""}>${esc(t(req.language,"search.availability.available"))}</option><option value="in_stock" ${options.availability==="in_stock"?"selected":""}>${esc(t(req.language,"search.availability.in_stock"))}</option><option value="known" ${options.availability==="known"?"selected":""}>${esc(t(req.language,"search.availability.known"))}</option></select></fieldset><button class="search-apply-button" type="submit">${esc(t(req.language,"search.applyFilters"))}</button><a class="search-clear-filters" href="${esc(searchHref({categories:[],merchants:[],availability:"available",minimumPrice:null,maximumPrice:null,page:1}))}">${esc(t(req.language,"search.clearFilters"))}</a></form></details>`;
  const sortHidden = `${hidden("q",query)}${options.categories.length?hidden("category",options.categories.join(",")):""}${options.merchants.length?hidden("merchant",options.merchants.join(",")):""}${options.availability!=="available"?hidden("availability",options.availability):""}${hidden("min_price",options.minimumPrice)}${hidden("max_price",options.maximumPrice)}${preserveLanguage?hidden("lang",req.language):""}`;
  const sorts = [["best_match","search.sort.bestMatch"],["price_asc","search.sort.priceLow"],["price_desc","search.sort.priceHigh"],["newest","search.sort.newest"],["quality","search.sort.quality"]];
  const sortForm = `<form class="search-sort" action="${searchPath}" method="get">${sortHidden}<label for="searchSort">${esc(t(req.language,"search.sortBy"))}</label><select id="searchSort" name="sort">${sorts.map(([value,key])=>`<option value="${value}" ${options.sort===value?"selected":""}>${esc(t(req.language,key))}</option>`).join("")}</select><button type="submit">${esc(t(req.language,"search.applySort"))}</button></form>`;
  const intentApplied = interpreted.intent.inferred.length > 0;
  const activeFilterLabel = intentApplied ? t(req.language,"search.intentFilters") : t(req.language,"search.activeFilters");
  const activeFilterBar = activeFilters.length ? `<div class="active-search-filters${intentApplied?" is-intent-driven":""}" aria-label="${esc(activeFilterLabel)}"><span>${intentApplied?"✦ ":""}${esc(activeFilterLabel)}</span>${activeFilters.map(filter=>`<a href="${esc(filter.href)}" aria-label="${esc(t(req.language,"search.removeFilter",{filter:filter.label}))}">${esc(filter.label)} ×</a>`).join("")}${intentApplied?`<small>${esc(t(req.language,"search.intentNote"))}</small>`:""}</div>` : "";
  const firstResult = pagination.total ? (pagination.page-1)*pagination.limit+1 : 0;
  const lastResult = Math.min(pagination.total,pagination.page*pagination.limit);
  const pageNumbers = [];
  for (let page=Math.max(1,pagination.page-2);page<=Math.min(pagination.total_pages,pagination.page+2);page++) pageNumbers.push(page);
  const paginationHtml = pagination.total_pages>1 ? `<nav class="search-pagination" aria-label="${esc(t(req.language,"search.pagination"))}">${pagination.has_previous?`<a rel="prev" href="${esc(searchHref({page:pagination.page-1}))}">← ${esc(t(req.language,"search.previous"))}</a>`:`<span aria-disabled="true">← ${esc(t(req.language,"search.previous"))}</span>`}<div>${pageNumbers.map(page=>`<a href="${esc(searchHref({page}))}" ${page===pagination.page?'aria-current="page"':""}>${page}</a>`).join("")}</div>${pagination.has_next?`<a rel="next" href="${esc(searchHref({page:pagination.page+1}))}">${esc(t(req.language,"search.next"))} →</a>`:`<span aria-disabled="true">${esc(t(req.language,"search.next"))} →</span>`}</nav>` : "";
  const resultSummary = t(req.language,"search.showing",{first:firstResult,last:lastResult,count:pagination.total});
  const cards = products.map((product,index)=>searchResultCard(product,(pagination.page-1)*pagination.limit+index+1,req.language,Boolean(query))).join("");
  const empty = displayQuery ? t(req.language,"page.searchNoMatch",{query:displayQuery}) : t(req.language,"page.searchPrompt");
  const results = products.length ? `<div class="grid search-results-grid">${cards}</div>${paginationHtml}` : `<div class="empty-state">${esc(empty)}<div class="empty-actions"><a class="primary-cta" href="${esc(searchHref({categories:[],merchants:[],availability:"available",minimumPrice:null,maximumPrice:null,page:1}))}">${esc(t(req.language,"search.clearFilters"))}</a></div></div>`;
  const body = `<main class="search-results-page" data-results-ui="facets-sorting-badges-v1" data-search-intent="${intentApplied?"parsed-v1":"plain"}" data-analytics-page="search" data-analytics-query="${esc(displayQuery)}" data-analytics-result-count="${pagination.total}"><section class="search-results-hero"><p class="eyebrow">${esc(marketName(selectedMarket.code,req.language).toUpperCase())} · ${esc(t(req.language,"search.results").toUpperCase())}</p><h1>${displayQuery?`${esc(t(req.language,"search.resultsFor"))} “${esc(displayQuery)}”`:esc(t(req.language,"search.allProducts"))}</h1><form class="results-page-search" action="${searchPath}" method="get" role="search"><input name="q" type="search" value="${esc(displayQuery)}" placeholder="${esc(t(req.language,"search.placeholder"))}" aria-label="${esc(t(req.language,"search.short"))}">${preserveLanguage?hidden("lang",req.language):""}<button type="submit">${esc(t(req.language,"search.short"))}</button></form><p class="search-badge-explanation">${esc(t(req.language,"search.badgeExplanation"))}</p></section>${activeFilterBar}<div class="search-results-toolbar"><p>${esc(resultSummary)}</p>${sortForm}</div><div class="search-results-layout">${filterPanel}<section class="search-results-list" aria-live="polite">${results}</section></div></main>`;
  const canonicalPath = marketPath(selectedMarket.code, "/search");
  res.send(shell(`${displayQuery ? `${displayQuery} Deals in ${selectedMarket.name}` : `Search ${selectedMarket.name} Deals`} | OneDailyDrop`, `Search OneDailyDrop deals in ${selectedMarket.name}${displayQuery ? ` for ${displayQuery}` : ""}.`, `${SITE}${canonicalPath}${displayQuery ? `?q=${encodeURIComponent(displayQuery)}` : ""}`, body, null, "", "noindex,follow", selectedMarket.code, marketCodes, req));
});

app.get("/archive", (req, res) => {
  const selectedMarket = requestMarket(req);
  const pageLocale = languageTag(selectedMarket.code, req.language);
  const today = localDate(selectedMarket.timezone);
  const products = db.prepare(`
    SELECT p.*,d.drop_date,d.rank,d.score AS drop_score,d.score_model AS drop_score_model,d.current_price AS drop_price,
      d.original_price AS drop_original_price,
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
  const body = `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(marketName(selectedMarket.code, req.language).toUpperCase())} · ${esc(t(req.language,"nav.archive").toUpperCase())}</p><h1>${esc(t(req.language,"page.pastDrops"))}</h1><p class="description">${esc(t(req.language,"page.archiveDescription"))}</p></div></div><div class="archive-list">${dates || `<div class="empty-state">${esc(t(req.language,"page.archivePreparing"))}</div>`}</div></section></main>`;
  res.send(shell(`${t(req.language,"page.pastDrops")} | OneDailyDrop`, t(req.language,"page.archiveDescription"), `${SITE}${marketPath(selectedMarket.code, "/archive")}`, body, null, "", products.length ? "" : "noindex,follow", selectedMarket.code, marketCodes, req));
});

app.get("/brand/:slug", (req, res) => {
  const selectedMarket = requestMarket(req);
  const products = uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug=? ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all(selectedMarket.code, req.params.slug)).filter(isPubliclyIndexable);
  if (!products.length) return sendNotFound(req, res);
  const brand = products[0].brand, canonical = SITE + brandPath(brand, selectedMarket.code), avgPrice = products.reduce((sum,p)=>sum+Number(p.current_price||0),0)/products.length, avgRating = products.reduce((sum,p)=>sum+Number(p.rating||0),0)/products.length, avgDiscount = products.reduce((sum,p)=>sum+discountPercent(p),0)/products.length;
  const alternateCodes = marketCodes.filter(code => db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug=?`).all(code, req.params.slug).some(isPubliclyIndexable));
  const description = t(req.language,"page.brandDescription",{count:products.length,brand});
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"Brand",name:brand,url:canonical},{"@type":"ItemList",name:`Best ${brand} Deals`,numberOfItems:products.length,itemListElement:products.map((product,index)=>({"@type":"ListItem",position:index+1,url:SITE+dealPath(product),name:shortTitle(product.title)}))},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:SITE+marketPath(selectedMarket.code)},{"@type":"ListItem",position:2,name:"Brands",item:SITE+marketPath(selectedMarket.code,"/brands")},{"@type":"ListItem",position:3,name:brand,item:canonical}]}]};
  const stats = `<div class="detail-grid"><section><h3>${esc(t(req.language,"page.products"))}</h3><p>${products.length}</p></section><section><h3>${esc(t(req.language,"page.averagePrice"))}</h3><p>${money(avgPrice,products[0].currency,languageTag(selectedMarket.code,req.language))}</p></section><section><h3>${esc(t(req.language,"page.averageRating"))}</h3><p>${avgRating.toFixed(1)} / 5</p></section><section><h3>${esc(t(req.language,"page.averageDiscount"))}</h3><p>${Math.round(avgDiscount)}%</p></section></div>`;
  res.send(shell(`${brand} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><nav class="breadcrumb"><a href="${marketPath(selectedMarket.code)}">${esc(t(req.language,"page.home"))}</a><span>›</span><a href="${marketPath(selectedMarket.code, "/brands")}">${esc(t(req.language,"page.brands"))}</a><span>›</span><span>${esc(brand)}</span></nav><div class="section-heading"><div><p class="eyebrow">${esc(marketName(selectedMarket.code,req.language).toUpperCase())} · ${esc(t(req.language,"page.brands").toUpperCase())}</p><h1>${esc(t(req.language,"page.moreBrandDeals",{brand}))}</h1><p>${esc(description)}</p></div></div>${stats}<div class="grid">${products.map((product,index)=>productCard(product,index+1,req.language,"brand")).join("")}</div></section></main>`, schema, "", "", selectedMarket.code, alternateCodes, req));
});

app.get("/brands", (req, res) => {
  const selectedMarket = requestMarket(req);
  const brands = summarizeBrands(db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug<>'' ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all(selectedMarket.code).filter(product => isPubliclyIndexable(product) && !isGenericBrand(product.brand_slug)));
  if (!brands.length) {
    res.set("X-Robots-Tag", "noindex, follow");
    return sendNotFound(req, res);
  }
  const canonical = SITE + marketPath(selectedMarket.code, "/brands"), description = t(req.language,"page.brandDescription",{count:brands.length,brand:marketName(selectedMarket.code,req.language)});
  const alternateCodes = marketCodes.filter(code => db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug<>''`).all(code).some(product => isPubliclyIndexable(product) && !isGenericBrand(product.brand_slug)));
  const schema = {"@context":"https://schema.org","@type":"ItemList",name:"Popular Brands",numberOfItems:brands.length,itemListElement:brands.map((brand,index)=>({"@type":"ListItem",position:index+1,url:SITE+brandPath(brand.brand,selectedMarket.code),name:brand.brand}))};
  const cards = brands.map(brand => `<article class="card"><div class="card-content"><p class="eyebrow">${esc(t(req.language,"search.products",{count:brand.product_count}).toUpperCase())}</p><h2><a href="${brandPath(brand.brand, selectedMarket.code)}">${esc(brand.brand)}</a></h2><p>${esc(t(req.language,"page.averagePrice"))}: ${money(brand.avg_price, selectedMarket.currency,languageTag(selectedMarket.code,req.language))} · ${esc(t(req.language,"page.averageRating"))}: ${Number(brand.avg_rating||0).toFixed(1)}</p></div></article>`).join("");
  res.send(shell(`${t(req.language,"page.popularBrands")} | OneDailyDrop`, description, canonical, `<main><section class="deals-section"><div class="section-heading"><div><p class="eyebrow">${esc(marketName(selectedMarket.code,req.language).toUpperCase())}</p><h1>${esc(t(req.language,"page.popularBrands"))}</h1></div><p class="result-count">${esc(t(req.language,"search.products",{count:brands.length}))}</p></div><div class="grid">${cards}</div></section></main>`, schema, "", brands.length ? "" : "noindex,follow", selectedMarket.code, alternateCodes, req));
});

app.get("/robots.txt", (req, res) => res
  .set("Cache-Control", "public, max-age=3600")
  .type("text/plain")
  .send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /go/\nDisallow: /us/go/\nDisallow: /ca/go/\nDisallow: /uk/go/\nDisallow: /fr/go/\nDisallow: /de/go/\n\nSitemap: ${SITE}/sitemap.xml\n`));
app.get("/sitemap.xml", (req, res) => {
  const products = uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE status='published' AND ${sourceSql()} ORDER BY market,COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all())
    .filter(isPubliclyIndexable);
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
  const brandMarkets = new Map();
  for (const product of products) {
    const key = slug(product.category);
    if (!categoryMarkets.has(key)) categoryMarkets.set(key, new Set());
    categoryMarkets.get(key).add(product.market);
    if (product.brand_slug && !isGenericBrand(product.brand_slug)) {
      if (!brandMarkets.has(product.brand_slug)) brandMarkets.set(product.brand_slug, new Set());
      brandMarkets.get(product.brand_slug).add(product.market);
    }
  }
  const archiveMarkets = new Set(db.prepare(`SELECT DISTINCT d.market FROM daily_drops d JOIN products p ON p.id=d.product_id WHERE ${sourceSql("p")}`).all().map(row => row.market));
  const brandsMarkets = new Set(products.filter(product => product.brand_slug).map(product => product.market));
  for (const code of marketCodes) {
    const marketProducts = products.filter(product => product.market === code);
    const categories = [...new Set(marketProducts.map(product => product.category).filter(Boolean))];
    const brands = [...new Map(marketProducts.filter(product => product.brand_slug && !isGenericBrand(product.brand_slug)).map(product => [product.brand_slug, product.brand])).values()];
    const latestUpdate = marketProducts.map(product => validLastmod(product.updated_at)).filter(Boolean).sort().at(-1);
    urls.push({ loc: SITE + marketPath(code), alternates: localizedAlternates("/"), lastmod: latestUpdate });
    if (archiveMarkets.has(code)) urls.push({ loc: SITE + marketPath(code, "/archive"), alternates: localizedAlternates("/archive", [...archiveMarkets]), lastmod: latestUpdate });
    if (brands.length) urls.push({ loc: SITE + marketPath(code, "/brands"), alternates: localizedAlternates("/brands", [...brandsMarkets]), lastmod: latestUpdate });
    categories.forEach(value => urls.push({
      loc: SITE + catPath(value, code),
      alternates: localizedAlternates(`/category/${slug(value)}`, [...(categoryMarkets.get(slug(value)) || [])]),
      lastmod: marketProducts.filter(product => product.category === value).map(product => validLastmod(product.updated_at)).filter(Boolean).sort().at(-1)
    }));
    brands.forEach(value => urls.push({
      loc: SITE + brandPath(value, code),
      alternates: localizedAlternates(`/brand/${slugifyBrand(value)}`, [...(brandMarkets.get(slugifyBrand(value)) || [])]),
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
    Object.keys(trustPages).forEach(pathname => urls.push({
      loc: SITE + marketPath(code, pathname),
      alternates: localizedAlternates(pathname)
    }));
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
app.post("/api/click-events", (req, res) => {
  const productId = Number(req.body?.productId);
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({error:"Invalid product."});
  const product = db.prepare(`SELECT * FROM products WHERE id=? AND status='published' AND ${sourceSql()}`).get(productId);
  if (!product) return res.sendStatus(404);
  const action = normalizeAction(req.body?.action);
  if (action !== "view_details") return res.status(400).json({error:"Unsupported internal click action."});
  recordClick(req, product, {
    sourcePage:req.body?.sourcePage,
    placement:req.body?.placement,
    action,
    destinationType:"internal",
    sessionId:req.body?.sessionId,
    eventId:req.body?.eventId
  });
  return res.sendStatus(204);
});
app.post("/api/analytics/events", (req, res) => {
  const submitted = Array.isArray(req.body?.events) ? req.body.events : [req.body];
  if (!submitted.length || submitted.length > 50) return res.status(400).json({error:"Submit between 1 and 50 events."});
  const selectedMarket = normalizeMarket(req.body?.market || submitted[0]?.market) || requestMarket(req).code;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO analytics_events(
      event_id,session_id,event_type,market,source_page,placement,product_id,position,
      query_text,result_count,occurred_at,received_at,referrer,user_agent
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const productById = db.prepare(`SELECT id,market FROM products WHERE id=? AND status='published' AND ${sourceSql()}`);
  try {
    db.transaction(events => {
      for (const event of events) {
        const eventId = analyticsToken(event?.eventId);
        const sessionId = analyticsToken(event?.sessionId);
        const eventType = String(event?.eventType || "").trim().toLowerCase();
        if (!eventId || !sessionId || !new Set(["search", "impression"]).has(eventType)) throw new Error("Invalid analytics event.");
        const productId = eventType === "impression" ? Number(event?.productId) : null;
        if (eventType === "impression") {
          const product = Number.isInteger(productId) && productId > 0 ? productById.get(productId) : null;
          if (!product || product.market !== selectedMarket) throw new Error("Invalid impression product.");
        }
        const resultCount = eventType === "search" && Number.isInteger(Number(event?.resultCount))
          ? Math.max(0, Math.min(100000, Number(event.resultCount)))
          : null;
        insert.run(
          eventId,
          sessionId,
          eventType,
          selectedMarket,
          normalizeSourcePage(event?.sourcePage),
          normalizePlacement(event?.placement),
          productId,
          analyticsPosition(event?.position),
          eventType === "search" ? clean(event?.query).slice(0, 80) : "",
          resultCount,
          now,
          now,
          String(req.get("referer") || "").slice(0, 1000),
          String(req.get("user-agent") || "").slice(0, 500)
        );
      }
    })(submitted);
  } catch (error) {
    return res.status(400).json({error:error.message});
  }
  return res.sendStatus(204);
});
app.get("/api/admin/click-analytics", admin, (req, res) => {
  const requestedDays = Number(req.query.days || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, Math.round(requestedDays))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const events = db.prepare(`
    SELECT c.market,c.retailer_name,c.source_page,c.placement,c.action_type,c.destination_type,
      c.product_id,p.title,COUNT(*) AS clicks,MAX(c.clicked_at) AS last_clicked_at
    FROM clicks c
    LEFT JOIN products p ON p.id=c.product_id
    WHERE c.clicked_at>=?
    GROUP BY c.market,c.retailer_name,c.source_page,c.placement,c.action_type,c.destination_type,c.product_id,p.title
    ORDER BY clicks DESC,last_clicked_at DESC
  `).all(since);
  const totals = db.prepare(`
    SELECT COUNT(*) AS all_clicks,
      SUM(CASE WHEN destination_type='internal' THEN 1 ELSE 0 END) AS internal_product_clicks,
      SUM(CASE WHEN destination_type='retailer' THEN 1 ELSE 0 END) AS retailer_clicks,
      SUM(CASE WHEN action_type='shop_all' THEN 1 ELSE 0 END) AS shop_all_clicks
    FROM clicks WHERE clicked_at>=?
  `).get(since);
  res.json({days,since,totals,events});
});
app.get("/api/admin/analytics-baseline", admin, (req, res) => {
  const requestedDays = Number(req.query.days || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, Math.round(requestedDays))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const appTotals = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type='search' THEN 1 ELSE 0 END) AS searches,
      SUM(CASE WHEN event_type='impression' THEN 1 ELSE 0 END) AS impressions,
      COUNT(DISTINCT CASE WHEN event_type='search' THEN session_id END) AS search_sessions,
      SUM(CASE WHEN event_type='search' AND result_count=0 THEN 1 ELSE 0 END) AS zero_result_searches
    FROM analytics_events WHERE occurred_at>=?
  `).get(since);
  const clickTotals = db.prepare(`
    SELECT
      SUM(CASE WHEN destination_type='internal' THEN 1 ELSE 0 END) AS product_clicks,
      SUM(CASE WHEN destination_type='retailer' THEN 1 ELSE 0 END) AS outbound_clicks
    FROM clicks WHERE clicked_at>=?
  `).get(since);
  const searches = Number(appTotals.searches || 0);
  const impressions = Number(appTotals.impressions || 0);
  const searchSessions = Number(appTotals.search_sessions || 0);
  const productClicks = Number(clickTotals.product_clicks || 0);
  const outboundClicks = Number(clickTotals.outbound_clicks || 0);
  const queries = db.prepare(`
    SELECT market,query_text,COUNT(*) AS searches,
      ROUND(AVG(result_count),2) AS average_results,
      SUM(CASE WHEN result_count=0 THEN 1 ELSE 0 END) AS zero_result_searches
    FROM analytics_events
    WHERE event_type='search' AND occurred_at>=?
    GROUP BY market,query_text
    ORDER BY searches DESC,query_text ASC
    LIMIT 100
  `).all(since);
  const merchants = db.prepare(`
    SELECT market,retailer_name,COUNT(*) AS outbound_clicks
    FROM clicks
    WHERE destination_type='retailer' AND clicked_at>=?
    GROUP BY market,retailer_name
    ORDER BY outbound_clicks DESC,retailer_name ASC
  `).all(since);
  res.json({
    days,
    since,
    totals:{
      searches,
      impressions,
      product_clicks:productClicks,
      outbound_clicks:outboundClicks,
      search_sessions:searchSessions,
      zero_result_searches:Number(appTotals.zero_result_searches || 0)
    },
    rates:{
      searches_per_session:searchSessions ? searches / searchSessions : 0,
      result_ctr:impressions ? productClicks / impressions : 0,
      outbound_ctr:impressions ? outboundClicks / impressions : 0,
      zero_result_rate:searches ? Number(appTotals.zero_result_searches || 0) / searches : 0
    },
    queries,
    merchants
  });
});
app.get("/api/admin/ranking-validation", admin, (req, res) => {
  const products = db.prepare(`
    SELECT * FROM products
    WHERE status='published' AND ${sourceSql()}
    ORDER BY market,COALESCE(ranking_score,score) DESC,updated_at DESC
  `).all();
  res.json(rankingValidationReport(products, {topK:req.query.top}));
});
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
  const catalog = uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE ${conditions.join(" AND ")} ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all(...params)).filter(isPubliclyIndexable);
  const daily = db.prepare(`
    SELECT product_id,rank,score AS drop_score,score_model AS drop_score_model,current_price AS drop_price,
      original_price AS drop_original_price,drop_date,selection_reason
    FROM daily_drops
    WHERE market=? AND drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=?)
  `).all(selectedMarket, selectedMarket);
  const dailyById = new Map(daily.map(row => [row.product_id, row]));
  const products = [...catalog].sort((left, right) => {
    const leftRank = dailyById.get(left.id)?.rank || Number.MAX_SAFE_INTEGER;
    const rightRank = dailyById.get(right.id)?.rank || Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank ||
      Number(right.ranking_score ?? right.score ?? 0) - Number(left.ranking_score ?? left.score ?? 0) ||
      Number(right.score || 0) - Number(left.score || 0);
  });
  res.json(products.map(product => {
    const snapshot = dailyById.get(product.id);
    return presentProduct(localizeProduct({
      ...product,
      daily_rank: snapshot?.rank || null,
      drop_score: snapshot?.drop_score ?? null,
      drop_score_model: snapshot?.drop_score_model || null,
      drop_price: snapshot?.drop_price ?? null,
      drop_original_price: snapshot?.drop_original_price ?? null,
      drop_date: snapshot?.drop_date || null,
      selection_reason: snapshot?.selection_reason || product.selection_reason,
      slug: slug(product.title),
      deal_url: dealPath(product),
      category_url: catPath(product.category || "deals", selectedMarket),
      brand_url: product.brand ? brandPath(product.brand, selectedMarket) : null
    }, req.language), req.language);
  }));
});
app.get("/api/brands", (req,res) => {
  const selectedMarket = normalizeMarket(req.query.market) || requestMarket(req).code;
  const brands = summarizeBrands(db.prepare(`SELECT * FROM products WHERE market=? AND status='published' AND ${sourceSql()} AND brand_slug<>'' ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC`).all(selectedMarket).filter(product => isPubliclyIndexable(product) && !isGenericBrand(product.brand_slug)));
  res.json(brands.map(brand => ({...brand,url:brandPath(brand.brand, selectedMarket)})));
});
app.get("/api/brands/:slug", (req,res) => { const products = uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE status='published' AND ${sourceSql()} AND brand_slug=? ORDER BY COALESCE(ranking_score,score) DESC,score DESC`).all(req.params.slug)).filter(isPubliclyIndexable); if (!products.length) return res.status(404).json({error:"Brand not found"}); const brand = products[0].brand; res.json({brand,slug:req.params.slug,url:brandPath(brand),summary:{products:products.length,average_price:products.reduce((s,p)=>s+Number(p.current_price||0),0)/products.length,average_rating:products.reduce((s,p)=>s+Number(p.rating||0),0)/products.length,average_discount:products.reduce((s,p)=>s+discountPercent(p),0)/products.length,total_clicks:db.prepare(`SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE c.destination_type='retailer' AND ${sourceSql("p")} AND p.brand_slug=?`).get(req.params.slug).n},products:products.map(p=>({...p,deal_url:dealPath(p)}))}); });
app.get("/api/products/:id/price-history", (req,res) => { const product = db.prepare(`SELECT id,title,current_price,currency FROM products WHERE id=? AND status='published' AND ${sourceSql()}`).get(req.params.id); if (!product) return res.status(404).json({error:"Product not found"}); const history = historyFor(product.id); res.json({product,summary:{observations:history.length,lowest_30_days:minSince(history,30),lowest_90_days:minSince(history,90),lowest_ever:history.length?Math.min(...history.map(row=>Number(row.price)).filter(Number.isFinite)):null},history}); });
app.get("/api/status", (req,res) => {
  const latestRun = db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null;
  const providers = enabledProviders(c);
  res.json({
    provider:c.provider,
    sources:providers.map(provider => ({id:provider.id, source:provider.source, name:provider.name, markets:provider.markets})),
    retailerCoverage:retailerCoverage(providers),
    products:db.prepare(`SELECT COUNT(*) n FROM products WHERE status='published' AND ${sourceSql()}`).get().n,
    brands:db.prepare(`SELECT COUNT(DISTINCT brand_slug) n FROM products WHERE status='published' AND ${sourceSql()} AND brand_slug<>''`).get().n,
    clicks:db.prepare(`SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE c.destination_type='retailer' AND ${sourceSql("p")}`).get().n,
    priceObservations:db.prepare(`SELECT COUNT(*) n FROM price_history h JOIN products p ON p.id=h.product_id WHERE ${sourceSql("p")}`).get().n,
    lastRun:c.liveRefreshEnabled ? latestRun : null
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
app.get("/api/admin/automation-status", admin, (req,res) => {
  const sourceRuns = db.prepare("SELECT * FROM source_refresh_runs ORDER BY id DESC LIMIT 100").all();
  const alerts = db.prepare("SELECT * FROM automation_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100").all();
  const distribution = db.prepare("SELECT market,drop_date,channel,status,updated_at,delivered_at FROM distribution_queue ORDER BY drop_date DESC,id DESC LIMIT 100").all();
  res.json({
    enabledSources:enabledProviders(c).map(provider => ({id:provider.id, source:provider.source, name:provider.name, markets:provider.markets})),
    retailerCoverage:retailerCoverage(enabledProviders(c)),
    schedules:{daily:c.refreshCron,offerCheck:c.offerCheckCron},
    sourceRuns,
    alerts,
    distribution
  });
});
app.get("/go/:id", (req,res) => {
  res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "private, no-store");
  const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id);
  if (!product || !isPublicSource(product.source) || (req.market && req.market !== product.market)) return res.sendStatus(404);
  const requestedAction = normalizeAction(req.query.action);
  if (!new Set(["view_deal", "shop_all"]).has(requestedAction)) return res.status(400).send("Unsupported retailer action.");
  const destination = requestedAction === "shop_all" ? retailerShopUrl(product) : String(product.affiliate_url || "");
  let destinationUrl;
  try {
    destinationUrl = new URL(destination);
  } catch {
    return res.sendStatus(404);
  }
  if (!/^https?:$/.test(destinationUrl.protocol)) return res.sendStatus(404);
  recordClick(req, product, {
    sourcePage:req.query.source,
    placement:req.query.placement,
    action:requestedAction,
    destinationType:"retailer",
    sessionId:req.query.sid,
    eventId:req.query.eid
  });
  res.redirect(302, destinationUrl.toString());
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
  app.listen(c.port, () => {
    console.log(`http://localhost:${c.port}`);
    // Azure production recovery is owned by app.js so only one initial API
    // pass can run. Keep this convenience bootstrap for local development.
    if (c.isProduction || c.provider === "unconfigured") return;
    setImmediate(async () => {
      for (const marketCode of c.markets) {
        const sourceCount = db.prepare(
          `SELECT COUNT(*) n FROM products WHERE market=? AND status='published' AND ${sourceSql()}`
        ).get(marketCode).n;
        if (!sourceCount) await refreshProducts(c, {market:marketCode}).catch(console.error);
      }
    });
  });
})();
