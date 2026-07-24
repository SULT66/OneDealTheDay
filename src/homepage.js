const db = require("./db");
const config = require("./config");
const { slugifyBrand } = require("./brandDetector");

const SITE = "https://www.onedailydrop.com";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const slug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => `/deal/${slug(product.title)}-${product.id}`;
const categoryPath = value => `/category/${slug(value)}`;
const brandPath = value => `/brand/${slugifyBrand(value)}`;
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const fullTitle = value => clean(value);
const isDemo = product => String(product?.source || "").toLowerCase() === "demo";
const money = (value, currency = "USD") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Check latest price";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};
const storeName = product => {
  if (isDemo(product)) return "OneDailyDrop";
  const source = String(product.source || "").toLowerCase();
  if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
  if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
  return product.source || "Retailer";
};
const discount = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0
  ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100)
  : 0;
const badge = product => {
  if (isDemo(product)) return "DAILY PICK";
  if (discount(product) >= 25) return "VERIFIED DEAL";
  if (Number(product.score) >= 90) return "EDITOR'S PICK";
  if (Number(product.review_count) >= 5000) return "TRENDING";
  return "POPULAR PICK";
};
const whyPicked = product => {
  if (isDemo(product)) return "Selected for its practical value and relevance to everyday shoppers.";
  const reasons = [];
  if (Number(product.rating) >= 4.5) reasons.push(`${Number(product.rating).toFixed(1)}-star rating`);
  if (Number(product.review_count) >= 1000) reasons.push(`${Number(product.review_count).toLocaleString("en-US")} reviews`);
  if (Number(product.score) >= 80) reasons.push(`${Math.round(Number(product.score))}/100 OneDailyDrop score`);
  if (discount(product)) reasons.push(`${discount(product)}% verified savings`);
  return reasons.length
    ? `Picked for its ${reasons.join(", ")}.`
    : "Picked for its price, shopper feedback and overall value.";
};
const statusText = product => isDemo(product)
  ? "Retailer availability coming soon"
  : product.updated_at
    ? `Price verified ${new Date(product.updated_at).toLocaleString("en-US")}`
    : "Price recently verified";
const priceLabel = product => isDemo(product) ? "Retailer price" : "Current price";
const action = (product, className) => isDemo(product)
  ? `<a class="${className}" href="${dealPath(product)}">VIEW DETAILS</a>`
  : `<a class="${className}" href="/go/${product.id}" rel="nofollow sponsored">SEE DEAL ON ${esc(storeName(product))}</a>`;

const mainCard = (product, index) => `
  <article class="card">
    <a class="image-wrap" href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
    <div class="card-content">
      <div class="card-top"><span class="rank">#${index}</span><span class="badge">${esc(badge(product))}</span></div>
      <p class="cat"><a href="${categoryPath(product.category || "Deals")}">${esc(product.category || "Deals")}</a> | ${esc(storeName(product))}</p>
      <h3><a href="${dealPath(product)}">${esc(fullTitle(product.title))}</a></h3>
      <p class="description"><strong>Why it made the list:</strong> ${esc(whyPicked(product))}</p>
      <p class="stats">★ ${esc(product.rating || "-")} | ${Number(product.review_count || 0).toLocaleString("en-US")} reviews | Score ${Math.round(Number(product.score) || 0)}/100</p>
      <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${discount(product) ? `<span class="save-pill">SAVE ${discount(product)}%</span>` : ""}</div>
      <p class="verification">${esc(statusText(product))}</p>
      <div class="card-actions">${action(product, "button")}</div>
    </div>
  </article>`;

const miniCard = product => `
  <article class="mini-card">
    <a href="${dealPath(product)}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
    <div class="mini-card-body">
      <p class="cat"><a href="${categoryPath(product.category || "Deals")}">${esc(product.category || "Deals")}</a> | ${esc(storeName(product))}</p>
      <h3><a href="${dealPath(product)}">${esc(fullTitle(product.title))}</a></h3>
      <p class="mini-meta">★ ${esc(product.rating || "-")} | Score ${Math.round(Number(product.score) || 0)}/100${discount(product) ? ` | ${discount(product)}% off` : ""}</p>
      <div class="mini-price-row"><span class="mini-price-label">${priceLabel(product)}</span><span class="mini-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}</div>
      <a class="mini-action" href="${dealPath(product)}">VIEW DETAILS</a>
    </div>
  </article>`;

module.exports = function homepage(req, res) {
  const sourceFilter = config.demoMode ? " AND LOWER(COALESCE(source,''))='demo'" : "";
  const products = db.prepare(`SELECT * FROM products WHERE status='published'${sourceFilter} ORDER BY score DESC, updated_at DESC`).all();
  const top = products.slice(0, 10);
  const featured = top[0] || null;
  const demoMode = Boolean(featured && isDemo(featured));
  const used = new Set(top.map(product => product.id));
  const take = rows => rows.filter(product => !used.has(product.id)).slice(0, 4).map(product => {
    used.add(product.id);
    return product;
  });
  const trending = take([...products].sort((a, b) => Number(b.review_count || 0) - Number(a.review_count || 0)));
  const priceDrops = take(products.filter(product => discount(product) > 0).sort((a, b) => discount(b) - discount(a)));
  const newest = take([...products].sort((a, b) => Number(b.id) - Number(a.id)));
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))];
  const categoryChoices = categories.slice(0, 10);
  const archive = products.slice(1, 5);
  const title = "OneDailyDrop | A Deal Worth Checking Every Day";
  const description = "OneDailyDrop finds useful products and the best available deals from leading retailers.";
  const schema = demoMode
    ? { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": `${SITE}/#organization`, name: "OneDailyDrop", url: SITE }, { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "OneDailyDrop", publisher: { "@id": `${SITE}/#organization` } }] }
    : { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": `${SITE}/#organization`, name: "OneDailyDrop", url: SITE }, { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "OneDailyDrop", publisher: { "@id": `${SITE}/#organization` } }, { "@type": "ItemList", name: "Top 10 Drops Today", itemListElement: top.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: SITE + dealPath(product), name: fullTitle(product.title) })) }] };

  const featuredHtml = featured ? `
    <div class="featured-media">
      <a href="${dealPath(featured)}"><img src="${esc(featured.image_url)}" alt="${esc(fullTitle(featured.title))}"></a>
      <span class="featured-ribbon">TODAY'S DROP</span><span class="featured-badge">${esc(badge(featured))}</span>
    </div>
    <div class="featured-body">
      <p class="cat"><a href="${categoryPath(featured.category || "Deals")}">${esc(featured.category || "Deals")}</a> | ${esc(storeName(featured))}</p>
      <h2><a href="${dealPath(featured)}">${esc(fullTitle(featured.title))}</a></h2>
      <p class="description">${esc(whyPicked(featured))}</p>
      <p class="stats">★ ${esc(featured.rating || "-")} | ${Number(featured.review_count || 0).toLocaleString("en-US")} reviews</p>
      <div class="score-strip"><strong>${Math.round(Number(featured.score) || 0)}/100</strong><span>OneDailyDrop Score</span></div>
      <div class="featured-price-row"><span class="price-label">${priceLabel(featured)}</span><span class="featured-price">${money(featured.current_price, featured.currency)}</span>${featured.original_price ? `<span class="old">${money(featured.original_price, featured.currency)}</span>` : ""}${discount(featured) ? `<span class="save-pill">SAVE ${discount(featured)}%</span>` : ""}</div>
      <p class="verification">${esc(statusText(featured))}</p>
      <div class="card-actions">${action(featured, "featured-button")}</div>
    </div>` : `<div class="featured-body"><h2>No featured drop is available yet.</h2></div>`;

  const collection = items => items.map(miniCard).join("");
  const robots = demoMode ? '<meta name="robots" content="noindex,follow">' : "";
  const demoBanner = "";

  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#0a1020">${robots}<title>${esc(title)}</title><link rel="canonical" href="${SITE}/"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE}/">${featured?.image_url ? `<meta property="og:image" content="${esc(featured.image_url)}">` : ""}<meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script><script async src="https://www.googletagmanager.com/gtag/js?id=G-0V49XQ3WEG"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-0V49XQ3WEG');</script><link rel="stylesheet" href="/styles.css?v=20260724-search-scroll"><link rel="stylesheet" href="/brand-theme.css?v=20260724-subscribe-card"><link rel="stylesheet" href="/liquid-glass.css?v=20260724-subscribe-card"></head><body><header class="site-header"><div class="header-top"><a class="brand" href="/" aria-label="OneDailyDrop home"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>A better place to start before you buy.</small></span></a><form class="header-search" id="searchForm" action="/search"><span aria-hidden="true">⌕</span><input id="searchInput" name="q" type="search" placeholder="What are you thinking of buying?" autocomplete="off"><button id="searchClear" class="search-clear" type="button" aria-label="Clear search" hidden>×</button></form><a class="header-subscribe" href="#subscribe">Get the daily drop</a><button id="themeToggle" class="theme-button" type="button" aria-label="Switch to dark mode" title="Dark mode"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">Dark</span></button></div><nav class="main-nav" aria-label="Primary navigation"><a href="#today">Today's Drop</a><a href="#top">More Worth Seeing</a><div class="category-menu"><button id="categoryMenuButton" type="button" aria-expanded="false">Categories <span>⌄</span></button><div id="categoryMenu" class="mega-menu" hidden>${categories.map(category => `<a href="${categoryPath(category)}">${esc(category)}</a>`).join("")}</div></div><a href="#archive">Past Drops</a><a href="/how-we-select-deals">How We Check</a><a href="/about">About</a></nav></header><main><section id="today" class="hero"><div class="hero-copy"><p class="eyebrow">ONE DEAL WE THINK IS WORTH YOUR TIME</p><h1>Before you buy,<br><span>take a look here.</span></h1><p class="hero-intro">We check the price, the product and the seller, then explain what we found.</p><div class="hero-actions"><a class="primary-cta" href="#featuredDeal">See today's drop</a><a class="secondary-cta" href="#subscribe">Get tomorrow's drop</a></div><div class="trust-inline"><span>✓ Price checked</span><span>✓ Product quality</span><span>✓ Seller checked</span></div><div class="hero-meta"><span id="updated">${featured ? esc(statusText(featured)) : "Today's selection is being prepared"}</span></div><div class="countdown-card"><span>Next drop</span><strong id="countdown">--h --m --s</strong></div></div><div id="featuredDeal" class="featured-deal" aria-live="polite">${featuredHtml}</div></section><section id="subscribe" class="habit-section"><div class="habit-copy"><p class="eyebrow">GET THE DEALS YOU ACTUALLY WANT</p><h2>Choose what you care about. We will send deals that match.</h2><p>Pick your categories and we will email you when we find something worth seeing.</p></div><form id="subscribeForm" class="subscribe-card" novalidate><fieldset id="interestFieldset" aria-describedby="categoryError"><legend>What do you shop for?</legend><div class="interest-chips">${categoryChoices.map(category => `<label><input type="checkbox" name="categories" value="${esc(category)}"><span>${esc(category)}</span></label>`).join("")}</div><p id="categoryError" class="category-error" role="alert" hidden>Please choose at least one category.</p></fieldset><label class="email-field"><span>Email address</span><input id="subscribeEmail" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="subscribe-button" type="submit">Send me Daily Drops</button><p id="subscribeStatus" class="form-status" aria-live="polite">No spam. Unsubscribe anytime.</p></form></section><section class="confidence-section"><div><p class="eyebrow">WHAT WE CHECK</p><h2>A discount is not enough. Here is what we look at.</h2></div><div class="confidence-grid"><article><strong>Price</strong><p>We compare the current price with the usual price and any real savings.</p></article><article><strong>Product</strong><p>We look at ratings, the number of reviews and whether the product is genuinely useful.</p></article><article><strong>Seller</strong><p>We check who sells it, whether it is in stock, and what delivery and returns look like.</p></article><article><strong>Independence</strong><p>We may earn a commission, but it does not decide what we feature.</p></article></div></section><section id="top" class="deals-section"><div class="section-heading"><div><p class="eyebrow">MORE DEALS WORTH A LOOK</p><h2 id="dealsTitle">More deals we checked today</h2></div><div id="resultCount" class="result-count">Showing ${top.length} of ${products.length} products</div></div><div id="products" class="grid" aria-live="polite">${top.map((product, index) => mainCard(product, index + 1)).join("")}</div><div id="emptyState" class="empty-state" hidden>We could not find anything for that search.</div></section><section id="score" class="score-method"><div><p class="eyebrow">HOW THE SCORE WORKS</p><h2>A simple score, based on six checks.</h2><p>We use the same six checks for every deal.</p><a href="/how-we-select-deals">See how we choose deals</a></div><div class="score-breakdown"><span style="--weight:30%"><b>30%</b> Price quality</span><span style="--weight:25%"><b>25%</b> Product quality</span><span style="--weight:15%"><b>15%</b> Customer feedback</span><span style="--weight:15%"><b>15%</b> Seller reliability</span><span style="--weight:10%"><b>10%</b> Shipping & returns</span><span style="--weight:5%"><b>5%</b> Freshness</span></div></section><section id="archive" class="collection-section"><div class="section-heading"><div><p class="eyebrow">PAST DAILY PICKS</p><h2>Yesterday's Drops</h2></div><span class="result-count">See what you missed</span></div><div class="mini-grid">${collection(archive)}</div></section><section id="trending" class="collection-section"><div class="section-heading"><div><p class="eyebrow">WHAT PEOPLE ARE CHECKING</p><h2>Trending Drops</h2></div></div><div id="trendingProducts" class="mini-grid">${collection(trending)}</div></section><section id="price-drops" class="collection-section"><div class="section-heading"><div><p class="eyebrow">THE LARGEST PRICE CUTS</p><h2>Price Drops</h2></div></div><div id="priceDropProducts" class="mini-grid">${collection(priceDrops)}</div></section><section id="new-drops" class="collection-section"><div class="section-heading"><div><p class="eyebrow">JUST ADDED</p><h2>New Drops</h2></div></div><div id="newProducts" class="mini-grid">${collection(newest)}</div></section><section id="about" class="how"><p class="eyebrow">WHAT YOU CAN EXPECT</p><h2>Less searching. More useful answers.</h2><div class="method-grid"><article><span>01</span><b>One main pick</b><p>We lead with one deal, then show a few more that are worth a look.</p></article><article><span>02</span><b>A clear reason for every pick</b><p>We tell you what we checked and why the deal made the list.</p></article><article><span>03</span><b>Clear affiliate disclosure</b><p>Affiliate links do not change your price or decide what we feature.</p></article></div></section></main><footer><div class="footer-brand"><b>OneDailyDrop</b><p>A better place to start before you buy.</p><div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate Disclosure</a><a href="/editorial-policy">Editorial Policy</a><a href="/how-we-select-deals">How We Select Deals</a><a href="/price-disclaimer">Price Disclaimer</a></div></div><p class="disclosure">We choose products independently. If you buy through one of our links, we may earn a commission at no extra cost to you. Prices and availability can change.</p></footer><script src="/theme.js?v=20260724-search-scroll"></script><script src="/app.js?v=20260724-search-scroll"></script></body></html>`);
};
