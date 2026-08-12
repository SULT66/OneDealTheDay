const { marketPath } = require("./markets");
const { t } = require("./i18n");
const renderShoppingAssistantPanel = require("./shoppingAssistantPanel");

const SITE = "https://www.onedailydrop.com";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

module.exports = function homepageTemplate({
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
  updatedText,
  categoryLinks,
  categoryChoices,
  moreWorthSeeingHtml,
  moreWorthSeeingCount,
  archiveHtml,
  priceDropsHtml,
  priceDropsCount,
  alternateLinksHtml,
}) {
  const homePath = marketPath(selectedMarket.code);
  const archivePath = marketPath(selectedMarket.code, "/archive");
  const methodologyPath = marketPath(
    selectedMarket.code,
    "/how-we-select-deals",
  );
  const trustPath = (pathname) => marketPath(selectedMarket.code, pathname);
  const ogLocale = locale.replace("-", "_");
  const priceDropsSection = priceDropsCount
    ? `<section id="price-drops" class="collection-section">
    <div class="section-heading"><div><p class="eyebrow">${esc(t(language, "home.verifiedSavings"))}</p><h2>${esc(t(language, "home.realPriceDrops"))}</h2><p>${esc(t(language, "home.realPriceDropsText"))}</p></div></div>
    <div id="priceDropProducts" class="mini-grid">${priceDropsHtml}</div>
  </section>`
    : "";

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0a1020">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${alternateLinksHtml || ""}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OneDailyDrop">
  <meta property="og:locale" content="${esc(ogLocale)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${socialImage ? `<meta property="og:image" content="${esc(socialImage)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  ${socialImage ? `<meta name="twitter:image" content="${esc(socialImage)}">` : ""}
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-0V49XQ3WEG"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-0V49XQ3WEG');</script>
  <link rel="stylesheet" href="/styles.css?v=20260808-assistant">
  <link rel="stylesheet" href="/brand-theme.css?v=20260808-assistant">
  <link rel="stylesheet" href="/liquid-glass.css?v=20260808-assistant">
  <link rel="stylesheet" href="/i18n.css?v=20260808-assistant">
  <link rel="stylesheet" href="/shopping-assistant.css?v=20260812-context-photo-cards">
</head>
<body>
  <header class="site-header">
    <div class="header-top">
      <a class="brand" href="${homePath}" aria-label="OneDailyDrop home"><span class="brand-mark">D</span><span class="brand-copy"><strong>OneDailyDrop</strong><small>${esc(t(language, "brand.tagline"))}</small></span></a>
      <form class="header-search" id="searchForm" action="${marketPath(selectedMarket.code, "/search")}"><span aria-hidden="true">⌕</span><input id="searchInput" name="q" type="search" placeholder="${esc(t(language, "search.placeholder"))}" autocomplete="off"><button id="searchClear" class="search-clear" type="button" aria-label="${esc(t(language, "search.clear"))}" hidden>×</button></form>
      <button class="header-ai" type="button" data-shopping-assistant-open><span aria-hidden="true">✦</span><span>${esc(t(language, "assistant.short"))}</span></button>
      <a class="header-subscribe" href="#subscribe">${esc(t(language, "nav.subscribe"))}</a>
      <button id="themeToggle" class="theme-button" type="button" aria-label="${esc(t(language, "theme.toDark"))}" title="${esc(t(language, "theme.dark"))}"><span class="theme-button-icon" aria-hidden="true">☾</span><span class="theme-button-label">${esc(t(language, "theme.dark"))}</span></button>
    </div>
    <nav class="main-nav" aria-label="${esc(t(language, "nav.primary"))}">
      <a href="#today">${esc(t(language, "nav.today"))}</a>
      <a href="#top">${esc(t(language, "nav.more"))}</a>
      <div class="category-menu"><button id="categoryMenuButton" type="button" aria-expanded="false">${esc(t(language, "nav.categories"))} <span>⌄</span></button><div id="categoryMenu" class="mega-menu" hidden>${categoryLinks}</div></div>
      <a href="${archivePath}">${esc(t(language, "nav.archive"))}</a>
      <a href="${methodologyPath}">${esc(t(language, "nav.check"))}</a>
      <a href="${trustPath("/about")}">${esc(t(language, "nav.about"))}</a>
    </nav>
  </header>
  <main>
    <section id="today" class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${esc(t(language, "home.eyebrowMarket", { country: localizedMarketName.toUpperCase() }))}</p>
        <h1>${t(language, "home.title")}</h1>
        <p class="hero-intro">${esc(t(language, "home.introMarket", { country: localizedMarketName }))}</p>
        <p class="market-note">${esc(t(language, "home.marketNote", { country: localizedMarketName }))}</p>
        <div class="hero-actions"><a class="primary-cta" href="#featuredDeal">${esc(t(language, "home.seeToday"))}</a><button class="secondary-cta assistant-hero-cta" type="button" data-shopping-assistant-open>✦ ${esc(t(language, "assistant.ask"))}</button></div>
        <p class="shopping-model-note">${esc(t(language, "home.modelNote"))}</p>
        <div class="trust-inline"><span>✓ ${esc(t(language, "home.priceSignal"))}</span><span>✓ ${esc(t(language, "home.productQuality"))}</span><span>✓ ${esc(t(language, "home.sellerConfidence"))}</span></div>
        <div class="hero-meta"><span id="updated">${esc(updatedText)}</span></div>
        <div class="countdown-card"><span>${esc(t(language, "home.nextDrop"))}</span><strong id="countdown">--h --m --s</strong></div>
      </div>
      <div id="featuredDeal" class="featured-deal" aria-live="polite">${featuredHtml}</div>
    </section>
    <section id="subscribe" class="habit-section">
      <div class="habit-copy"><p class="eyebrow">${esc(t(language, "home.makeHabit"))}</p><h2>${esc(t(language, "home.oneUseful"))}</h2><p>${esc(t(language, "home.chooseInterests"))}</p></div>
      <form id="subscribeForm" class="subscribe-card" novalidate><fieldset id="interestFieldset" aria-describedby="categoryError"><legend>${esc(t(language, "home.shopFor"))}</legend><div class="interest-chips">${categoryChoices}</div><p id="categoryError" class="category-error" role="alert" hidden>${esc(t(language, "home.chooseCategory"))}</p></fieldset><label class="email-field"><span>${esc(t(language, "home.email"))}</span><input id="subscribeEmail" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="subscribe-button" type="submit">${esc(t(language, "home.subscribe"))}</button><p id="subscribeStatus" class="form-status" aria-live="polite">${esc(t(language, "home.noSpam"))}</p></form>
    </section>
    <section id="top" class="deals-section">
      <div class="section-heading"><div><p class="eyebrow">${esc(t(language, "home.moreEyebrow"))}</p><h2 id="dealsTitle">${esc(t(language, "home.moreTitle"))}</h2></div><div id="resultCount" class="result-count">${esc(t(language, "home.additional", { count: moreWorthSeeingCount }))}</div></div>
      <div id="products" class="grid" aria-live="polite">${moreWorthSeeingHtml}</div>
      <div id="emptyState" class="empty-state" ${moreWorthSeeingCount ? "hidden" : ""}>${esc(t(language, "home.noMatch"))} <button class="assistant-empty-cta" type="button" data-shopping-assistant-open>${esc(t(language, "assistant.askInstead"))}</button></div>
    </section>
    <section id="score" class="score-method">
      <div><p class="eyebrow">${esc(t(language, "home.scoreEyebrow"))}</p><h2>${esc(t(language, "home.scoreTitle"))}</h2><p>${esc(t(language, "home.scoreIntro"))}</p><a href="${methodologyPath}">${esc(t(language, "home.methodology"))}</a></div>
      <div class="score-breakdown"><span style="--weight:30%"><b>30%</b> ${esc(t(language, "home.priceQuality"))}</span><span style="--weight:20%"><b>20%</b> ${esc(t(language, "home.productQuality"))}</span><span style="--weight:15%"><b>15%</b> ${esc(t(language, "home.reviewConfidence"))}</span><span style="--weight:15%"><b>15%</b> ${esc(t(language, "home.sellerReliability"))}</span><span style="--weight:10%"><b>10%</b> ${esc(t(language, "home.demandUsefulness"))}</span><span style="--weight:10%"><b>10%</b> ${esc(t(language, "home.shippingReturns"))}</span></div>
    </section>
    <section id="archive" class="collection-section"><div class="section-heading"><div><p class="eyebrow">${esc(t(language, "home.pastEyebrow"))}</p><h2>${esc(t(language, "page.pastDrops"))}</h2></div><a class="result-count" href="${archivePath}">${esc(t(language, "page.viewAll"))} →</a></div><div class="mini-grid">${archiveHtml}</div></section>
    ${priceDropsSection}
    <section id="about" class="how"><p class="eyebrow">${esc(t(language, "home.promise"))}</p><h2>${esc(t(language, "home.lessScrolling"))}</h2><div class="method-grid"><article><span>01</span><b>${esc(t(language, "home.oneWinner"))}</b><p>${esc(t(language, "home.oneWinnerText"))}</p></article><article><span>02</span><b>${esc(t(language, "home.reasons"))}</b><p>${esc(t(language, "home.reasonsText"))}</p></article><article><span>03</span><b>${esc(t(language, "home.transparent"))}</b><p>${esc(t(language, "home.transparentText"))}</p></article></div></section>
  </main>
  <footer><div class="footer-brand"><b>OneDailyDrop</b><p>${esc(t(language, "brand.tagline"))}</p><div class="footer-links"><a href="${trustPath("/about")}">${esc(t(language, "footer.about"))}</a><a href="${trustPath("/contact")}">${esc(t(language, "footer.contact"))}</a><a href="${trustPath("/privacy")}">${esc(t(language, "footer.privacy"))}</a><a href="${trustPath("/terms")}">${esc(t(language, "footer.terms"))}</a><a href="${trustPath("/affiliate-disclosure")}">${esc(t(language, "footer.affiliate"))}</a><a href="${trustPath("/editorial-policy")}">${esc(t(language, "footer.editorial"))}</a><a href="${methodologyPath}">${esc(t(language, "footer.selection"))}</a><a href="${trustPath("/price-disclaimer")}">${esc(t(language, "footer.price"))}</a></div></div><p class="disclosure">${esc(t(language, "footer.disclosure"))}</p></footer>
  ${renderShoppingAssistantPanel(selectedMarket.code, language)}
  <script src="/theme.js?v=20260808-assistant"></script>
  <script src="/app.js?v=20260808-assistant"></script>
  <script src="/shopping-assistant.js?v=20260812-context-photo-cards"></script>
</body>
</html>`;
};
