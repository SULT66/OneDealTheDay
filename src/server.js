const { relatedProducts } = require("./relatedProducts");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const { SECURITY_HEADERS } = require("./securityHeaders");
const cron = require("node-cron");
const Stripe = require("stripe");
const db = require("./db");
const {
  bootstrapPersonalPostgres,
  health: personalPostgresHealth,
} = require("./personalPostgres");
const c = require("./config");
const { refreshProducts, localDate } = require("./refresh");
const { runLinkHealthCheck } = require("./linkHealth");
const {
  dropState, hostGreeting, hostRevealLine, presentDrop,
  sendDueReminders, sendStagedReminders, announceDropToSubscribers, sendLiveNowNotices,
} = require("./liveDrop");
const { sendDuePriceDrops } = require("./priceWatches");
const { cacheKey, readCachedAnswer, writeCachedAnswer } = require("./deliaCache");
const { tavusProductDetails } = require("./tavusProductTool");
const {
  fetchRetailerIcon,
  normalizeIconHost,
  readCachedIcon,
  pinRetailerIcon,
  storeUploadedIcon,
  writeCachedIcon,
} = require("./retailerIcons");
const {
  authorizationUrl,
  createState,
  exchangeCodeForTokens,
  googleConfig,
  statesMatch,
  verifiedGoogleProfile,
} = require("./googleAuth");
const { detectBrand, normalizeBrand, slugifyBrand } = require("./brandDetector");
const { reasonFor } = require("./demoEditorial");
const { localizeProduct } = require("./demoTranslations");
const { priceIntelligence } = require("./priceIntelligence");
const { capPerSourceAndCategory, sourceSql, isPublicSource, uniqueProductsInOrder } = require("./publicCatalog");
const { enabledProviders, searchForAssistant } = require("./providers/registry");
const { coverage: retailerCoverage } = require("./retailerCatalog");
const { presentProduct } = require("./productPresentation");
const { PUBLIC_CATEGORIES, canonicalCategory, isPublicCategory } = require("./catalogTaxonomy");
const { deduplicationKeys, isDailyPickEligible, scoreOffers, selectUniqueProducts } = require("./ranker");
const { parseSearchOptions, searchCatalogProducts } = require("./catalogSearch");
const { applySearchIntent } = require("./searchIntent");
const { offerIdentity, offerSummary, sourceKey } = require("./productOffers");
const { rankingValidationReport } = require("./rankingValidation");
const { methodology } = require("./methodology");
const { createEditorialBrief } = require("./editorialBrief");
const {
  createShoppingAssistant,
  mergeShoppingMission,
  shoppingMissionText,
  timeoutResponse,
} = require("./shoppingAssistant");
const renderShoppingAssistantPanel = require("./shoppingAssistantPanel");
const {
  welcomeEmail,
  liveDropSaveTheDateEmail, liveDropStartingSoonEmail, liveDropAnnouncementEmail, liveDropLiveNowEmail, priceDropEmail,
  priceWatchStartedEmail,
  passwordResetEmail, subscriptionEmail, clubWaitlistEmail, liveDropReminderEmail, deliveryTestEmail } = require("./mailer");
const { emailHealth } = require("./emailHealth");
const { htmlCache } = require("./htmlCache");
const { startCacheWarmer, pathsFor } = require("./cacheWarmer");
const { readEbayStock, refreshDropStock, ebayItemIdFrom } = require("./liveStock");
const { comparableFor, refreshComparables } = require("./comparables");
const { updateTrackedPrices } = require("./trackedPrice");
const { indexEvidence, isIndexableProduct } = require("./indexability");
const { missingQueries, pruneSearches, searchDemand } = require("./searchQueries");
const { checkAmazonLinks } = require("./amazonLinkHealth");
const { overview } = require("./overview");
const { pageViewRow, recordPageView } = require("./pageViews");
const {
  chatMessageInput, chatMessages, endFinishedBroadcasts, ensureBroadcast,
  hostInstructionCue, idleCue, postChatMessage, questionsCue, revealCue, takeNextQuestions,
  HOST_PHASES, chatStatus, queuePosition, setBroadcastPhase,
} = require("./liveHost");
const {
  ensureWeeklySnapshot, listWeeklySnapshots, nextWeekClose, notInternal, periodMetrics,
  REPORT_TIMEZONE, lastCompletedWeek,
} = require("./growthMetrics");
const { PUBLIC_PREFIX: PUBLIC_MEDIA_PREFIX, mediaDirectory, saveUpload } = require("./dropMedia");
const {
  normalizeAction,
  normalizePlacement,
  normalizeSourcePage,
  outboundPath
} = require("./retailerLinks");
const { storefrontUrl } = require("./storefrontLinks");
const { hostLabel, verifyOutbound, withSignedLinks } = require("./outboundLinks");
const { matchConversations, normalizeQuery: normalizeConversationQuery } = require("./deliaConversationSearch");
const { labelClick, liveDropLabel } = require("./clickLabels");
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
/**
 * The Next.js frontend (app/) runs inside this same process — prepared once
 * here, awaited before `app.listen` below, and handed unmatched GET/HEAD
 * requests by the catch-all at the bottom of this file. `dir` points at the
 * repo root, where next.config.ts/app/ live, since this file sits in src/.
 * `dev` follows `c.isProduction` (the same Azure-environment check the rest
 * of this codebase already uses) rather than NODE_ENV, which nothing here
 * sets explicitly.
 */
const next = require("next");
const nextApp = next({ dev: !c.isProduction, dir: path.join(__dirname, "..") });
const handleNextRequest = nextApp.getRequestHandler();
/* Last-resort guard only: the assistant runs to its own, smaller deadline
   (TOTAL_RESPONSE_BUDGET_MS in src/shoppingAssistant.js) so its fallback can
   still return the products it found. This has to stay clear of that deadline
   plus the response assembly after it, otherwise it fires first and answers
   with an empty product list, which is the failure it exists to catch. */
const SHOPPING_ASSISTANT_HARD_TIMEOUT_MS = 58000;
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

/*
 * Security headers, minus the one that hid where every click came from.
 *
 * helmet's default is `Referrer-Policy: no-referrer`, which nobody chose: it
 * arrived with the library and applied to the whole site. Commissions kept
 * working because attribution rides on parameters inside the link — campid,
 * clickref — so nothing ever looked broken.
 *
 * What it did break is the answer to "which page sent this visitor". The
 * merchant could not tell, our own reports could not tell, and an affiliate
 * network reviewing the site sees clicks arriving from nowhere — which is the
 * signature of the automated traffic they exist to screen out. Sovrn's code of
 * conduct names it directly: a publisher must not obscure the origin of a link.
 *
 * strict-origin-when-cross-origin is the modern default and the honest one:
 * the full path stays inside the site, and anyone we send a visitor to learns
 * that the visitor came from onedailydrop.com. The outbound redirect widens
 * this deliberately — see the /go routes.
 */
app.use(helmet(SECURITY_HEADERS));




/*
 * What the policy would have blocked.
 *
 * Browsers send one of these per violation, and a single bad page can send
 * thousands, so they are counted rather than logged: one line per distinct
 * directive and blocked address, the first time it is seen and then every
 * hundredth. Read the log before enforcing the policy.
 */
const cspViolations = new Map();
app.post(
  "/api/csp-report",
  express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }),
  (req, res) => {
    const body = req.body?.["csp-report"] || req.body?.body || req.body || {};
    const directive = String(body["violated-directive"] || body.effectiveDirective || "unknown").slice(0, 60);
    const blocked = String(body["blocked-uri"] || body.blockedURL || "").slice(0, 120);
    const key = `${directive} <- ${blocked}`;
    const seen = (cspViolations.get(key) || 0) + 1;
    cspViolations.set(key, seen);
    if (seen === 1 || seen % 100 === 0) console.warn(`[csp] ${key} (${seen})`);
    if (cspViolations.size > 500) cspViolations.clear();
    res.status(204).end();
  },
);
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

/** How many conversations one shopper keeps. Older ones fall off the end. */
const KEPT_CONVERSATIONS = 40;
/* A whole answer, offers and all, is a few kilobytes. This is far above that
   and far below anything that would bloat the database if a response ever came
   back malformed and enormous. */
const MAX_STORED_PAYLOAD = 60_000;

/**
 * Writes one question and one answer into the shopper's history.
 *
 * Only for somebody signed in: there is nowhere to keep a conversation that
 * belongs to no account, and quietly storing one against an IP address would
 * be a worse answer than not storing it.
 *
 * Deliberately never throws into the request. A history that fails to save is
 * a disappointment; an answer that fails to arrive because the history failed
 * to save is a broken product.
 */
const rememberExchange = (req, marketCode, result) => {
  try {
    const user = currentUser(req);
    if (!user) return;
    const key = String(req.body?.conversation_id || "").trim().slice(0, 80);
    const question = savedText(req.body?.message).slice(0, 2000);
    if (!key || !question) return;

    const now = new Date().toISOString();
    const title = savedText(result?.conversation_title).slice(0, 120) || question.slice(0, 80);

    db.prepare(`INSERT INTO delia_conversations(user_id,conversation_key,market,title,created_at,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,conversation_key) DO UPDATE SET
        updated_at=excluded.updated_at,
        /* The title follows the conversation: asking about mattresses and then
           about a kettle should not leave the old heading on it. */
        title=excluded.title`).run(user.id, key, marketCode, title, now, now);

    const conversation = db.prepare("SELECT id FROM delia_conversations WHERE user_id=? AND conversation_key=?")
      .get(user.id, key);
    if (!conversation) return;

    const payload = JSON.stringify(result);
    const insert = db.prepare("INSERT INTO delia_messages(conversation_id,role,content,payload,created_at) VALUES(?,?,?,?,?)");
    insert.run(conversation.id, "user", question, "", now);
    insert.run(
      conversation.id,
      "assistant",
      savedText(result?.message).slice(0, 4000),
      payload.length <= MAX_STORED_PAYLOAD ? payload : "",
      now,
    );

    /* Keep the list a list. Without this it becomes an archive nobody scrolls
       and a table nobody prunes. */
    const stale = db.prepare(`SELECT id FROM delia_conversations WHERE user_id=?
      ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?`).all(user.id, KEPT_CONVERSATIONS);
    for (const row of stale) {
      db.prepare("DELETE FROM delia_messages WHERE conversation_id=?").run(row.id);
      db.prepare("DELETE FROM delia_conversations WHERE id=?").run(row.id);
    }
  } catch (error) {
    console.error(`[delia] could not save the conversation: ${error.message}`);
  }
};

/*
 * The same answer, with the working-out sent as it happens.
 *
 * A search takes thirty seconds. The panel used to fill that with labels on a
 * timer: "Searching the shops" at four seconds whether or not anything had
 * been searched, "Comparing the best of them" at twenty six whether or not
 * anything had been found. It is decoration, and a shopper who waits half a
 * minute in front of decoration leaves.
 *
 * This route sends the real milestones instead, one JSON object per line, and
 * the finished answer last. Newline-delimited rather than server-sent events
 * because the browser has to POST the question, and EventSource cannot.
 *
 * It is the same work as the plain route, called the same way, so anything
 * that cannot stream keeps using that one and loses nothing but the
 * commentary.
 */
app.post("/api/shopping-assistant/stream", shoppingAssistantRateLimit, async (req, res) => {
  const requestedMarket = normalizeMarket(req.body?.market);
  const selectedMarket = market(requestedMarket || req.market || marketFromIp(req).code);
  const requestedLanguage = String(req.body?.language || req.language || "en").trim().toLowerCase().split("-")[0];
  const language = ["en", "ru", "az", "es", "fr", "de"].includes(requestedLanguage) ? requestedLanguage : "en";

  const requestController = new AbortController();
  req.once("aborted", () => requestController.abort());
  res.once("close", () => {
    if (!res.writableEnded) requestController.abort();
  });

  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    /* Nginx and friends will otherwise hold the lines until the response ends,
       which is exactly the thirty seconds this is here to fill. */
    "X-Accel-Buffering": "no",
  });
  const send = (payload) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(withSignedLinks(payload))}\n`);
  };

  const key = cacheKey({
    message: req.body?.message,
    messages: req.body?.messages,
    shoppingMission: req.body?.shopping_mission,
    excludedOfferUrls: req.body?.excluded_offer_urls,
    productId: req.body?.product_id,
    marketCode: selectedMarket.code,
    language,
  });
  const cached = key ? readCachedAnswer(db, key) : null;
  if (cached) {
    rememberExchange(req, selectedMarket.code, cached);
    send({ type: "result", result: cached });
    return res.end();
  }

  let hardTimeoutTimer;
  try {
    const assistantTask = shoppingAssistant.respond({
      message: req.body?.message,
      messages: req.body?.messages,
      shoppingContext: req.body?.shopping_context,
      shoppingMission: req.body?.shopping_mission,
      excludedOfferUrls: req.body?.excluded_offer_urls,
      skipClarification: Boolean(req.body?.skip_clarification),
      shortlist: req.body?.shortlist,
      productId: req.body?.product_id,
      marketCode: selectedMarket.code,
      language,
      signal: requestController.signal,
      onProgress: (event) => send({ type: "progress", ...event }),
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
    if (key) {
      try {
        writeCachedAnswer(db, key, result);
      } catch (error) {
        console.error(`[delia] could not remember the answer: ${error.message}`);
      }
    }
    rememberExchange(req, selectedMarket.code, result);
    send({ type: "result", result });
    return res.end();
  } catch (error) {
    clearTimeout(hardTimeoutTimer);
    const status = Number(error.statusCode) || 502;
    if (status >= 500) console.error("Shopping assistant stream failed:", error.message);
    /* The status line has already gone out with a 200, so the failure has to
       travel in the body like everything else. */
    send({
      type: "error",
      error: status === 503
        ? "The AI Shopping Assistant is being connected. Please try again shortly."
        : status === 400
          ? error.message
          : "Delia could not answer that. Try again.",
    });
    return res.end();
  }
});

app.post("/api/shopping-assistant", shoppingAssistantRateLimit, async (req, res) => {
  const requestedMarket = normalizeMarket(req.body?.market);
  const selectedMarket = market(requestedMarket || req.market || marketFromIp(req).code);
  const requestedLanguage = String(req.body?.language || req.language || "en").trim().toLowerCase().split("-")[0];
  const language = ["en", "ru", "az", "es", "fr", "de"].includes(requestedLanguage) ? requestedLanguage : "en";
  const requestController = new AbortController();
  req.once("aborted", () => requestController.abort());
  res.once("close", () => {
    if (!res.writableEnded) requestControl…41400 tokens truncated…l()}`).get().n,
    brands:db.prepare(`SELECT COUNT(DISTINCT brand_slug) n FROM products WHERE status='published' AND ${sourceSql()} AND brand_slug<>''`).get().n,
    clicks:db.prepare(`SELECT COUNT(*) n FROM clicks c JOIN products p ON p.id=c.product_id WHERE c.destination_type='retailer' AND ${sourceSql("p")}`).get().n,
    priceObservations:db.prepare(`SELECT COUNT(*) n FROM price_history h JOIN products p ON p.id=h.product_id WHERE ${sourceSql("p")}`).get().n,
    lastRun:c.liveRefreshEnabled ? latestRun : null,
    personalDatabase:personalPostgresHealth()
  });
});
/*
 * The way out of the mailing list.
 *
 * The subscribers table has had a status column since the beginning and
 * nothing anywhere set it to unsubscribed: no route, no link in any email, no
 * way for a recipient to stop the mail except to report it as spam — the one
 * action that damages the sending domain for everybody else on it. In the
 * United States a bulk message with no working unsubscribe also breaks
 * CAN-SPAM.
 *
 * A token rather than an address, so the link works straight from an inbox
 * with no sign-in and nobody can unsubscribe a stranger by guessing their
 * email. GET for a person clicking it; POST for the one-click button Gmail and
 * Outlook render from the List-Unsubscribe header.
 */
const unsubscribeByToken = token => {
  const value = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(value)) return false;
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE subscribers SET status='unsubscribed', unsubscribed_at=?, updated_at=?
    WHERE unsubscribe_token=? AND status<>'unsubscribed'
  `).run(nowIso, nowIso, value);
  /* A second click on the same link is a success, not an error: the person
     asked to be off the list, and they are off it. */
  return db.prepare("SELECT 1 FROM subscribers WHERE unsubscribe_token=?").get(value) != null;
};

/*
 * Watch a price.
 *
 * No account, on purpose. The whole value is catching somebody who is looking
 * at one product and is not ready today — asking them to register first is
 * asking for the thing they came here to avoid. An address is enough to send
 * an email, and an email is all this promises.
 *
 * The price is read from the catalogue rather than taken from the request: a
 * number the browser sends is a number anybody can send, and this one decides
 * what "cheaper" means later.
 */
app.post("/api/price-watches", authRateLimit, express.json({limit:"4kb"}), (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    return res.status(400).json({error:"Enter a valid email address."});
  }
  const productId = Math.max(0, Math.round(Number(req.body?.product_id) || 0));
  const product = productId
    ? db.prepare("SELECT id, title, current_price, currency, market FROM products WHERE id=? AND status='published'").get(productId)
    : null;
  if (!product || !(Number(product.current_price) > 0)) {
    return res.status(404).json({error:"That listing is no longer available to watch."});
  }

  db.prepare(`
    INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(product_id,email) DO UPDATE SET
      /* Asking again re-arms a watch that already fired, and re-baselines it
         to today. Anything else means the second ask does nothing. */
      price_when_asked=excluded.price_when_asked,
      created_at=excluded.created_at,
      notified_at=NULL
  `).run(product.id, email, product.market || "us", Number(product.current_price), new Date().toISOString());

  /*
   * Tell them it worked.
   *
   * The watch was already being saved correctly and in complete silence,
   * which from the other side of the screen is indistinguishable from a form
   * that did nothing — the first person to use it assumed it had failed.
   *
   * Fire-and-forget: a mail provider having a bad minute must not turn a
   * watch that is safely stored into an error the visitor has to act on.
   */
  priceWatchStartedEmail({
    email,
    title: product.title,
    market: product.market || "us",
    dealPath: dealPath(product),
    price: Number(product.current_price).toFixed(2),
    currency: product.currency || "USD",
  }).catch(error => console.error(`[price-watch] confirmation to ${email}: ${error.message}`));

  res.status(201).json({ok:true, message:"Saved. Check your email — we just confirmed it."});
});

app.post("/unsubscribe", (req, res) => {
  res.set("Cache-Control", "no-store");
  const done = unsubscribeByToken(req.query.token || req.body?.token);
  return res.status(done ? 200 : 404).json({ok: done});
});

app.get("/unsubscribe", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "no-store");
  const done = unsubscribeByToken(req.query.token);
  const message = done
    ? "You have been unsubscribed. We will not email this address about Live Drops again."
    : "That unsubscribe link is not one we recognise. If you are still receiving email from us, reply to it and we will remove you by hand.";
  return res.status(done ? 200 : 404).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Unsubscribed - OneDailyDrop</title></head>
<body style="font-family:system-ui,Arial,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#17191d">
<h1 style="font-size:1.5rem">${done ? "Unsubscribed" : "Link not recognised"}</h1>
<p style="line-height:1.6">${esc(message)}</p>
<p><a href="/" style="color:#d95600;font-weight:600">Back to OneDailyDrop</a></p>
</body></html>`);
});

/* Rate limited: without it this form sends mail from our domain to any address
   anybody chooses, as fast as they can post to it. */
app.post("/api/subscribe", authRateLimit, async (req,res) => {
  /* The form sends the market the visitor is reading and this ignored it,
     deciding from the IP instead — so somebody browsing /uk was signed up to
     the American list. */
  const requestedMarket = normalizeMarket(req.body?.market);
  const selectedMarket = requestedMarket ? market(requestedMarket) : requestMarket(req);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const requested = Array.isArray(req.body?.categories) ? req.body.categories : [];
  const categories = [...new Set(requested.map(value => String(value).trim()).filter(Boolean))].slice(0, 12);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || email.length > 254) {
    return res.status(400).json({error:"Enter a valid email address."});
  }
  const now = new Date().toISOString();
  /* Which form it came from, so the one that works can be told from the one
     that does not. A short fixed list; anything else is the homepage. */
  const signupSource = ["homepage", "listing", "live-page"].includes(req.body?.source) ? req.body.source : "homepage";
  /* Minted once and kept, so every email this address ever receives carries
     the same working link — including the ones sent after they resubscribe. */
  const unsubscribeToken = crypto.randomBytes(24).toString("base64url");
  db.prepare(`
    INSERT INTO subscribers(email,categories,status,source,market,unsubscribe_token,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      /* The Live Drop form sends no categories, and signing up again from it
         must not wipe the ones an earlier form recorded. */
      categories=CASE WHEN excluded.categories='[]' THEN subscribers.categories ELSE excluded.categories END,
      status='active',market=excluded.market,updated_at=excluded.updated_at,
      unsubscribe_token=CASE WHEN subscribers.unsubscribe_token='' THEN excluded.unsubscribe_token ELSE subscribers.unsubscribe_token END
  `).run(email, JSON.stringify(categories), "active", signupSource, selectedMarket.code, unsubscribeToken, now, now);
  const storedToken = db.prepare("SELECT unsubscribe_token AS token FROM subscribers WHERE email=?").get(email)?.token;
  let emailSent = false;
  try {
    await subscriptionEmail({
      email,
      categories,
      market: selectedMarket.code,
      unsubscribeUrl: storedToken ? `${SITE}/unsubscribe?token=${encodeURIComponent(storedToken)}` : "",
    });
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
let adminRefreshJob = null;

function refreshJobResponse(job) {
  if (!job) return null;
  return {
    jobId:job.jobId,
    status:job.status,
    market:job.market,
    startedAt:job.startedAt,
    finishedAt:job.finishedAt || null,
    result:job.result || null,
    error:job.error || ""
  };
}

/*
 * A refresh is the heaviest thing this process does, and it must not start
 * while the process is still finding its feet.
 *
 * On 2026-09-09 a deploy finished at 04:34 and GitHub released a scheduled
 * refresh — delayed four and a half hours from its 00:15 slot — at 04:44.
 * It landed on a container that had been up ten minutes, on a plan with one
 * core. The site returned 503 for twenty-five minutes, the refresh itself
 * died after five, and the release check failed alongside it.
 *
 * The workflow had a wake-up step and it passed: /api/status answers in a
 * quarter of a second while page renders are still taking ten. Answering is
 * not the same as being ready, so readiness is decided here, where the
 * uptime actually is, and every caller is covered rather than the one
 * workflow that happened to cause it.
 */
/* Ten minutes, and settable — a test cannot wait that long, and neither can
   somebody who needs a refresh now and knows why the guard is there. */
const SETTLING_SECONDS = Number(process.env.REFRESH_SETTLING_SECONDS ?? 600);

app.post("/api/admin/refresh", admin, (req,res) => {
  const requestedMarket = normalizeMarket(req.query.market);
  const requestedSource = String(req.query.source || "").trim();
  if (requestedSource && (!requestedMarket || !enabledProviders(c).some(provider =>
    provider.id === requestedSource && provider.markets.includes(requestedMarket)
  ))) return res.status(400).json({error:"A source refresh requires an enabled source and its market."});
  const refreshOptions = {
    ...(requestedMarket ? {market:requestedMarket} : {}),
    ...(requestedSource ? {providerIds:[requestedSource], skipDailySelection:true} : {})
  };
  const settlingFor = Math.ceil(SETTLING_SECONDS - process.uptime());
  if (settlingFor > 0) {
    /* 503 with Retry-After, so a caller waits rather than treating this as a
       failure — the refresh is not refused, only postponed. */
    return res.status(503).set("Retry-After", String(settlingFor)).json({
      accepted: false,
      settling: true,
      retry_after_seconds: settlingFor,
      error: `This instance started ${Math.round(process.uptime())}s ago and is still settling. Try again in ${settlingFor}s.`,
    });
  }
  if (adminRefreshJob?.status === "running") {
    return res.status(202).json({accepted:false, alreadyRunning:true, ...refreshJobResponse(adminRefreshJob)});
  }

  const job = {
    jobId:crypto.randomUUID(),
    status:"running",
    market:requestedMarket || "all",
    startedAt:new Date().toISOString(),
    finishedAt:null,
    result:null,
    error:""
  };
  adminRefreshJob = job;

  // Azure's public HTTP gateway can end a request before a complete
  // multi-market refresh finishes. Return immediately and let the caller poll
  // the authenticated status endpoint while the existing refresh lock keeps
  // duplicate runs from starting for the same market.
  setImmediate(async () => {
    try {
      job.result = await refreshProducts(c, refreshOptions);
      /* New prices on the listings mean the rendered pages quoting the old
         ones are wrong, however fast they are to serve. */
      publicHtmlCache.clear();
      job.status = "success";
    } catch (error) {
      job.status = "failed";
      job.error = error?.message || "Catalog refresh failed";
      console.error(`Background catalog refresh failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  });

  return res.status(202).json({accepted:true, ...refreshJobResponse(job)});
});

app.get("/api/admin/refresh-status", admin, (req,res) => {
  if (!adminRefreshJob) return res.status(404).json({error:"No refresh job has been started in this application instance"});
  return res.json(refreshJobResponse(adminRefreshJob));
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
/*
 * The way out of the shop directory.
 *
 * Every other outbound link on the site is about one product, and carries that
 * product's id. This one is about a shop: somebody read the list of shops whose
 * listings we carry, recognised one, and wants to look around it. There is no
 * product to name.
 *
 * The link is still built from a product's, because that is the only link known
 * to work — the network ids live in it and nowhere else in this codebase. So a
 * listing from that shop is looked up, its link is converted to a front-door
 * link, and the click is recorded against the listing that supplied it. The
 * placement says where it came from, which is what separates it in the reports
 * from a shop-all click on a product page.
 *
 * Registered ahead of /go/:id. It would not be reached by that route in any
 * case — two segments where it takes one — but the order is the thing a reader
 * checks first, so it should not depend on that.
 */
/*
 * Headers for every link that leaves the site.
 *
 * The referrer is widened here on purpose, past the site-wide policy. A
 * merchant paying commission on a sale is entitled to know which page sent the
 * buyer, and an affiliate network reviewing us checks exactly that: it matches
 * the traffic sources a publisher declares against the sources actually
 * producing clicks. Under no-referrer every click we sent arrived from
 * nowhere, which is the signature of the automated traffic those checks exist
 * to catch.
 *
 * no-referrer-when-downgrade sends the full page URL to an https destination
 * and nothing at all to an http one. These are public catalogue pages; there
 * is nothing in their paths a shop should not see.
 */
function outboundHeaders(res) {
  return res
    .set("X-Robots-Tag", "noindex, nofollow")
    .set("Cache-Control", "private, no-store")
    .set("Referrer-Policy", "no-referrer-when-downgrade");
}

app.get("/api/coupons", (req, res) => {
  const market = String(req.query.market || req.market || "us").toLowerCase();
  res.set("Cache-Control", "no-store");
  res.json({market, coupons:[...require("./merchantCoupons").listCoupons(market), ...require("./marketplaceCoupons").listMarketplaceCoupons(db,market)]});
});

app.get("/go/coupon/:id", (req, res) => {
  outboundHeaders(res);
  const market = String(req.query.market || req.market || "us").toLowerCase();
  const destination = require("./merchantCoupons").couponDestination(req.params.id, market);
  if (!destination) return res.sendStatus(404);
  res.redirect(302, destination);
});

app.get("/go/store/:retailer", (req,res) => {
  outboundHeaders(res);
  const marketCode = req.market || marketFromIp(req).code;
  const slug = String(req.params.retailer || "").toLowerCase();
  const shopName = db
    .prepare("SELECT DISTINCT retailer_name FROM products WHERE market=? AND status='published' AND retailer_name<>''")
    .all(marketCode)
    .map(row => row.retailer_name)
    .find(name => categorySlug(name) === slug);
  if (!shopName) return res.sendStatus(404);
  /* Newest first, so the listing that lends its link is one the feed has
     confirmed recently rather than the oldest row we ever imported. Fifty is
     enough to get past a run of listings whose links cannot be converted
     without reading the whole shop. */
  const candidates = db
    .prepare("SELECT * FROM products WHERE market=? AND status='published' AND retailer_name=? ORDER BY id DESC LIMIT 50")
    .all(marketCode, shopName);
  let chosen = null;
  let destination = null;
  for (const product of candidates) {
    if (!isPublicSource(product.source)) continue;
    const link = storefrontUrl(product);
    if (!link) continue;
    chosen = product;
    destination = link.url;
    break;
  }
  /* No commissionable front door for this shop. Nothing is shown to send the
     visitor here, so arriving is already unusual; sending them out through a
     link that pays nobody would be worse than the 404. */
  if (!chosen) return res.sendStatus(404);
  recordClick(req, chosen, {
    sourcePage:"stores",
    placement:"store_directory",
    action:"shop_all",
    destinationType:"retailer",
    sessionId:req.query.sid,
    eventId:req.query.eid
  });
  res.redirect(302, destination);
});

/*
 * Out to somewhere we do not carry, counted like everything else.
 *
 * Delia's web findings used to link straight out. A shopper who took her
 * advice and bought was a shopper we sent for nothing, and nobody could tell
 * whether her suggestions were followed at all. This is also where an
 * affiliate network's rewrite goes once there is one — one door, so there is
 * one place to change.
 *
 * Only URLs this server signed are followed; see src/outboundLinks.js for why
 * that matters more than it sounds.
 */
app.get("/go/web", (req, res) => {
  outboundHeaders(res);
  const destination = verifyOutbound(req.query);
  if (!destination) return res.sendStatus(404);
  db.prepare(`
    INSERT INTO clicks(
      session_id,product_id,market,retailer_name,source_page,placement,action_type,
      destination_type,clicked_at,referrer,user_agent
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    analyticsToken(req.query.sid),
    /* No product id: this is not a listing we hold, and pretending otherwise
       would put a row in the funnel that no page can account for. */
    null,
    req.market || marketFromIp(req).code,
    hostLabel(destination),
    "delia",
    "delia_web_result",
    "view_deal",
    "retailer",
    new Date().toISOString(),
    String(req.get("referer") || "").slice(0, 1000),
    String(req.get("user-agent") || "").slice(0, 500),
  );
  return res.redirect(302, destination);
});

app.get("/go/:id", (req,res) => {
  outboundHeaders(res);
  const product = db.prepare("SELECT * FROM products WHERE id=? AND status='published'").get(req.params.id);
  if (!product || !isPublicSource(product.source) || (req.market && req.market !== product.market)) return res.sendStatus(404);
  const requestedAction = normalizeAction(req.query.action);
  if (!new Set(["view_deal", "shop_all"]).has(requestedAction)) return res.status(400).send("Unsupported retailer action.");
  /* A store link goes through the network the product link goes through, or it
     does not go at all — see src/storefrontLinks.js. Until this line it went to
     retailer_shop_url, which is the shop's own address with nothing in front of
     it: every basket filled after that click was bought by an anonymous visitor
     off the open web, and no commission was ever due on it. */
  const destination = requestedAction === "shop_all"
    ? storefrontUrl(product)?.url || ""
    : String(product.affiliate_url || "");
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

/*
 * The way out of a Live Drop.
 *
 * "Buy now" used to be the retailer link itself, printed into the page, and
 * two things followed from that. The click counted only if the browser's
 * analytics survived to report it. And the link stayed good in the HTML of a
 * tab left open, so a drop that had since closed still sent people out to buy
 * at whatever the shop charges now, with our drop price still on the screen
 * beside it.
 *
 * Here the drop's state is read at the moment of the click and the visit is
 * recorded by the server doing the redirecting. A drop that is over returns
 * the shopper to the Live page rather than to a price that has gone.
 */
app.get("/live/go/:key", (req, res) => {
  outboundHeaders(res);
  const drop = db
    .prepare("SELECT * FROM live_drops WHERE drop_key=? AND published=1")
    .get(String(req.params.key || "").trim().slice(0, 80));
  if (!drop) return res.sendStatus(404);
  const livePage = `/${drop.market}/live`;
  if (dropState(drop, Date.now()) !== "live") return res.redirect(302, livePage);
  /* Buying in a Live Drop takes a free account. The page hides the button
     from visitors, and this is what holds if somebody has the link anyway. */
  if (!currentUser(req)) {
    return res.redirect(302, `/${drop.market}/account?next=${encodeURIComponent(livePage)}`);
  }

  let destination;
  try {
    destination = new URL(String(drop.affiliate_url || ""));
  } catch {
    return res.redirect(302, livePage);
  }
  if (!/^https?:$/.test(destination.protocol)) return res.redirect(302, livePage);
  /*
   * Labelled with the drop, so a sale can be traced back to the event that
   * caused it.
   *
   * Until this line the Buy button sent the buyer out under the same label as
   * every other click on the site, so a drop could be watched by two hundred
   * people and sell twelve units with no report anywhere connecting the twelve
   * to the drop. The whole reason to run a first Live is to be able to tell a
   * retailer what it produced.
   */
  destination = new URL(labelClick(destination.toString(), liveDropLabel(drop.drop_key)));

  const sessionId = analyticsToken(req.query.sid);
  if (sessionId) {
    try {
      /*
       * Recorded as its own step, not as the button press.
       *
       * The panel already writes buy_click the moment the button is pressed,
       * in the browser. This is the other half: the visitor actually arrived
       * here and is being handed to the shop. They are different numbers —
       * a blocked script loses the first, a cancelled navigation loses the
       * second — and writing both under one name made the gap invisible.
       */
      db.prepare(
        "INSERT INTO live_drop_events(drop_id,market,event_type,session_id,occurred_at) VALUES(?,?,?,?,?)",
      ).run(drop.id, drop.market, "buy_handoff", sessionId, new Date().toISOString());
    } catch (error) {
      /* One row per session per event: a second click is the same person. */
      if (!String(error.message).includes("UNIQUE")) throw error;
    }
  }
  res.redirect(302, destination.toString());
});

/*
 * Scheduling a Live Drop from a browser instead of an SSH session.
 *
 * The mechanic only works if the drop can be put on the calendar at the right
 * moment by the person running it, and until now that meant a command line on
 * the production host. Everything here sits behind the same admin key as the
 * refresh endpoints.
 *
 * Two rules are enforced by the server rather than by the form, because both
 * rewrite history rather than merely being untidy:
 *
 *   - Nothing about a drop that has already opened may be edited except the
 *     remaining stock. Changing the price or the clock afterwards would mean
 *     the page no longer says what people were actually shown.
 *   - Only a draft can be deleted. Once a drop has run, the row is the record
 *     of what was offered and at what price, and that record is the answer to
 *     any later question about it.
 */
const liveDropInput = (body) => {
  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const money = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
  };
  const startAt = Date.parse(String(body?.start_at || ""));
  const minutes = Number(body?.duration_minutes);
  const quantity = Number(body?.quantity_total);
  const url = text(body?.affiliate_url, 1000);

  const errors = [];
  if (!text(body?.title, 200)) errors.push("A drop needs a title.");
  if (!Number.isFinite(startAt)) errors.push("The start time is not a valid date.");
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) errors.push("Length must be between 1 and 240 minutes.");
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) errors.push("Stock must be a whole number.");
  if (url && !/^https?:\/\//i.test(url)) errors.push("The buy link must start with http:// or https://.");
  if (!normalizeMarket(body?.market)) errors.push("Unknown market.");
  if (errors.length) return { errors };

  return {
    drop: {
      market: normalizeMarket(body.market),
      title: text(body.title, 200),
      brand: text(body.brand, 120),
      retailer_name: text(body.retailer_name, 120),
      image_url: text(body.image_url, 1000),
      /* The product in use, beside the product itself. */
      secondary_image_url: text(body.secondary_image_url, 1000),
      retail_price: money(body.retail_price),
      drop_price: money(body.drop_price),
      currency: text(body.currency, 3).toUpperCase() || "USD",
      quantity_total: quantity,
      quantity_remaining: quantity,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(startAt + minutes * 60000).toISOString(),
      member_early_access_seconds: Math.max(0, Math.min(3600, Math.round(Number(body.member_early_access_seconds) || 0))),
      affiliate_url: url,
      video_url: text(body.video_url, 1000),
      stream_embed_url: text(body.stream_embed_url, 1000),
      terms: text(body.terms, 2000),
      host_script_intro: text(body.host_script_intro, 4000),
      host_script_reveal: text(body.host_script_reveal, 2000),
    },
  };
};

app.get("/api/admin/live-drops", admin, (req, res) => {
  const now = Date.now();
  const rows = db.prepare("SELECT * FROM live_drops ORDER BY start_at DESC LIMIT 50").all();
  /* The funnel alongside each drop, because "did it work" is the only question
     worth asking afterwards and it should not need a second screen. */
  /* The owner's own visits to a drop are not the audience (src/growthMetrics.js). */
  const funnel = db.prepare(`SELECT event_type, COUNT(*) AS total FROM live_drop_events WHERE drop_id=? AND ${notInternal("session_id")} GROUP BY event_type`);
  /*
   * How many people the drop reached at all, which none of the event counts
   * answers on its own.
   *
   * Somebody who arrives before the doors open records waiting_room; somebody
   * who arrives once it is running records reveal and never records the other.
   * Reading either as "visitors" undercounts, and reading the sum double-counts
   * everyone who did both. Distinct sessions across every event is the only
   * honest answer to "how many people saw this".
   */
  const reached = db.prepare(
    `SELECT COUNT(DISTINCT session_id) AS people FROM live_drop_events WHERE drop_id=? AND session_id<>'' AND ${notInternal("session_id")}`,
  );
  /*
   * Asked for, and actually delivered, as two separate numbers.
   *
   * A rehearsal signed one person up and the console showed "reminders: 1",
   * which read as success right up to the moment no email arrived. The send
   * had failed — mail delivery was not configured at all — and a failure
   * leaves reminded_at null, which at a glance is the same as "not due yet".
   * Worse, sendDueReminders only looks at drops that have not started, so once
   * the drop opens the row can never be retried and the failure has nowhere
   * left to appear.
   */
  const reminders = db.prepare(`
    SELECT COUNT(*) AS total, COUNT(reminded_at) AS sent,
      COUNT(reminded_at) + COUNT(reminded_day_before_at) + COUNT(reminded_hour_before_at) AS emails
    FROM live_drop_reminders WHERE drop_id=?
  `);

  /* Who was told this drop existed at all, which is the step before anybody
     could arrive. A drop nobody was told about and a drop nobody wanted look
     the same in the funnel without it. */
  const announced = db.prepare("SELECT COUNT(*) AS sent FROM live_drop_announcements WHERE drop_id=?");

  /* Who is on the page right now. The funnel above keeps one row per session
     for the whole drop, so it counts everybody who ever arrived and never
     notices anyone leaving; "watching now" is a different question and needs
     a row that expires. Sixty seconds, matching the page heartbeat. */
  const watchingNow = db.prepare(
    `SELECT COUNT(*) AS people FROM live_drop_presence WHERE drop_id=? AND seen_at>=? AND ${notInternal("session_id")}`,
  );

  res.json({
    /* The market list comes from the server so the form cannot offer one that
       does not exist. */
    markets: c.markets,
    server_now: new Date(now).toISOString(),
    /* Said plainly, because a drop with reminders and no mail delivery looks
       exactly like a drop that is going fine until the moment it is not. */
    email_delivery: process.env.SENDGRID_API_KEY ? "configured" : "not configured",
    drops: rows.map((row) => {
      const reminderCounts = reminders.get(row.id);
      return {
      ...presentDrop(row, now),
      /* The admin sees the price before the reveal: they set it. */
      drop_price: row.drop_price,
      affiliate_url: row.affiliate_url,
      published: Boolean(row.published),
      reminders: reminderCounts.total,
      reminders_sent: reminderCounts.sent,
      reminders_unsent: reminderCounts.total - reminderCounts.sent,
      /* Every reminder email that went out: up to three per person. */
      reminder_emails_sent: reminderCounts.emails,
      /* Whether it was ever public, which decides whether it can be deleted. */
      ever_published: Boolean(row.first_published_at),
      funnel: Object.fromEntries(funnel.all(row.id).map((entry) => [entry.event_type, entry.total])),
      reached: reached.get(row.id).people,
      /* What to search the network report for once the drop is over. The site
         never learns about a purchase — that happens on the shop's own
         checkout — so this label is the only thread connecting a sale in
         Awin, eBay or Rakuten back to this drop. */
      announced: announced.get(row.id).sent,
      watching_now: watchingNow.get(row.id, new Date(now - 60000).toISOString()).people,
      /* Whether the remaining count is the shop's or ours. A drop whose
         listing gives no exact quantity can still run — it simply never
         shows a countdown. */
      stock_verified_at: row.stock_verified_at || null,
      stock_checked_at: row.stock_checked_at || null,
      /* Prefilled into the media editor, so saving cannot blank a field it
         could not see. */
      image_url: row.image_url || "",
      secondary_image_url: row.secondary_image_url || "",
      video_url: row.video_url || "",
      stream_embed_url: row.stream_embed_url || "",
      host_script_intro: row.host_script_intro || "",
      host_script_reveal: row.host_script_reveal || "",
      stock_is_live: Boolean(row.stock_verified_at && now - Date.parse(row.stock_verified_at) <= 2 * 60 * 1000),
      click_label: liveDropLabel(row.drop_key),
      };
    }),
  });
});

app.post("/api/admin/live-drops", admin, (req, res) => {
  const { errors, drop } = liveDropInput(req.body);
  if (errors) return res.status(400).json({error:errors.join(" ")});

  const nowIso = new Date().toISOString();
  const dropKey = `drop_${nowIso.slice(0, 10).replace(/-/g, "_")}_${crypto.randomBytes(3).toString("hex")}`;
  db.prepare(`INSERT INTO live_drops(
    drop_key,market,title,brand,retailer_name,image_url,secondary_image_url,retail_price,drop_price,currency,
    quantity_total,quantity_remaining,start_at,end_at,member_early_access_seconds,
    affiliate_url,video_url,stream_embed_url,terms,host_script_intro,host_script_reveal,published,created_at,updated_at
  ) VALUES(
    @drop_key,@market,@title,@brand,@retailer_name,@image_url,@secondary_image_url,@retail_price,@drop_price,@currency,
    @quantity_total,@quantity_remaining,@start_at,@end_at,@member_early_access_seconds,
    @affiliate_url,@video_url,@stream_embed_url,@terms,@host_script_intro,@host_script_reveal,0,@created_at,@updated_at
  )`).run({...drop, drop_key:dropKey, created_at:nowIso, updated_at:nowIso});

  /* Drafted, not announced. Writing a drop and advertising it are separate
     decisions, and the difference matters when the writing happens on the
     live site. */
  res.status(201).json({ok:true, drop_key:dropKey, published:false});
});

app.post("/api/admin/live-drops/:key/publish", admin, (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const published = req.body?.published === false ? 0 : 1;
  /* Pulling a drop that is already open would leave anybody on the page with a
     countdown to something that no longer exists. */
  if (!published && dropState(drop, Date.now()) === "live") {
    return res.status(409).json({error:"That drop is open. Let it close rather than pulling it from under whoever is watching."});
  }
  const nowIso = new Date().toISOString();
  db.prepare("UPDATE live_drops SET published=?, updated_at=? WHERE id=?")
    .run(published, nowIso, drop.id);
  /* Stamped once and never cleared. `published` says where the drop is now,
     which cannot answer whether it was ever public — and that is the question
     deletion turns on. */
  if (published && !drop.first_published_at) {
    db.prepare("UPDATE live_drops SET first_published_at=? WHERE id=?").run(nowIso, drop.id);
  }
  res.json({ok:true, published:Boolean(published)});
});

/*
 * Closing a drop that is already open.
 *
 * Neither of the routes around this one would do it: unpublishing refuses to
 * pull a drop from under whoever is watching, and deleting refuses anything
 * that ran, because what was offered is a record. Both are right, and between
 * them they left an open drop with no way to stop — which is fine until the
 * shop changes the price mid-event, the link breaks, or the deal was simply
 * wrong.
 *
 * Ending is not erasing. The window closes now, the drop keeps its history,
 * its funnel and its reminders, and anybody on the page sees it end the same
 * way they would have seen it end on time.
 */
app.post("/api/admin/live-drops/:key/end", admin, (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const nowIso = new Date().toISOString();
  if (Date.parse(drop.end_at) <= Date.now()) {
    return res.status(409).json({error:"That drop has already closed."});
  }
  /* Also brings the start back when it had not arrived yet, so a drop ended
     early cannot sit forever as "opening soon". */
  const startAt = Date.parse(drop.start_at) > Date.now() ? nowIso : drop.start_at;
  db.prepare("UPDATE live_drops SET start_at=?, end_at=?, updated_at=? WHERE id=?")
    .run(startAt, nowIso, nowIso, drop.id);
  res.json({ok:true, drop_key:drop.drop_key, ended_at:nowIso});
});

app.post("/api/admin/live-drops/:key/stock", admin, (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const remaining = Number(req.body?.quantity_remaining);
  if (!Number.isInteger(remaining) || remaining < 0 || remaining > drop.quantity_total) {
    return res.status(400).json({error:`Remaining stock must be a whole number between 0 and ${drop.quantity_total}.`});
  }
  /* The one thing that may change mid-drop: what the partner actually has left
     is the only honest source for it, and it moves. */
  db.prepare("UPDATE live_drops SET quantity_remaining=?, updated_at=? WHERE id=?")
    .run(remaining, new Date().toISOString(), drop.id);
  res.json({ok:true, quantity_remaining:remaining});
});

/*
 * Changing what a drop shows, after it has been created.
 *
 * There was no way to. A drop could be created, published, unpublished and
 * deleted, and nothing in between — so a published drop with the wrong
 * picture, or no video, was stuck with it: deleting is refused for anything
 * that was ever public, which is right, and recreating loses the reminders
 * people already left on it.
 *
 * Only the media. The price, the quantity and the hour are the offer itself,
 * and quietly editing those under people who were told about them is a
 * different act with different consequences.
 */
/* A drop photo or video, sent as the raw file body. Answers with the path to
   put in the drop's media field; see src/dropMedia.js. */
app.post("/api/admin/drop-media", admin, async (req, res) => {
  const kind = req.query.kind === "video" ? "video" : req.query.kind === "image" ? "image" : "";
  try {
    const saved = await saveUpload(req, { kind });
    return res.json({ ok:true, ...saved });
  } catch (error) {
    if (!error.status) console.error(`[drop-media] upload failed: ${error.message}`);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "The file could not be saved." });
  }
});

app.patch("/api/admin/live-drops/:key/media", admin, express.json({limit:"8kb"}), (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});

  /* Empty clears the slot, which is how a wrong video is removed rather than
     replaced. Anything else has to be a URL we would be willing to load. */
  const link = (value, current) => {
    if (value === undefined) return current;
    const text = String(value || "").trim();
    if (!text) return "";
    /* A site-relative path is how a file in public/ is referenced, and it is
       the safest form: it cannot point at another origin. */
    if (text.startsWith("/") && !text.startsWith("//")) return text.slice(0, 500);
    try {
      const url = new URL(text);
      if (!/^https:$/.test(url.protocol)) throw new Error("not https");
      return url.toString().slice(0, 500);
    } catch {
      return null;
    }
  };

  const fields = {
    image_url: link(req.body?.image_url, drop.image_url),
    secondary_image_url: link(req.body?.secondary_image_url, drop.secondary_image_url),
    video_url: link(req.body?.video_url, drop.video_url),
    stream_embed_url: link(req.body?.stream_embed_url, drop.stream_embed_url),
  };
  const bad = Object.entries(fields).filter(([, value]) => value === null).map(([name]) => name);
  if (bad.length) {
    return res.status(400).json({error:`Use an https link or a path starting with / — check: ${bad.join(", ")}.`});
  }

  db.prepare(
    "UPDATE live_drops SET image_url=?, secondary_image_url=?, video_url=?, stream_embed_url=?, updated_at=? WHERE id=?",
  ).run(
    fields.image_url, fields.secondary_image_url, fields.video_url, fields.stream_embed_url,
    new Date().toISOString(), drop.id,
  );
  publicHtmlCache.clear();
  return res.json({ok:true, ...fields});
});

/* The host console: what only the admin side may see and do. See src/liveHost.js. */
/**
 * What people looked for, and what they looked for and did not find.
 *
 * The second list is the useful one: every phrase that came back empty, most
 * asked first. It is a shopping list written by the people who wanted to buy
 * something here and left without it — worth more than any guess about what
 * to stock next, and until now it was thrown away the moment the page
 * rendered. See src/searchQueries.js.
 */
app.get("/api/admin/search-demand", admin, (req, res) => {
  const selectedMarket = normalizeMarket(req.query.market) || c.primaryMarket;
  const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
  /* Everything, down to a single search: a report is for reading, and the
     thresholds elsewhere exist to keep one person's typo out of the product,
     not out of your sight. */
  const popular = [...searchDemand(db, {market:selectedMarket, days, minCount:1}).entries()]
    .map(([query, searches]) => ({query, searches}))
    .sort((left, right) => right.searches - left.searches || (left.query < right.query ? -1 : 1))
    .slice(0, 25);
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.json({
    market:selectedMarket,
    days,
    popular,
    missing:missingQueries(db, {market:selectedMarket, days, limit:25, minCount:1})
  });
});

app.get("/api/admin/live-host/:key", admin, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const view = presentDrop(drop, Date.now());
  if (!chloeConfigured(drop.market)) {
    return res.status(503).json({error:"Chloe is not connected: TAVUS_API_KEY is not set, or this drop is not in the US market."});
  }
  let broadcast = null;
  try {
    broadcast = await openBroadcast(drop);
  } catch (error) {
    return res.status(503).json({error:`Tavus refused to start Chloe: ${error.message}`});
  }
  const queued = db.prepare("SELECT COUNT(*) AS n FROM live_chat_messages WHERE drop_id=? AND status='queued'").get(drop.id).n;
  res.json({
    state:view?.state || "ended",
    conversation_url:broadcast?.conversation_url || "",
    conversation_id:broadcast?.conversation_id || "",
    reveal_cue:broadcast && view?.state === "live" ? revealCue(broadcast.secret, hostRevealLine(view)) : "",
    idle_cue:broadcast ? idleCue(broadcast.secret) : "",
    /* The host's own words, read out by the console: the opening when she
       goes on air, and the reveal when the price opens. */
    intro_script:drop.host_script_intro || "",
    reveal_script:view?.state === "live" ? (drop.host_script_reveal || "") : "",
    queued,
    messages:chatMessages(db, drop.id, {limit:30}),
  });
});

/* Hands Chloe the next few questions, and says what to send her. */
app.post("/api/admin/live-host/:key/next", admin, (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const broadcast = db.prepare("SELECT * FROM live_host_broadcasts WHERE drop_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1").get(drop.id);
  if (!broadcast) return res.status(409).json({error:"Chloe is not on air for this drop."});
  const questions = takeNextQuestions(db, drop.id);
  res.json({cue:questions.length ? questionsCue(broadcast.secret, questions) : "", questions});
});

/* Chloe's script for a drop, editable at any time: it is what she will say,
   not something anybody has been told yet. */
app.patch("/api/admin/live-drops/:key/script", admin, express.json({limit:"16kb"}), (req, res) => {
  const drop = db.prepare("SELECT id FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const intro = String(req.body?.host_script_intro ?? "").trim().slice(0, 4000);
  const reveal = String(req.body?.host_script_reveal ?? "").trim().slice(0, 2000);
  db.prepare("UPDATE live_drops SET host_script_intro=?, host_script_reveal=?, updated_at=? WHERE id=?")
    .run(intro, reveal, new Date().toISOString(), drop.id);
  res.json({ok:true});
});

/* Your own instruction to Chloe, typed in the host console. Wrapped in the
   drop's marker here so the marker itself never reaches the browser. */
app.post("/api/admin/live-host/:key/instruction", admin, express.json({limit:"4kb"}), (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  const broadcast = db.prepare("SELECT * FROM live_host_broadcasts WHERE drop_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1").get(drop.id);
  if (!broadcast) return res.status(409).json({error:"Chloe is not on air for this drop."});
  const text = String(req.body?.text || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!text) return res.status(400).json({error:"Type something for Chloe first."});
  res.json({cue:hostInstructionCue(broadcast.secret, text)});
});

/* The console saying what Chloe is doing, for the chat to show viewers. */
app.post("/api/admin/live-host/:key/phase", admin, express.json({limit:"1kb"}), (req, res) => {
  const drop = db.prepare("SELECT id FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  if (!HOST_PHASES.includes(req.body?.phase)) return res.status(400).json({error:"Unknown phase."});
  res.json({ok:setBroadcastPhase(db, drop.id, req.body.phase)});
});

app.post("/api/admin/live-host/:key/hide/:id", admin, (req, res) => {
  db.prepare("UPDATE live_chat_messages SET status='hidden' WHERE id=? AND drop_id=(SELECT id FROM live_drops WHERE drop_key=?)")
    .run(Number(req.params.id) || 0, String(req.params.key || ""));
  res.json({ok:true});
});

app.delete("/api/admin/live-drops/:key", admin, (req, res) => {
  const drop = db.prepare("SELECT * FROM live_drops WHERE drop_key=?").get(String(req.params.key || ""));
  if (!drop) return res.status(404).json({error:"No such drop."});
  /*
   * Ever public is the line, not the clock and not published-right-now.
   *
   * This used to refuse anything whose start time had passed, which sounds
   * like "a drop that ran cannot be erased" but is not that statement: a draft
   * that was never published never ran — nobody was told, and no public page
   * ever existed for it, since /api/live/current only returns published drops.
   * Its scheduled hour arriving only meant it could never be deleted, so dead
   * test drafts had no way out and went on polluting the funnel counts.
   *
   * Loosening it to `published` alone went too far the other way, and a test
   * written for the original rule caught it: unpublish a drop that had already
   * run and the record of what was offered to real people could be erased.
   * first_published_at is set on the first publish and never cleared, so a
   * drop that was ever public stays.
   */
  if (drop.published) {
    return res.status(409).json({
      error: "This drop is published. Unpublish it first — deleting one out from under the people looking at it is a separate decision.",
    });
  }
  if (drop.first_published_at) {
    return res.status(409).json({
      error: "This drop was published once, so it is the record of what was offered. It can be unpublished, not deleted.",
    });
  }
  db.prepare("DELETE FROM live_drop_announcements WHERE drop_id=?").run(drop.id);
  db.prepare("DELETE FROM live_drop_presence WHERE drop_id=?").run(drop.id);
  db.prepare("DELETE FROM live_drop_reminders WHERE drop_id=?").run(drop.id);
  db.prepare("DELETE FROM live_drop_events WHERE drop_id=?").run(drop.id);
  db.prepare("DELETE FROM live_drops WHERE id=?").run(drop.id);
  res.json({ok:true});
});

/* The console is a Next page now (app/admin), so it wears the same design as
   the rest of the site instead of the old static template. Express only has
   to keep search engines off it: the page itself sets noindex, and this
   covers the response before Next ever renders. */
/*
 * Setting a shop icon by hand.
 *
 * Some shops refuse an automated request: Kroger and Costco never answer, B&H
 * answers 403. That is their call, and disguising the fetcher as a browser to
 * get past it is not something worth doing. Instead somebody can point us at
 * the image once, and a pinned icon is never replaced by a later fetch.
 *
 * The URL still goes through every guard: a person typing an address into an
 * admin form is not a reason to let the server reach one it would refuse.
 */
/*
 * Why no email is arriving, in the order the four things have to happen.
 *
 * The console said "not configured" and nothing else, which is true and
 * useless: the API key is the last of four steps, and setting it while the
 * three before it are undone produces mail SendGrid accepts and Gmail drops.
 * The DNS half is checked live, because a record somebody believes they added
 * and a record that resolves are different things.
 */
/*
 * What eBay says about one listing's stock, before a drop is built on it.
 *
 * Whether a Live Drop can show a real counter depends entirely on the seller:
 * some listings answer with an exact count, some only with "more than ten",
 * some with nothing at all. That is worth knowing while choosing the product,
 * not while two hundred people are watching.
 */
/*
 * Amazon picks: chosen by a person, linked by a person.
 *
 * Amazon's agreement allows their data to be shown only when it comes from
 * the Product Advertising API, and that opens after three qualifying sales.
 * So nothing here fetches anything from Amazon — not a price, not an image,
 * not a title. What is stored is what was typed, plus the SiteStripe link,
 * which is the one part that must survive untouched: it carries the tag,
 * and a link without it earns nothing while looking identical.
 */
const AMAZON_LINK = /^https:\/\/(?:amzn\.to\/[A-Za-z0-9]+|(?:www\.)?amazon\.[a-z.]{2,6}\/\S+)$/i;

app.get("/api/admin/amazon-picks", admin, (req, res) => {
  res.json({
    markets: c.markets,
    picks: db.prepare("SELECT * FROM amazon_picks ORDER BY market, position, id").all(),
  });
});

app.post("/api/admin/amazon-picks", admin, express.json({limit:"8kb"}), (req, res) => {
  const title = String(req.body?.title || "").trim().slice(0, 200);
  const url = String(req.body?.url || "").trim();
  const category = String(req.body?.category || "").trim().slice(0, 60);
  const marketCode = normalizeMarket(req.body?.market) || c.primaryMarket;
  const note = String(req.body?.note || "").trim().slice(0, 400);
  /*
   * A price is stored with the moment it was typed, and shown beside it.
   * Amazon's own prices move several times a day — which is why their
   * agreement has prices come from the API — so this is never presented as
   * the current one. Dated, it stays true however old it gets.
   */
  const price = Number(req.body?.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const currency = String(req.body?.currency || "USD").trim().toUpperCase().slice(0, 3);
  if (!title) return res.status(400).json({error:"Give it a name — nothing is fetched from Amazon, so this is the only title it will have."});
  if (!AMAZON_LINK.test(url)) return res.status(400).json({error:"That is not an Amazon link. Use the short link SiteStripe gives you."});
  /* Recorded so a link can be recognised again later, and so the API can fill
     in real data for the same product once it is available. */
  const asin = (url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/) || [])[1] || "";
  try {
    const nowIso = new Date().toISOString();
    const info = db.prepare(
      `INSERT INTO amazon_picks(market,title,category,url,asin,position,created_at,price,currency,price_checked_at,note)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      marketCode, title, category, url, asin, Number(req.body?.position) || 0, nowIso,
      hasPrice ? price : null, currency, hasPrice ? nowIso : null, note,
    );
    /* The homepage is cached; a pick nobody can see for ten minutes reads as
       a form that did not work. */
    publicHtmlCache.clear();
    return res.status(201).json({ok:true, id:info.lastInsertRowid, asin});
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({error:"That link is already on the site."});
    throw error;
  }
});

/*
 * Updating one, which for a price is the whole point: it goes stale by
 * definition, and the alternative to editing it is deleting the row and
 * retyping the name and the note.
 */
app.patch("/api/admin/amazon-picks/:id", admin, express.json({limit:"8kb"}), (req, res) => {
  const pick = db.prepare("SELECT * FROM amazon_picks WHERE id=?").get(Number(req.params.id) || 0);
  if (!pick) return res.sendStatus(404);
  const price = Number(req.body?.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const nowIso = new Date().toISOString();
  db.prepare(
    "UPDATE amazon_picks SET title=?, category=?, note=?, price=?, currency=?, price_checked_at=? WHERE id=?",
  ).run(
    String(req.body?.title ?? pick.title).trim().slice(0, 200) || pick.title,
    String(req.body?.category ?? pick.category).trim().slice(0, 60),
    String(req.body?.note ?? pick.note).trim().slice(0, 400),
    hasPrice ? price : null,
    String(req.body?.currency || pick.currency || "USD").trim().toUpperCase().slice(0, 3),
    /* Re-stamped only when a price is actually given, so an edit to the
       note does not make an old price look freshly checked. */
    hasPrice ? nowIso : null,
    pick.id,
  );
  publicHtmlCache.clear();
  return res.json({ok:true});
});

app.delete("/api/admin/amazon-picks/:id", admin, (req, res) => {
  const removed = db.prepare("DELETE FROM amazon_picks WHERE id=?").run(Number(req.params.id) || 0).changes;
  publicHtmlCache.clear();
  return res.status(removed ? 200 : 404).json({ok:Boolean(removed)});
});

/* Read by the Next pages. No price and no image, because there are none to
   give: that is the whole shape of this feature until the API opens. */
app.get("/api/amazon-picks", (req, res) => {
  const marketCode = normalizeMarket(req.query.market) || c.primaryMarket;
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  res.json(
    db.prepare(`
      SELECT id,title,category,note,price,currency,price_checked_at
      FROM amazon_picks
      /* A link the daily check found dead stops being offered. Marked, not
         deleted: the name and the note were written by hand and the product
         may come back. */
      WHERE market=? AND link_status<>'dead'
      ORDER BY position, id LIMIT 24
    `).all(marketCode),
  );
});

/*
 * Out to Amazon, through here so the click is counted.
 *
 * The visitor's session is stamped on by the browser exactly as it is for
 * every other outbound link, so these clicks are people rather than an
 * anonymous total — the thing that was wrong with all outbound clicks until
 * recently.
 */
/*
 * Out to Amazon's front door, counted like any other shop tile.
 *
 * Registered before /amazon/go/:id so the literal path wins over the
 * parameter. Recorded as shop_all because that is what it is: whatever the
 * visitor buys after arriving counts, not only a product we named.
 */
app.get("/amazon/go/store", (req, res) => {
  outboundHeaders(res);
  if (!c.amazonAssociateTag) return res.sendStatus(404);
  const marketCode = req.market || marketFromIp(req).code;
  const sessionId = analyticsToken(req.query.sid);
  db.prepare(
    "INSERT INTO clicks(session_id,product_id,market,retailer_name,source_page,placement,action_type,destination_type,clicked_at,referrer,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    sessionId, null, marketCode, "Amazon", "stores", "store_directory", "shop_all", "retailer",
    new Date().toISOString(), String(req.get("referer") || "").slice(0, 1000), String(req.get("user-agent") || "").slice(0, 500),
  );
  /* The documented associate link: the shop's own address with the tag on
     it, which is exactly what SiteStripe writes for a storefront. */
  return res.redirect(302, `https://www.amazon.com/?tag=${encodeURIComponent(c.amazonAssociateTag)}`);
});

app.get("/amazon/go/:id", (req, res) => {
  outboundHeaders(res);
  const pick = db.prepare("SELECT * FROM amazon_picks WHERE id=?").get(Number(req.params.id) || 0);
  if (!pick) return res.sendStatus(404);
  const sessionId = analyticsToken(req.query.sid);
  db.prepare(
    "INSERT INTO clicks(session_id,product_id,market,retailer_name,source_page,placement,action_type,destination_type,clicked_at,referrer,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    sessionId, null, pick.market, "Amazon", "amazon_picks", "amazon_picks", "view_deal", "retailer",
    new Date().toISOString(), String(req.get("referer") || "").slice(0, 1000), String(req.get("user-agent") || "").slice(0, 500),
  );
  /* The link is used exactly as SiteStripe made it. Adding parameters to an
     Amazon affiliate link is how the tag stops being honoured. */
  return res.redirect(302, pick.url);
});

/* On demand as well as daily, because after fixing a link the answer to
   "is it alive now" should not be a day away. */
app.post("/api/admin/amazon-picks/check", admin, async (req, res) => {
  try {
    const summary = await checkAmazonLinks({db});
    publicHtmlCache.clear();
    return res.json(summary);
  } catch (error) {
    return res.status(502).json({error:error.message});
  }
});

app.get("/api/admin/ebay-stock", admin, async (req, res) => {
  const raw = String(req.query.item || req.query.url || "").trim();
  const itemId = /^\d+$/.test(raw) ? raw : ebayItemIdFrom(raw);
  if (!itemId) return res.status(400).json({error:"Give an eBay item id, or the listing URL."});
  try {
    const marketCode = normalizeMarket(req.query.market) || c.primaryMarket;
    const stock = await readEbayStock(itemId, {market:market(marketCode)});
    return res.json({
      ...stock,
      /* Said in words, because `exact:false` is the whole answer to "can this
         product have a live counter" and it should not need decoding. */
      verdict: stock.exact
        ? "eBay gives an exact count — this listing can drive a real counter."
        : stock.threshold !== null
          ? `eBay only says "more than ${stock.threshold}" — no countdown is possible.`
          : "eBay gives no quantity for this listing — no countdown is possible.",
    });
  } catch (error) {
    return res.status(502).json({error:error.message});
  }
});
app.get("/api/admin/email-health", admin, async (req, res) => {
  try {
    res.json(await emailHealth());
  } catch (error) {
    res.status(502).json({error:error.message});
  }
});

/*
 * And whether it actually arrives, which no amount of checking proves.
 *
 * Sends one real message and hands back the provider's own words on failure.
 * "Sender identity not verified" and "domain authentication incomplete" are
 * different problems with different fixes, and a boolean tells them apart from
 * neither.
 */
app.post("/api/admin/email-test", admin, express.json({limit:"4kb"}), async (req, res) => {
  const to = String(req.body?.to || "").trim().slice(0, 160);
  if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(to)) return res.status(400).json({error:"Enter an address to send to."});
  try {
    await deliveryTestEmail({to});
    res.json({ok:true, to, message:`Sent to ${to}. If it does not arrive, look in spam before changing anything.`});
  } catch (error) {
    res.status(502).json({
      ok:false,
      error:error.message,
      /* Verbatim: the provider names the problem far better than any wrapper
         around it can. */
      provider:String(error.details || "").slice(0, 500),
    });
  }
});

app.get("/api/admin/retailer-icons", admin, (req, res) => {
  const rows = db.prepare(`SELECT host, content_type, pinned, checked_at,
      LENGTH(bytes) AS size FROM retailer_icons ORDER BY pinned DESC, host`).all();
  res.json({
    icons: rows.map((row) => ({
      host: row.host,
      content_type: row.content_type,
      /* A row with no bytes is a shop we asked about and got nothing from,
         which is the useful thing to see here: those are the candidates for
         being set by hand. */
      size: row.size || 0,
      pinned: Boolean(row.pinned),
      checked_at: row.checked_at,
    })),
  });
});

/* A larger body than the site allows elsewhere, because an uploaded icon
   arrives base64 encoded and that is a third bigger than the file. Only on
   this one route, and only behind the admin key. */
app.post("/api/admin/retailer-icons", admin, express.json({limit:"256kb"}), async (req, res) => {
  /* An uploaded file wins over a pasted link. Pasting a link turns out to be
     the hard way round: the addresses people have to hand are pages showing a
     logo rather than the logo, and several icon sites refuse to serve their
     images to anybody else at all. */
  const result = req.body?.icon_data
    ? storeUploadedIcon(db, req.body.host, Buffer.from(String(req.body.icon_data), "base64"))
    : await pinRetailerIcon(db, req.body?.host, req.body?.icon_url).catch((error) => ({
        error: error.message,
      }));
  if (result.error) return res.status(400).json({error:result.error});
  res.status(201).json({ok:true, ...result});
});

app.delete("/api/admin/retailer-icons/:host", admin, (req, res) => {
  const host = normalizeIconHost(req.params.host);
  if (!host) return res.status(400).json({error:"That is not a shop address."});
  /* Deleting rather than blanking, so the next shopper who sees that shop
     causes a fresh attempt instead of inheriting a remembered failure. */
  db.prepare("DELETE FROM retailer_icons WHERE host=?").run(host);
  res.json({ok:true});
});

app.get("/admin", (req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

/**
 * Anything not matched above falls through to the Next.js frontend — the
 * market homepage, category, search and deal pages all live there now (see
 * app/[market]/*). API paths and non-GET requests never reach Next; a
 * missing /api/ route is a genuine 404, and only GET/HEAD render a page.
 */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({error:"Not found"});
  if (req.method !== "GET" && req.method !== "HEAD") return sendNotFound(req, res);
  return handleNextRequest(req, res);
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
    () => refreshProducts(c, {market:marketCode}).then(() => publicHtmlCache.clear()).catch(error => console.error(error.message)),
    {timezone:selectedMarket.timezone}
  );
  if (c.offerCheckEnabled) {
    cron.schedule(
      /* The primary market sweeps four times a day; the others twice, because
         a hundred slow-moving listings do not need eight sweeps and the
         allowance those sweeps spent is what the primary market was short of.
         See searchBudgetFor in src/config.js. */
      marketCode === c.primaryMarket ? c.offerCheckCron : c.secondaryOfferCheckCron,
      () => refreshProducts(c, {market:marketCode,preserveDailySelection:true}).then(() => publicHtmlCache.clear()).catch(error => console.error(error.message)),
      {timezone:selectedMarket.timezone}
    );
  }
}

/* One link-health sweep a night, market-independent — it walks the whole
   published catalog by oldest-checked-first. The methodology page promises a
   working retailer link as a condition of publication; nothing re-checked that
   after the day a product was imported, so the promise quietly expired. */
if (c.liveRefreshEnabled) {
  cron.schedule(
    c.linkHealthCron,
    () => runLinkHealthCheck({limit: c.linkHealthBatch})
      .catch(error => console.error(`[link-health] ${error.message}`)),
    {timezone:"UTC"}
  );

  /*
   * What our own tracking says, written onto the products.
   *
   * A card cannot read a price history — there are twelve of them on a page
   * and the history is tens of thousands of rows — so the one number a card
   * needs is computed here once a night. See src/trackedPrice.js.
   */
  cron.schedule(
    c.trackedPriceCron,
    () => {
      try {
        const summary = updateTrackedPrices(db);
        console.log(
          `[tracked-price] ${summary.updated} products, ${summary.withDrop} below their tracked high`,
        );
        publicHtmlCache.clear();
      } catch (error) {
        console.error(`[tracked-price] ${error.message}`);
      }
    },
    {timezone:"UTC"},
  );
  /*
   * What the same product costs elsewhere, fetched rather than hoped for.
   *
   * No product in the catalogue appears in two of our shops, so a comparison
   * can never fall out of the data we already hold — it has to be asked for.
   * A few hundred barcode lookups a night covers the catalogue inside a week.
   */
  cron.schedule(
    c.comparablesCron,
    async () => {
      if (!c.comparablesBatch) return;
      try {
        const summary = await refreshComparables(db, {limit: c.comparablesBatch});
        if (summary.checked) {
          console.log(
            `[comparables] checked ${summary.checked}: ${summary.matched} matched, ${summary.failed} failed`,
          );
        }
        if (summary.stopped) console.warn(`[comparables] stopped early: ${summary.stopped}`);
      } catch (error) {
        console.error(`[comparables] ${error.message}`);
      }
    },
    {timezone:"UTC"},
  );
  /*
   * What the search box could not answer, once a night and in the log.
   *
   * The admin console shows the same thing on demand; this is so that a gap
   * opening up reaches somebody without anybody having to go and look.
   */
  cron.schedule(
    c.trackedPriceCron,
    () => {
      try {
        for (const marketCode of c.markets) {
          const missing = missingQueries(db, {market:marketCode, limit:5});
          if (missing.length) {
            console.log(
              `[search-demand] ${marketCode}: nothing found for ${missing.map(row => `"${row.query}" x${row.searches}`).join(", ")}`,
            );
          }
        }
        const pruned = pruneSearches(db);
        if (pruned) console.log(`[search-demand] forgot ${pruned} searches past the retention window`);
      } catch (error) {
        console.error(`[search-demand] ${error.message}`);
      }
    },
    {timezone:"UTC"},
  );

  /* The hand-added Amazon links, on the same daily pass as the catalogue's.
     They are the only thing on this site nothing else ever revisits. */
  cron.schedule(
    c.linkHealthCron,
    async () => {
      try {
        const summary = await checkAmazonLinks({db});
        if (summary.checked) {
          console.log(
            `[amazon-links] checked ${summary.checked}: ${summary.ok} ok, ${summary.dead} dead, ${summary.unknown} unknown`,
          );
        }
        if (summary.dead) {
          console.warn(`[amazon-links] no longer offered: ${summary.deadIds.join(", ")}`);
        }
      } catch (error) {
        console.error(`[amazon-links] ${error.message}`);
      }
    },
    {timezone:"Etc/UTC"},
  );
}

/*
 * Every minute. A drop is a ten minute event on a fixed clock, and a sweep on
 * the hour would miss most of them entirely.
 *
 * The guard is not belt and braces: a slow mailer can make one sweep outlast
 * the minute, and two overlapping sweeps would read the same unstamped rows
 * and email everybody twice.
 */
/*
 * Said once, at boot, where it cannot be missed.
 *
 * The reminder sweep runs every minute and fails silently by design: one bad
 * address must not stop the queue. With no mail delivery configured at all,
 * every address is a bad address, and the only trace was a log line a minute
 * that nobody reads. A drop was scheduled, somebody asked to be reminded, the
 * console said "reminders: 1", and the email was never going to arrive.
 */
if (!process.env.SENDGRID_API_KEY) {
  console.warn(
    "[mail] SENDGRID_API_KEY is not set: no reminder, subscription or password-reset email will be delivered.",
  );
}

/*
 * The remaining count, kept true by the shop rather than by hand.
 *
 * Every fifteen seconds while a drop is actually running, and not at all the
 * rest of the time: the check below is one indexed row read, so an idle site
 * pays nothing, and a ten minute drop costs forty eBay calls out of a daily
 * allowance of five thousand.
 *
 * Once a minute — the sweep below — was tempting and wrong: a minute of lag
 * on a ten minute event is a tenth of it, and the whole point is that the
 * page stops offering something that has gone.
 */
const LIVE_STOCK_POLL_MS = 15000;
let stockPollRunning = false;
const stockPoll = setInterval(async () => {
  if (stockPollRunning) return;
  stockPollRunning = true;
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    /*
     * Running drops, and the next one due, because the console has to be able
     * to say before the drop whether a live count is even possible.
     *
     * It only asked during the drop, so beforehand stock_verified_at was null
     * and the panel read that as "the shop gives no live count" — which is a
     * statement about eBay, not about us never having asked. The one moment
     * that answer is useful is while choosing and scheduling the product, and
     * that is exactly when it was wrong.
     *
     * A drop starting inside the next day is checked at the same fifteen
     * seconds, which is a rounding error against a five thousand call daily
     * allowance and buys an answer hours before it is needed.
     */
    const soonIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const live = db.prepare(`
      SELECT * FROM live_drops
      WHERE published=1 AND quantity_remaining>0 AND end_at>=?
        AND start_at<=?
    `).all(nowIso, soonIso);
    for (const drop of live) {
      const result = await refreshDropStock(drop, {db, market:market(drop.market)});
      if (result.changed) {
        console.log(`[live-drop] ${drop.drop_key}: ${result.remaining} left${result.soldOut ? " — sold out, drop closed" : ""}`);
      }
    }
  } catch (error) {
    console.error(`[live-drop] stock poll: ${error.message}`);
  } finally {
    stockPollRunning = false;
  }
}, LIVE_STOCK_POLL_MS);
stockPoll.unref?.();

/* The weekly snapshot. Hourly rather than at the exact minute the week
   closes: a restart or a sleeping instance at that minute would otherwise
   skip a week for good, and taking one is a no-op once it exists. */
cron.schedule("7 * * * *", () => {
  try {
    if (ensureWeeklySnapshot(db)) console.log("[weekly] snapshot taken");
  } catch (error) {
    console.error(`[weekly] snapshot failed: ${error.message}`);
  }
});

/* The shared Chloe stops being billed once her drop is over. */
cron.schedule("* * * * *", () => {
  if (!c.tavusApiKey) return;
  endFinishedBroadcasts(db, { apiKey: c.tavusApiKey })
    .then((ended) => ended.length && console.log(`[live-host] ended ${ended.length} broadcast(s)`))
    .catch((error) => console.error(`[live-host] could not end broadcasts: ${error.message}`));
});
let reminderSweepRunning = false;
cron.schedule(
  "* * * * *",
  async () => {
    if (reminderSweepRunning) return;
    reminderSweepRunning = true;
    try {
      const sent = await sendDueReminders({db, sendReminder: liveDropReminderEmail});
      if (sent) console.log(`[live-drop] sent ${sent} reminder${sent === 1 ? "" : "s"}`);

      /* The day before and the hour before, on the same sweep. A drop lasts
         ten minutes; a ten-minute warning only reaches whoever is already
         holding their phone. */
      const staged = await sendStagedReminders({
        db,
        sendSaveTheDate: liveDropSaveTheDateEmail,
        sendStartingSoon: liveDropStartingSoonEmail,
      });
      if (staged) console.log(`[live-drop] sent ${staged} early reminder${staged === 1 ? "" : "s"}`);

      /* And the subscriber list, which until now had no connection to a drop
         at all: somebody could subscribe on Monday and never learn a drop
         happened on Thursday. */
      const announced = await announceDropToSubscribers({
        db,
        sendAnnouncement: liveDropAnnouncementEmail,
        unsubscribeUrlFor: (subscriber) => (subscriber.unsubscribe_token
          ? `${SITE}/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribe_token)}`
          : ""),
      });
      if (announced) console.log(`[live-drop] announced to ${announced} subscriber${announced === 1 ? "" : "s"}`);

      /* The moment it opens: everyone who asked, and the subscriber list. */
      const liveNow = await sendLiveNowNotices({
        db,
        sendLiveNow: liveDropLiveNowEmail,
        unsubscribeUrlFor: (subscriber) => (subscriber?.unsubscribe_token
          ? `${SITE}/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribe_token)}`
          : ""),
      });
      if (liveNow) console.log(`[live-drop] told ${liveNow} people the drop is live`);

      /* Watched prices, on the same minute. The refresh has already written
         today's prices by the time this runs; nothing else reads them for
         this purpose. */
      const drops = await sendDuePriceDrops({
        db,
        sendPriceDrop: priceDropEmail,
        dealPathFor: (watch) => dealPath({
          id: watch.product_id,
          market: watch.market,
          title: watch.title,
        }),
      });
      if (drops) console.log(`[price-watch] told ${drops} shopper${drops === 1 ? "" : "s"} about a price drop`);
    } catch (error) {
      console.error(`[live-drop] ${error.message}`);
    } finally {
      reminderSweepRunning = false;
    }
  },
  {timezone:"UTC"}
);

/**
 * Last in the chain, so anything a route threw synchronously or handed to
 * next() ends up here instead of Express's default handler, which answers with
 * the raw stack trace. Registered after every route above, including the
 * Next.js catch-all.
 */
app.use((error, req, res, next) => {
  console.error(`[request-error] ${req.method} ${req.originalUrl}`, error?.stack || error);
  if (res.headersSent) return next(error);
  res.status(500).set("Cache-Control", "no-store");
  if (req.path.startsWith("/api/")) {
    return res.json({ error: "Something went wrong on our side. Please try again." });
  }
  return res
    .type("text/html")
    .send('<!doctype html><meta charset="utf-8"><title>Something went wrong | OneDailyDrop</title>' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;margin:15vh auto;max-width:32rem;padding:0 1.5rem;color:#1a1a1a}' +
      'a{color:inherit}</style>' +
      '<h1>Something went wrong on our side.</h1>' +
      '<p>This page could not be built just now. Nothing is wrong with your request, please try again in a moment.</p>' +
      `<p><a href="${marketPath(req.market || "us")}">Back to the deals</a></p>`);
});

(async () => {
  backfillBrands();
  await nextApp.prepare();
  await bootstrapPersonalPostgres(db);
  app.listen(c.port, () => {
    console.log(`http://localhost:${c.port}`);
    /*
     * Keep the entry pages rendered so a visitor does not have to be the
     * one who renders them. Only in production: locally the cost is a
     * background render nobody asked for, on a machine with no visitors.
     */
    if (c.isProduction) {
      startCacheWarmer({
        baseUrl: `http://127.0.0.1:${c.port}`,
        market: c.primaryMarket,
        paths: pathsFor(c.primaryMarket, process.env.WARM_PATHS),
      });
    }
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
