const db = require("./db");
const config = require("./config");
const { slugifyBrand } = require("./brandDetector");
const { reasonFor } = require("./demoEditorial");
const { localizeProduct } = require("./demoTranslations");
const {
  marketFromRequest,
  marketPath,
  alternateLinks,
  market,
} = require("./markets");
const { localDate } = require("./refresh");
const { t, marketName, languageTag } = require("./i18n");
const { presentProduct } = require("./productPresentation");
const { sourceSql } = require("./publicCatalog");
const { outboundPath } = require("./retailerLinks");
const { deduplicationKeys, selectUniqueProducts } = require("./ranker");
const renderHomepageTemplate = require("./homepageTemplate");

const SITE = "https://www.onedailydrop.com";
const DEFAULT_INTEREST_CATEGORIES = [
  "Electronics",
  "Home",
  "Kitchen",
  "Beauty",
  "Fashion",
  "Pets",
  "Sports & Outdoors",
  "Automotive",
  "Toys",
  "Smart Home",
];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const slug = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "deal";
const dealPath = (product) =>
  marketPath(
    product.market || "us",
    `/deal/${slug(product.canonical_title || product.title)}-${product.id}`,
  );
const categoryPath = (value, code = "us") =>
  marketPath(code, `/category/${slug(value)}`);
const brandPath = (value, code = "us") =>
  marketPath(code, `/brand/${slugifyBrand(value)}`);
const clean = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const fullTitle = (value) => clean(value);
const isDemo = (product) =>
  String(product?.source || "").toLowerCase() === "demo";
const hasCurrentOffer = (product) =>
  Number(product?.current_price) > 0 &&
  /^[A-Z]{3}$/.test(String(product?.currency || "").toUpperCase()) &&
  Boolean(clean(product?.checked_at));
const money = (value, currency = "USD") => {
  if (value == null || value === "") return "Check current price";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Check current price";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};
const storeName = (product) => {
  if (isDemo(product)) return "OneDailyDrop";
  if (clean(product.retailer_name)) return clean(product.retailer_name);
  const source = String(product.source || "").toLowerCase();
  if (source.includes("amazon") || source.includes("rainforest"))
    return "Amazon";
  if (source.includes("walmart") || source.includes("bluecart"))
    return "Walmart";
  return product.source || "Retailer";
};
const discount = (product) =>
  Number(product.original_price) > Number(product.current_price) &&
  Number(product.current_price) > 0
    ? Math.round(
        (1 - Number(product.current_price) / Number(product.original_price)) *
          100,
      )
    : 0;
const badge = (product) => {
  if (isDemo(product)) return "";
  return clean(product.display_badge) || "CHECKED OFFER";
};
const whyPicked = (product) => {
  if (isDemo(product)) return clean(product.description) || reasonFor(product);
  return (
    clean(product.display_selection_reason) ||
    "Offer details checked with the retailer."
  );
};
const statusText = (product) =>
  isDemo(product)
    ? "Retailer availability coming soon"
    : !hasCurrentOffer(product)
      ? "Confirm price and availability at the retailer"
      : clean(product.display_status) || "Price recently verified";
const priceLabel = (product) =>
  isDemo(product)
    ? "Retailer price"
    : !hasCurrentOffer(product)
      ? "Retailer price"
      : clean(product.display_price_label) || "Current price";
const trackingAttributes = (product, placement) =>
  `data-track-product="${Number(product.id)}" data-track-source="home" data-track-placement="${placement}" data-track-action="view_details"`;
const action = (product, className, placement) =>
  isDemo(product)
    ? `<a class="${className}" href="${dealPath(product)}">VIEW DETAILS</a>`
    : `<a class="${className}" href="${esc(outboundPath(product, { sourcePage: "home", placement }))}" target="_blank" rel="sponsored noopener noreferrer">${esc(product.display_action_label || `VIEW DEAL AT ${storeName(product)}`)}</a>`;
const priceHistoryAction = (product) =>
  isDemo(product) || !hasCurrentOffer(product)
    ? ""
    : `<a class="price-history-link" href="${dealPath(product)}#price-history">${esc(product.display_price_history_label || "PRICE HISTORY")}</a>`;
const askDeliaButton = (product, language = "en") =>
  `<button class="ask-delia-button" type="button" data-ask-delia data-product-id="${Number(product.id)}" data-product-title="${esc(fullTitle(product.title))}" data-product-score="${Number(product.display_score || product.score || 0)}" data-product-url="${esc(dealPath(product))}">✦ ${esc(t(language, "assistant.askProduct"))}</button>`;
const offerFacts = (product) => {
  if (isDemo(product)) return "";
  const seller = clean(product.seller_name) || storeName(product);
  const shipping =
    clean(product.display_shipping_summary) || "Confirm at retailer";
  const returns =
    clean(product.display_return_summary) || "See retailer policy";
  return `<dl class="offer-facts" aria-label="Offer details">
    <div><dt>Sold by</dt><dd>${esc(seller)}</dd></div>
    <div><dt>Delivery</dt><dd>${esc(shipping)}</dd></div>
    <div><dt>Returns</dt><dd>${esc(returns)}</dd></div>
  </dl>`;
};

const scoreMetrics = (product, language = "en", atSelection = false) => {
  const score =
    product.display_score == null ? NaN : Number(product.display_score);
  const hasScore = Number.isFinite(score) && score >= 60;
  const productRating = clean(product.display_product_rating);
  const sellerRating = clean(product.display_seller_rating);
  if (!hasScore && !productRating && !sellerRating) return "";
  const ratings = [
    productRating
      ? `<span class="deal-rating"><strong>★ ${esc(productRating)}</strong><small>${esc(product.display_product_rating_label || t(language, "product.productRating"))}</small></span>`
      : "",
    sellerRating
      ? `<span class="deal-rating"><strong>${esc(sellerRating)}</strong><small>${esc(product.display_seller_rating_label || t(language, "product.sellerRating"))}${product.display_seller_feedback ? ` · ${esc(product.display_seller_feedback)}` : ""}</small></span>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return `<div class="deal-metrics${atSelection ? " is-selection" : ""}">
    ${hasScore ? `<div class="deal-score"><strong>${score}/100</strong><span>${esc(atSelection ? product.display_score_at_selection_label : product.display_score_label)}<small>${esc(product.display_score_context)}</small></span></div>` : ""}
    ${ratings ? `<div class="deal-ratings">${ratings}</div>` : ""}
  </div>`;
};

const mainCard = (product, index, language = "en") => `
  <article class="card">
    <a class="image-wrap" href="${dealPath(product)}" ${trackingAttributes(product, "daily_card_media")}><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy" decoding="async"></a>
    <div class="card-content">
      <div class="card-top"><span class="rank">#${index + 1}</span>${badge(product) ? `<span class="badge">${esc(badge(product))}</span>` : ""}</div>
      <p class="cat"><a href="${categoryPath(product.category || "Deals", product.market)}">${esc(product.display_category || product.category || "Deals")}</a> · ${esc(storeName(product))}</p>
      <h3><a href="${dealPath(product)}" ${trackingAttributes(product, "daily_card_title")}>${esc(fullTitle(product.title))}</a></h3>
      <p class="description editorial-teaser"><strong>${esc(t(language, "product.why"))}</strong> ${esc(whyPicked(product))}</p>
      ${scoreMetrics(product, language)}
      <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${esc(product.display_current_price || money(product.current_price, product.currency))}</span>${product.original_price ? `<span class="old">${esc(product.display_original_price || money(product.original_price, product.currency))}</span>` : ""}${discount(product) ? `<span class="save-pill">${esc(product.display_save_label || `SAVE ${discount(product)}%`)}</span>` : ""}</div>
      <p class="verification">${esc(statusText(product))}</p>
      ${offerFacts(product)}
      <div class="card-actions">${action(product, "button", "daily_card_cta")}${priceHistoryAction(product)}${askDeliaButton(product, language)}</div>
    </div>
  </article>`;

const miniCard = (product, language = "en", atSelection = false) => `
  <article class="mini-card">
    <a href="${dealPath(product)}" ${trackingAttributes(product, "collection_media")}><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy" decoding="async"></a>
    <div class="mini-card-body">
      <p class="cat"><a href="${categoryPath(product.category || "Deals", product.market)}">${esc(product.display_category || product.category || "Deals")}</a> · ${esc(storeName(product))}</p>
      <h3><a href="${dealPath(product)}" ${trackingAttributes(product, "collection_title")}>${esc(fullTitle(product.title))}</a></h3>
      ${scoreMetrics(product, language, atSelection || (product.drop_score != null && Boolean(product.drop_date)))}
      <div class="mini-price-row"><span class="mini-price-label">${priceLabel(product)}</span><span class="mini-price">${esc(product.display_current_price || money(product.current_price, product.currency))}</span>${product.verified_previous_price ? `<span class="old">${esc(product.display_verified_previous_price || money(product.verified_previous_price, product.currency))}</span><span class="save-pill">${esc(t(language, "product.verifiedDrop", {percent:product.verified_drop_percent}))}</span>` : product.original_price ? `<span class="old">${esc(product.display_original_price || money(product.original_price, product.currency))}</span>` : ""}</div>
      <div class="card-actions"><a class="mini-action" href="${dealPath(product)}" ${trackingAttributes(product, "collection_details")}>VIEW DETAILS</a>${askDeliaButton(product, language)}</div>
    </div>
  </article>`;

module.exports = function homepage(req, res) {
  const selectedMarket = marketFromRequest(req);
  const language = req.language || "en";
  const locale = languageTag(selectedMarket.code, language);
  const localizedMarketName = marketName(selectedMarket.code, language);
  const sourceFilter = ` AND ${sourceSql()}`;
  const products = selectUniqueProducts(
    db
      .prepare(
        `SELECT * FROM products WHERE market=? AND status='published'${sourceFilter} ORDER BY COALESCE(ranking_score,score) DESC, score DESC, updated_at DESC`,
      )
      .all(selectedMarket.code),
  ).map((product) =>
    presentProduct(localizeProduct(product, language), language),
  );
  const today = localDate(selectedMarket.timezone);
  let dailyProducts = db
    .prepare(
      `
    SELECT p.*,d.rank,d.score AS drop_score,d.score_model AS drop_score_model,d.current_price AS drop_price,
      d.original_price AS drop_original_price,
      d.selection_reason AS daily_selection_reason,d.drop_date
    FROM daily_drops d
    JOIN products p ON p.id=d.product_id
    WHERE d.market=? AND ${sourceSql("p")} AND d.drop_date=(
      SELECT MAX(drop_date) FROM daily_drops WHERE market=? AND drop_date<=?
    )
    ORDER BY d.rank
  `,
    )
    .all(selectedMarket.code, selectedMarket.code, today)
    .map((product) =>
      presentProduct(
        localizeProduct(
          {
            ...product,
            selection_reason:
              product.daily_selection_reason || product.selection_reason,
          },
          language,
        ),
        language,
      ),
    )
    .filter((product) => product.display_score != null);
  dailyProducts = selectUniqueProducts(dailyProducts).sort(
    (left, right) =>
      Number(right.display_score || 0) - Number(left.display_score || 0),
  );
  // A partial daily snapshot must not collapse the homepage to one card.
  // Preserve its selected order, then fill the remaining positions from the
  // current verified catalog without introducing duplicate products.
  dailyProducts = selectUniqueProducts([
    ...dailyProducts,
    ...products.filter((product) => product.display_score != null),
  ]).slice(0, 10);
  const featured = dailyProducts[0] || null;
  const moreWorthSeeing = dailyProducts.slice(1, 10);
  const demoMode = Boolean(featured && isDemo(featured));
  const used = new Set();
  const markUsed = (product) =>
    deduplicationKeys(product).forEach((key) => used.add(key));
  [featured, ...moreWorthSeeing].filter(Boolean).forEach(markUsed);
  const isUnused = (product) =>
    !deduplicationKeys(product).some((key) => used.has(key));
  const categories = [
    ...new Set(products.filter(product => product.display_score != null).map((product) => product.category).filter(Boolean)),
  ];
  const categoryChoices = (
    categories.length ? categories : DEFAULT_INTEREST_CATEGORIES
  ).slice(0, 10);
  const merchantCounts = new Map();
  products.forEach((product) => {
    const merchant = storeName(product);
    if (!merchant) return;
    merchantCounts.set(merchant, (merchantCounts.get(merchant) || 0) + 1);
  });
  const storeNavigation = [...merchantCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([merchant]) => merchant);
  const archiveCandidates = db
    .prepare(
      `
    SELECT p.*,d.drop_date,d.score AS drop_score,d.score_model AS drop_score_model,d.current_price AS drop_price,
      d.original_price AS drop_original_price,
      d.selection_reason AS daily_selection_reason
    FROM daily_drops d
    JOIN products p ON p.id=d.product_id
    WHERE d.market=? AND ${sourceSql("p")} AND d.rank=1 AND d.drop_date<?
    ORDER BY d.drop_date DESC
    LIMIT 40
  `,
    )
    .all(selectedMarket.code, today)
    .map((product) =>
      presentProduct(
        localizeProduct(
          {
            ...product,
            selection_reason:
              product.daily_selection_reason || product.selection_reason,
          },
          language,
        ),
        language,
      ),
    );
  const archive = [];
  for (const product of archiveCandidates) {
    if (product.display_score == null || !isUnused(product)) continue;
    archive.push(product);
    markUsed(product);
    if (archive.length === 4) break;
  }
  const takeUnique = (rows) => {
    const selected = [];
    for (const product of rows) {
      if (!isUnused(product)) continue;
      selected.push(product);
      markUsed(product);
      if (selected.length === 4) break;
    }
    return selected;
  };
  const priorPrice = db.prepare(`
    SELECT price,observed_at
    FROM price_history
    WHERE product_id=? AND currency=? AND price>0 AND substr(observed_at,1,10)<substr(?,1,10)
    ORDER BY observed_at DESC
    LIMIT 1
  `);
  const verifiedDrop = product => {
    if (product.display_score == null || !product.checked_at) return null;
    const observation = priorPrice.get(product.id, product.currency, product.checked_at);
    const previous = Number(observation?.price);
    const current = Number(product.current_price);
    if (!(previous > current && current > 0)) return null;
    const percent = Math.round((1 - current / previous) * 100);
    if (percent < 15) return null;
    let displayPrevious = `${product.currency || ""} ${previous.toFixed(2)}`.trim();
    try {
      displayPrevious = new Intl.NumberFormat(locale, {style:"currency", currency:String(product.currency || selectedMarket.currency).toUpperCase()}).format(previous);
    } catch {}
    return {...product, verified_previous_price:previous, display_verified_previous_price:displayPrevious, verified_drop_percent:percent};
  };
  const priceDrops = takeUnique(
    products
      .map(verifiedDrop)
      .filter(Boolean)
      .sort((a, b) => b.verified_drop_percent - a.verified_drop_percent),
  );
  const title = t(language, "seo.homeTitle", { country: localizedMarketName });
  const description = t(language, "seo.homeDescription", {
    country: localizedMarketName,
  });
  const canonicalPath = marketPath(selectedMarket.code);
  const canonical = SITE + canonicalPath;
  const organizationNode = {
    "@type": "Organization",
    "@id": `${SITE}/#organization`,
    name: "OneDailyDrop",
    url: SITE,
    logo: { "@type": "ImageObject", url: `${SITE}/favicon.svg` },
  };
  const websiteNode = {
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    url: SITE,
    name: "OneDailyDrop",
    publisher: { "@id": `${SITE}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}${marketPath(selectedMarket.code, "/search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const webpageNode = {
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: locale,
    isPartOf: { "@id": `${SITE}/#website` },
    about: { "@id": `${SITE}/#organization` },
  };
  const schemaGraph = [organizationNode, websiteNode, webpageNode];
  if (!demoMode && dailyProducts.length) {
    schemaGraph.push({
      "@type": "ItemList",
      "@id": `${canonical}#daily-deals`,
      name: "Top 10 Daily Deals",
      numberOfItems: dailyProducts.length,
      itemListElement: dailyProducts.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: SITE + dealPath(product),
        name: fullTitle(product.title),
      })),
    });
  }
  const schema = { "@context": "https://schema.org", "@graph": schemaGraph };

  const featuredHtml = featured
    ? `
    <div class="featured-media">
      <a href="${dealPath(featured)}" ${trackingAttributes(featured, "featured_media")}><img src="${esc(featured.image_url)}" alt="${esc(fullTitle(featured.title))}" decoding="async" fetchpriority="high"></a>
      <span class="featured-ribbon">TODAY'S #1 PICK</span>${badge(featured) ? `<span class="featured-badge">${esc(badge(featured))}</span>` : ""}
    </div>
    <div class="featured-body">
      <p class="cat"><a href="${categoryPath(featured.category || "Deals", selectedMarket.code)}">${esc(featured.display_category || featured.category || "Deals")}</a> · ${esc(storeName(featured))}</p>
      <h2><a href="${dealPath(featured)}" ${trackingAttributes(featured, "featured_title")}>${esc(fullTitle(featured.title))}</a></h2>
      <p class="description editorial-teaser">${esc(whyPicked(featured))}</p>
      ${scoreMetrics(featured, language)}
      <div class="featured-price-row"><span class="price-label">${priceLabel(featured)}</span><span class="featured-price">${esc(featured.display_current_price || money(featured.current_price, featured.currency))}</span>${featured.original_price ? `<span class="old">${esc(featured.display_original_price || money(featured.original_price, featured.currency))}</span>` : ""}${discount(featured) ? `<span class="save-pill">${esc(featured.display_save_label || `SAVE ${discount(featured)}%`)}</span>` : ""}</div>
      <p class="verification">${esc(statusText(featured))}</p>
      ${offerFacts(featured)}
      <div class="card-actions">${action(featured, "featured-button", "featured_cta")}${priceHistoryAction(featured)}${askDeliaButton(featured, language)}</div>
    </div>`
    : `<div class="featured-body catalog-empty-featured">
      <p class="eyebrow">${esc(t(language, "home.catalogEyebrow"))}</p>
      <h2>${esc(t(language, "home.catalogTitle"))}</h2>
      <p class="description">${esc(t(language, "home.catalogText"))}</p>
      <div class="catalog-empty-checks" aria-label="${esc(t(language, "home.catalogStandards"))}">
        <span>✓ ${esc(t(language, "home.realProductsOnly"))}</span>
        <span>✓ ${esc(t(language, "home.verifiedRetailerLinks"))}</span>
        <span>✓ ${esc(t(language, "home.noInventedData"))}</span>
      </div>
      <button class="featured-button assistant-empty-cta" type="button" data-shopping-assistant-open>${esc(t(language, "assistant.ask"))}</button>
    </div>`;

  const collection = (
    items,
    emptyMessage = t(language, "home.catalogSectionEmpty"),
    atSelection = false,
  ) =>
    items.length
      ? items
          .map((product) => miniCard(product, language, atSelection))
          .join("")
      : `<div class="empty-state catalog-section-empty">${esc(emptyMessage)}</div>`;
  const robots =
    '<meta name="robots" content="index,follow,max-image-preview:large">';
  const demoBanner = "";

  const ogLocale = locale.replace("-", "_");
  const socialImage = featured?.image_url ? esc(featured.image_url) : "";
  return res.type("html").send(renderHomepageTemplate({
    selectedMarket,
    language,
    locale,
    localizedMarketName,
    title,
    description,
    canonical,
    schema,
    socialImage,
    featuredHtml,
    updatedText:featured ? statusText(featured) : t(language, "home.preparing"),
    categoryLinks:categories.map(category => `<a href="${categoryPath(category, selectedMarket.code)}">${esc(category)}</a>`).join(""),
    storeLinks:storeNavigation.map(merchant => `<a href="${marketPath(selectedMarket.code, "/search")}?q=${encodeURIComponent(merchant)}">${esc(merchant)}</a>`).join(""),
    categoryChoices:categoryChoices.map(category => `<label><input type="checkbox" name="categories" value="${esc(category)}"><span>${esc(category)}</span></label>`).join(""),
    moreWorthSeeingHtml:moreWorthSeeing.map((product, index) => mainCard(product, index + 1, language)).join(""),
    moreWorthSeeingCount:moreWorthSeeing.length,
    archiveHtml:collection(archive, t(language, "home.catalogArchiveEmpty"), true),
    priceDropsHtml:collection(priceDrops),
    priceDropsCount:priceDrops.length,
    alternateLinksHtml:alternateLinks("/")
  }));
  res
    .type("html")
    .send(
      `<!doctype html><html lang="${esc(selectedMarket.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#0a1020">${robots}<title>${esc(title)}</title><link rel="canonical" href="${canonical}"><link rel="icon" href="/favicon.svg" type="image/svg+xml">${alternateLinks("/")}<meta property="og:type" content="website"><meta property="og:site_name" content="OneDailyDrop"><meta property="og:locale" content="${esc(ogLocale)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">${socialImage ? `<meta property="og:image" content="${socialImage}"><meta property="og:image:alt" content="${esc(fullTitle(featured.title))}">` : ""}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${socialImage ? `<meta name="twitter:image" content="${socialImage}">` : ""}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script><script async src="https://www.googletagmanager.com/gtag/js?id=G-0V49XQ3WEG"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-0V49XQ3WEG');</script><link rel="stylesheet" href="/styles.css?v=20260724-search-scroll"><link rel="stylesheet" href="/brand-theme.css?v=20260724-subscribe-card"><link rel="stylesheet" href="/liquid-glass.css?v=20260724-subscribe-card"></head><body><header class="site-header"><div class="header-top"><a class="brand" href="/" aria-label="OneDailyDrop home"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>Check here before you buy.</small></span></a><form class="header-search" id="searchForm" action="/search"><span aria-hidden="true">⌕</span><input id="searchInput" name="q" type="search" placeholder="What are you thinking of buying?" autocomplete="off"><button id="searchClear" class="search-clear" type="button" aria-label="Clear search" hidden>×</button></form><a class="header-subscribe" href="#subscribe">Get the daily drop</a><button id="themeToggle" class="theme-button" type="button" aria-label="Switch to dark mode" title="Dark mode"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">Dark</span></button></div><nav class="main-nav" aria-label="Primary navigation"><a href="#today">Today's Drop</a><a href="#top">9 More Worth Seeing</a><div class="category-menu"><button id="categoryMenuButton" type="button" aria-expanded="false">Categories <span>⌄</span></button><div id="categoryMenu" class="mega-menu" hidden>${categories.map((category) => `<a href="${categoryPath(category)}">${esc(category)}</a>`).join("")}</div></div><a href="#archive">Past Drops</a><a href="/how-we-select-deals">How We Check</a><a href="/about">About</a></nav></header><main><section id="today" class="hero"><div class="hero-copy"><p class="eyebrow">ONE GENUINELY GOOD DEAL, CHECKED DAILY</p><h1>Check here<br><span>before you buy.</span></h1><p class="hero-intro">We compare the price, product quality and seller signals - so your first stop before buying is a smarter one.</p><div class="hero-actions"><a class="primary-cta" href="#featuredDeal">See today's drop</a><a class="secondary-cta" href="#subscribe">Get tomorrow's drop</a></div><div class="trust-inline"><span>✓ Price signal</span><span>✓ Product quality</span><span>✓ Seller confidence</span></div><div class="hero-meta"><span id="updated">${featured ? esc(statusText(featured)) : "Today's selection is being prepared"}</span></div><div class="countdown-card"><span>Next drop</span><strong id="countdown">--h --m --s</strong></div></div><div id="featuredDeal" class="featured-deal" aria-live="polite">${featuredHtml}</div></section><section id="subscribe" class="habit-section"><div class="habit-copy"><p class="eyebrow">MAKE IT YOUR DAILY CHECK</p><h2>One useful drop. In the categories you care about.</h2><p>Choose your interests and get the best new pick without searching through endless sale pages.</p></div><form id="subscribeForm" class="subscribe-card" novalidate><fieldset id="interestFieldset" aria-describedby="categoryError"><legend>What do you shop for?</legend><div class="interest-chips">${categoryChoices.map((category) => `<label><input type="checkbox" name="categories" value="${esc(category)}"><span>${esc(category)}</span></label>`).join("")}</div><p id="categoryError" class="category-error" role="alert" hidden>Please choose at least one category.</p></fieldset><label class="email-field"><span>Email address</span><input id="subscribeEmail" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="subscribe-button" type="submit">Get my Daily Drop</button><p id="subscribeStatus" class="form-status" aria-live="polite">No spam. Unsubscribe anytime.</p></form></section><section class="confidence-section"><div><p class="eyebrow">WHY TRUST THE DROP?</p><h2>We show the reasons, not just a discount badge.</h2></div><div class="confidence-grid"><article><strong>Price</strong><p>Current price, reference price and savings are evaluated together.</p></article><article><strong>Product</strong><p>Ratings, review volume and real usefulness shape the pick.</p></article><article><strong>Seller</strong><p>Retailer, availability, delivery and returns are part of the decision.</p></article><article><strong>Independence</strong><p>Commission never determines which product becomes the Daily Drop.</p></article></div></section><section id="top" class="deals-section"><div class="section-heading"><div><p class="eyebrow">MORE SMART PICKS</p><h2 id="dealsTitle">9 More Worth Seeing</h2></div><div id="resultCount" class="result-count">${moreWorthSeeing.length} additional products</div></div><div id="products" class="grid" aria-live="polite">${moreWorthSeeing.map((product, index) => mainCard(product, index + 1)).join("")}</div><div id="emptyState" class="empty-state" hidden>No products match that search.</div></section><section id="score" class="score-method"><div><p class="eyebrow">THE ONEDAILYDROP SCORE</p><h2>A simple score with visible logic.</h2><p>Every pick is judged using the same six-part framework.</p><a href="/how-we-select-deals">Read our full methodology →</a></div><div class="score-breakdown"><span style="--weight:30%"><b>30%</b> Price quality</span><span style="--weight:25%"><b>25%</b> Product quality</span><span style="--weight:15%"><b>15%</b> Customer feedback</span><span style="--weight:15%"><b>15%</b> Seller reliability</span><span style="--weight:10%"><b>10%</b> Shipping & returns</span><span style="--weight:5%"><b>5%</b> Freshness</span></div></section><section id="archive" class="collection-section"><div class="section-heading"><div><p class="eyebrow">PAST DAILY PICKS</p><h2>Yesterday's Drops</h2></div><span class="result-count">A habit needs a history</span></div><div class="mini-grid">${collection(archive)}</div></section><section id="trending" class="collection-section"><div class="section-heading"><div><p class="eyebrow">POPULAR RIGHT NOW</p><h2>Trending Drops</h2></div></div><div id="trendingProducts" class="mini-grid">${collection(trending)}</div></section><section id="price-drops" class="collection-section"><div class="section-heading"><div><p class="eyebrow">BIGGEST SAVINGS</p><h2>Price Drops</h2></div></div><div id="priceDropProducts" class="mini-grid">${collection(priceDrops)}</div></section><section id="new-drops" class="collection-section"><div class="section-heading"><div><p class="eyebrow">JUST ADDED</p><h2>New Drops</h2></div></div><div id="newProducts" class="mini-grid">${collection(newest)}</div></section><section id="about" class="how"><p class="eyebrow">THE ONEDAILYDROP PROMISE</p><h2>Less scrolling. Better buying decisions.</h2><div class="method-grid"><article><span>01</span><b>One clear winner</b><p>One Daily Drop stays at the center. Everything else is secondary.</p></article><article><span>02</span><b>Reasons you can inspect</b><p>We explain why the price, product and seller earned attention.</p></article><article><span>03</span><b>Transparent monetization</b><p>Affiliate commissions never change your price or decide our selection.</p></article></div></section></main><footer><div class="footer-brand"><b>OneDailyDrop</b><p>Check here before you buy.</p><div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate Disclosure</a><a href="/editorial-policy">Editorial Policy</a><a href="/how-we-select-deals">How We Select Deals</a><a href="/price-disclaimer">Price Disclaimer</a></div></div><p class="disclosure">We independently select featured products. OneDailyDrop may earn a commission when you purchase through our links, at no extra cost to you. Prices and availability may change.</p></footer><script src="/theme.js?v=20260724-search-scroll"></script><script src="/app.js?v=20260727-nine-more"></script></body></html>`,
    );
};
