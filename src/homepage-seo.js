const renderHomepage = require("./homepage");
const { marketFromRequest, marketPath, alternateLinks } = require("./markets");

const SITE = "https://www.onedailydrop.com";
const anchorOffsetStyle = `<style id="homepage-anchor-offset">
#today,#featuredDeal,#subscribe,#top,#score,#archive,#trending,#price-drops,#new-drops,#about{scroll-margin-top:112px}
@media(max-width:720px){#today,#featuredDeal,#subscribe,#top,#score,#archive,#trending,#price-drops,#new-drops,#about{scroll-margin-top:164px}}
</style>`;

module.exports = function homepageSeo(req, res) {
  const originalSend = res.send.bind(res);
  const selectedMarket = marketFromRequest(req);
  req.market = selectedMarket.code;

  res.send = body => {
    if (typeof body !== "string" || !body.includes("application/ld+json")) return originalSend(body);

    const homePath = marketPath(selectedMarket.code);
    const canonical = SITE + homePath;
    const appScript = `<script>window.__ODD_MARKET__=${JSON.stringify(selectedMarket.code)};window.__ODD_MARKET_TIMEZONE__=${JSON.stringify(selectedMarket.timezone)};</script><script>(function(){const q=new URLSearchParams(location.search).get("q");if(!q)return;const input=document.getElementById("searchInput");if(input)input.value=q;})();</script><script src="/app.js?v=20260727-markets"></script>`;
    let enhanced = body
      .replace(
        '<link rel="canonical" href="https://www.onedailydrop.com/">',
        `<link rel="canonical" href="${canonical}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:site_name" content="OneDailyDrop">${alternateLinks("/")}`
      )
      .replace(`<meta property="og:url" content="${SITE}/">`, `<meta property="og:url" content="${canonical}">`)
      .replace('href="/" aria-label="OneDailyDrop home"', `href="${homePath}" aria-label="OneDailyDrop home"`)
      .replace('action="/search"', `action="${marketPath(selectedMarket.code, "/search")}"`)
      .replace(/href="\/us\/category\//g, `href="/${selectedMarket.code}/category/`)
      .replace('<a href="#archive">Past Drops</a>', `<a href="${marketPath(selectedMarket.code, "/archive")}">Past Drops</a>`)
      .replace(
        '<p class="eyebrow">ONE GENUINELY GOOD DEAL, CHECKED DAILY</p>',
        `<p class="eyebrow">ONE GENUINELY GOOD DEAL IN ${selectedMarket.name.toUpperCase()}, CHECKED DAILY</p>`
      )
      .replace(
        '<p class="hero-intro">We compare the price, product quality and seller signals - so your first stop before buying is a smarter one.</p>',
        `<p class="hero-intro">We compare local ${selectedMarket.name} prices, product quality and seller signals, so your first stop before buying is a smarter one.</p><p class="market-note">Deals, currency and retailers are selected automatically from your IP location: ${selectedMarket.name}.</p>`
      )
      .replace('<div class="trust-inline">', '<p class="shopping-model-note">OneDailyDrop does not sell products. When you choose a deal, we send you to the local retailer.</p><div class="trust-inline">')
      .replace(/<section class="confidence-section">[\s\S]*?<\/section>/, "")
      .replace(/<div id="resultCount" class="result-count">[^<]*<\/div>/, '<div id="resultCount" class="result-count"></div>')
      .replace('<span style="--weight:25%"><b>25%</b> Product quality</span>', '<span style="--weight:20%"><b>20%</b> Product quality</span>')
      .replace('<span style="--weight:15%"><b>15%</b> Customer feedback</span>', '<span style="--weight:15%"><b>15%</b> Review confidence</span>')
      .replace('<span style="--weight:10%"><b>10%</b> Shipping & returns</span><span style="--weight:5%"><b>5%</b> Freshness</span>', '<span style="--weight:10%"><b>10%</b> Demand & usefulness</span><span style="--weight:10%"><b>10%</b> Shipping & returns</span>')
      .replace(/<script src="\/app\.js\?v=[^"]+"><\/script>/, appScript);

    enhanced = enhanced.replace("</head>", `${anchorOffsetStyle}</head>`);
    return originalSend(enhanced);
  };

  return renderHomepage(req, res);
};
