const renderHomepage = require("./homepage");
const { marketFromRequest, marketPath, alternateLinks } = require("./markets");
const {
  resolveLanguage,
  languageTag,
  defaultLanguages,
  marketName,
  t,
  clientCopy,
  localizeHtml,
  languageSwitcher
} = require("./i18n");

const SITE = "https://www.onedailydrop.com";
const anchorOffsetStyle = `<style id="homepage-anchor-offset">
html{scroll-padding-top:var(--odd-header-offset,132px)}
#shopping-search,#top-picks,#featuredDeal,#subscribe,#top,#score,#archive,#price-drops,#about{scroll-margin-top:var(--odd-header-offset,132px)}
</style>`;
const legacyAnalytics = /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script><script>[\s\S]*?gtag\('config','[^']+'\);<\/script>/;
const consentStyles = '<link rel="stylesheet" href="/cookie-consent.css?v=20260730">';
const consentScript = '<script src="/cookie-consent.js?v=20260730"></script>';
const imageConnectionHints = image => {
  try {
    const origin = new URL(String(image || "")).origin;
    return origin.startsWith("https://")
      ? `<link rel="preconnect" href="${origin}"><link rel="dns-prefetch" href="${origin}">`
      : "";
  } catch {
    return "";
  }
};

module.exports = function homepageSeo(req, res) {
  const originalSend = res.send.bind(res);
  const selectedMarket = marketFromRequest(req);
  req.market = selectedMarket.code;
  const language = resolveLanguage(req, res, selectedMarket.code);
  const locale = languageTag(selectedMarket.code, language);
  const localizedMarketName = marketName(selectedMarket.code, language);

  res.send = body => {
    if (typeof body !== "string" || !body.includes("application/ld+json")) return originalSend(body);

    const homePath = marketPath(selectedMarket.code);
    const canonical = SITE + homePath;
    const defaultLanguage = defaultLanguages[selectedMarket.code];
    const appScript = `<script>window.__ODD_MARKET__=${JSON.stringify(selectedMarket.code)};window.__ODD_MARKET_TIMEZONE__=${JSON.stringify(selectedMarket.timezone)};window.__ODD_LANGUAGE__=${JSON.stringify(language)};window.__ODD_LOCALE__=${JSON.stringify(locale)};window.__ODD_TEXT__=${JSON.stringify(clientCopy(language)).replace(/</g, "\\u003c")};</script><script>(function(){const q=new URLSearchParams(location.search).get("q");if(!q)return;const input=document.getElementById("searchInput");if(input)input.value=q;})();</script><script src="/click-tracking.js?v=20260814-day5"></script><script src="/app.js?v=20260814-day5"></script>`;
    const day9AppScript = appScript.replace("/app.js?v=20260814-day5", "/app.js?v=20260814-day9-search-first");
    let enhanced = body
      .replace(legacyAnalytics, "")
      .replace(
        '<link rel="canonical" href="https://www.onedailydrop.com/">',
        `<link rel="canonical" href="${canonical}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:site_name" content="OneDailyDrop">${alternateLinks("/")}`
      )
      .replace(`<meta property="og:url" content="${SITE}/">`, `<meta property="og:url" content="${canonical}">`)
      .replace('href="/" aria-label="OneDailyDrop home"', `href="${homePath}" aria-label="OneDailyDrop home"`)
      .replace('action="/search"', `action="${marketPath(selectedMarket.code, "/search")}"`)
      .replace(
        /<\/button>\s*<\/div>\s*<nav class="main-nav" aria-label="[^"]+">/,
        `</button>${languageSwitcher(req, selectedMarket.code, language)}<button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mainNavigation" aria-label="${t(language, "menu.open")}"><span></span><span></span><span></span></button></div><nav id="mainNavigation" class="main-nav" aria-label="${t(language, "nav.primary")}">`
      )
      .replace(/\/styles\.css\?v=[^"]+/, "/styles.css?v=20260814-day9-search-first")
      .replace(/href="\/us\/category\//g, `href="/${selectedMarket.code}/category/`)
      .replace('<a href="#archive">Past Drops</a>', `<a href="${marketPath(selectedMarket.code, "/archive")}">Past Drops</a>`)
      .replace(
        '<p class="eyebrow">ONE GENUINELY GOOD DEAL, CHECKED DAILY</p>',
        `<p class="eyebrow">${t(language, "home.eyebrowMarket", { country: localizedMarketName.toUpperCase() })}</p>`
      )
      .replace(
        '<p class="hero-intro">We compare the price, product quality and seller signals - so your first stop before buying is a smarter one.</p>',
        `<p class="hero-intro">${t(language, "home.introMarket", { country: localizedMarketName })}</p><p class="market-note">${t(language, "home.marketNote", { country: localizedMarketName })}</p>`
      )
      .replace('<div class="trust-inline">', `<p class="shopping-model-note">${t(language, "home.modelNote")}</p><div class="trust-inline">`)
      .replace(/<section class="confidence-section">[\s\S]*?<\/section>/, "")
      .replace(/<div id="resultCount" class="result-count">[^<]*<\/div>/, '<div id="resultCount" class="result-count"></div>')
      .replace('<p class="eyebrow">THE ONEDAILYDROP SCORE</p>', `<p class="eyebrow">${t(language, "home.scoreEyebrow")}</p>`)
      .replace('<h2>A simple score with visible logic.</h2>', `<h2>${t(language, "home.scoreTitle")}</h2>`)
      .replace('<p>Every pick is judged using the same six-part framework.</p>', `<p>${t(language, "home.scoreIntro")}</p>`)
      .replace('href="/how-we-select-deals">Read our full methodology →', `href="${marketPath(selectedMarket.code, "/how-we-select-deals")}">${t(language, "home.methodology")}`)
      .replace('<span style="--weight:25%"><b>25%</b> Product quality</span>', '<span style="--weight:20%"><b>20%</b> Product quality</span>')
      .replace('<span style="--weight:15%"><b>15%</b> Customer feedback</span>', '<span style="--weight:15%"><b>15%</b> Review confidence</span>')
      .replace('<span style="--weight:10%"><b>10%</b> Shipping & returns</span><span style="--weight:5%"><b>5%</b> Freshness</span>', '<span style="--weight:10%"><b>10%</b> Demand & usefulness</span><span style="--weight:10%"><b>10%</b> Shipping & returns</span>')
      .replace(/<script src="\/app\.js\?v=[^"]+"><\/script>/, day9AppScript);

    enhanced = localizeHtml(enhanced, language)
      .replace(/<html lang="[^"]+">/, `<html lang="${locale}">`)
      .replace(/<meta property="og:locale" content="[^"]+">/, `<meta property="og:locale" content="${locale.replace("-", "_")}">`)
      .replace(/"inLanguage":"[^"]+"/g, `"inLanguage":"${locale}"`)
      .replace(/(<p id="subscribeStatus" class="form-status" aria-live="polite">)[\s\S]*?(<\/p>)/, `$1${t(language, "home.noSpam")}$2`)
      .replace("</body>", `${consentScript}</body>`);
    if (language !== defaultLanguage) {
      enhanced = enhanced.replace(
        /<meta name="robots" content="[^"]+">/,
        '<meta name="robots" content="noindex,follow">'
      );
      res.set("X-Robots-Tag", "noindex, follow");
      res.set("Cache-Control", "private, no-cache");
    } else {
      res.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    }
    const socialImage = enhanced.match(/<meta property="og:image" content="([^"]+)">/)?.[1] || "";
    enhanced = enhanced.replace("</head>", `${imageConnectionHints(socialImage)}${anchorOffsetStyle}${consentStyles}</head>`);
    return originalSend(enhanced);
  };

  return renderHomepage(req, res);
};
