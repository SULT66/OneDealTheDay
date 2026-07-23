(() => {
  const MARKETS = [
    { code: "US", name: "United States", flag: "🇺🇸", currency: "USD", locale: "en-US" },
    { code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD", locale: "en-CA" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP", locale: "en-GB" },
    { code: "AU", name: "Australia", flag: "🇦🇺", currency: "AUD", locale: "en-AU" },
    { code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR", locale: "de-DE" },
    { code: "FR", name: "France", flag: "🇫🇷", currency: "EUR", locale: "fr-FR" },
    { code: "ES", name: "Spain", flag: "🇪🇸", currency: "EUR", locale: "es-ES" },
    { code: "IT", name: "Italy", flag: "🇮🇹", currency: "EUR", locale: "it-IT" },
    { code: "NL", name: "Netherlands", flag: "🇳🇱", currency: "EUR", locale: "nl-NL" },
    { code: "SE", name: "Sweden", flag: "🇸🇪", currency: "SEK", locale: "sv-SE" },
    { code: "PL", name: "Poland", flag: "🇵🇱", currency: "PLN", locale: "pl-PL" },
    { code: "BR", name: "Brazil", flag: "🇧🇷", currency: "BRL", locale: "pt-BR" },
    { code: "MX", name: "Mexico", flag: "🇲🇽", currency: "MXN", locale: "es-MX" },
    { code: "JP", name: "Japan", flag: "🇯🇵", currency: "JPY", locale: "ja-JP" },
    { code: "KR", name: "South Korea", flag: "🇰🇷", currency: "KRW", locale: "ko-KR" },
    { code: "IN", name: "India", flag: "🇮🇳", currency: "INR", locale: "en-IN" },
    { code: "SG", name: "Singapore", flag: "🇸🇬", currency: "SGD", locale: "en-SG" },
    { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "AED", locale: "en-AE" },
    { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", currency: "SAR", locale: "en-SA" },
    { code: "TR", name: "Türkiye", flag: "🇹🇷", currency: "TRY", locale: "tr-TR" },
    { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR", locale: "en-ZA" },
    { code: "NZ", name: "New Zealand", flag: "🇳🇿", currency: "NZD", locale: "en-NZ" }
  ];

  const byCode = new Map(MARKETS.map(market => [market.code, market]));
  const params = new URLSearchParams(location.search);
  const requested = String(params.get("country") || "").toUpperCase();
  const saved = String(localStorage.getItem("odd_market") || "").toUpperCase();
  const browserRegion = String(navigator.language || "en-US").split("-")[1]?.toUpperCase() || "US";
  const initialCode = byCode.has(requested) ? requested : byCode.has(saved) ? saved : byCode.has(browserRegion) ? browserRegion : "US";

  const control = document.getElementById("marketControl");
  const button = document.getElementById("marketButton");
  const buttonText = document.getElementById("marketButtonText");
  const menu = document.getElementById("marketMenu");
  const options = document.getElementById("marketOptions");
  const status = document.getElementById("marketStatus");
  const flag = document.getElementById("marketFlag");
  let catalog = [];
  let usdRates = null;

  if (!control || !button || !menu || !options) return;

  const closeMenu = () => { menu.hidden = true; button.setAttribute("aria-expanded", "false"); };
  const openMenu = () => { menu.hidden = false; button.setAttribute("aria-expanded", "true"); options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const dealId = href => String(href || "").match(/-(\d+)(?:\?|$)/)?.[1] || String(href || "").match(/\/deal\/(\d+)/)?.[1];

  function formatMoney(value, currency, locale) {
    try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currency === "JPY" || currency === "KRW" ? 0 : 2 }).format(value); }
    catch { return `${currency} ${Number(value).toFixed(2)}`; }
  }

  async function loadRates() {
    if (usdRates) return usdRates;
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      const data = await response.json();
      if (data?.result === "success" && data.rates) usdRates = data.rates;
    } catch (_) {}
    return usdRates;
  }

  function productForNode(node) {
    const link = node.closest(".card,.mini-card,.featured-deal")?.querySelector('a[href*="/deal/"]');
    const id = dealId(link?.getAttribute("href"));
    return catalog.find(product => String(product.id) === String(id));
  }

  function restoreFullTitles() {
    document.querySelectorAll('.card h3 a,.mini-card h3 a,.featured-body h2 a').forEach(link => {
      const product = productForNode(link);
      if (product?.title) {
        link.textContent = product.title;
        link.title = product.title;
      }
    });
  }

  async function convertPrices(market) {
    const rates = await loadRates();
    const targetRate = rates?.[market.currency];
    document.querySelectorAll('.price,.mini-price,.featured-price,.old').forEach(node => {
      const product = productForNode(node);
      if (!product) return;
      const originalValue = node.classList.contains("old") ? Number(product.original_price) : Number(product.current_price);
      const sourceCurrency = String(product.currency || "USD").toUpperCase();
      if (!Number.isFinite(originalValue)) return;
      let converted = originalValue;
      if (rates && targetRate && rates[sourceCurrency]) converted = originalValue / rates[sourceCurrency] * targetRate;
      node.textContent = formatMoney(converted, market.currency, market.locale);
      node.dataset.convertedFrom = sourceCurrency;
    });
  }

  function renderFallback(products) {
    if (document.querySelector(".card,.mini-card") || !products.length) return;
    const top = products.slice(0, 10);
    const grid = document.getElementById("products");
    if (grid) grid.innerHTML = top.map((product, index) => `<article class="card"><a class="image-wrap" href="${escapeHtml(product.deal_url)}"><img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}"></a><div class="card-content"><div class="card-top"><span class="rank">#${index + 1}</span></div><p class="cat">${escapeHtml(product.category || "Deals")} · ${escapeHtml(product.source || "Retailer")}</p><h3><a href="${escapeHtml(product.deal_url)}">${escapeHtml(product.title)}</a></h3><p class="stats">★ ${escapeHtml(product.rating || "—")} · ${Number(product.review_count || 0).toLocaleString()} reviews · Score ${Math.round(Number(product.score) || 0)}/100</p><span class="price">${escapeHtml(product.currency || "USD")} ${Number(product.current_price || 0).toFixed(2)}</span><div class="card-actions"><a class="button" href="${escapeHtml(product.deal_url)}">VIEW DETAILS</a><a class="button secondary-action" href="/go/${product.id}" rel="nofollow sponsored">SEE DEAL</a></div></div></article>`).join("");
    const featured = top[0];
    const featuredDeal = document.getElementById("featuredDeal");
    if (featuredDeal && featured) featuredDeal.innerHTML = `<div class="featured-media"><a href="${escapeHtml(featured.deal_url)}"><img src="${escapeHtml(featured.image_url)}" alt="${escapeHtml(featured.title)}"></a></div><div class="featured-body"><p class="cat">${escapeHtml(featured.category || "Deals")}</p><h2><a href="${escapeHtml(featured.deal_url)}">${escapeHtml(featured.title)}</a></h2><span class="featured-price">${escapeHtml(featured.currency || "USD")} ${Number(featured.current_price || 0).toFixed(2)}</span><div class="card-actions"><a class="featured-button" href="${escapeHtml(featured.deal_url)}">VIEW DETAILS</a><a class="featured-button secondary-action" href="/go/${featured.id}" rel="nofollow sponsored">SEE DEAL</a></div></div>`;
  }

  function decoratePage(market) {
    document.querySelectorAll(".market-context").forEach(node => node.remove());
    const heroIntro = document.querySelector(".hero-intro");
    if (heroIntro) heroIntro.textContent = `Daily product research for shoppers in ${market.name}. Displayed prices are converted to ${market.currency} for comparison; the retailer confirms the final charge.`;
    const dealsTitle = document.getElementById("dealsTitle");
    if (dealsTitle) dealsTitle.textContent = `Top 10 Drops for ${market.name}`;
  }

  async function applyMarket(code, updateUrl) {
    const market = byCode.get(code) || byCode.get("US");
    localStorage.setItem("odd_market", market.code);
    document.documentElement.dataset.market = market.code;
    document.documentElement.dataset.currency = market.currency;
    document.documentElement.lang = market.locale.split("-")[0];
    if (flag) flag.textContent = market.flag;
    if (buttonText) buttonText.textContent = `${market.name} · ${market.currency}`;
    if (status) status.innerHTML = `<strong>${market.flag} Shopping in ${market.name} · Currency: ${market.currency}</strong><span class="market-status-note">Converted prices are estimates; checkout price is confirmed by the retailer.</span>`;
    options.querySelectorAll(".market-option").forEach(option => {
      const selected = option.dataset.code === market.code;
      option.setAttribute("aria-selected", String(selected));
      option.classList.toggle("is-selected", selected);
    });
    decoratePage(market);
    restoreFullTitles();
    await convertPrices(market);
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("country", market.code);
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    closeMenu();
    window.dispatchEvent(new CustomEvent("onedailydrop:marketchange", { detail: market }));
  }

  for (const market of MARKETS) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "market-option";
    option.dataset.code = market.code;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.innerHTML = `<span class="market-option-flag">${market.flag}</span><span class="market-option-name">${market.name}</span><span class="market-option-currency">${market.currency}</span><span class="market-option-check">✓</span>`;
    option.addEventListener("click", () => applyMarket(market.code, true));
    options.appendChild(option);
  }

  button.addEventListener("click", event => { event.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  document.addEventListener("click", event => { if (!control.contains(event.target)) closeMenu(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeMenu(); });

  fetch("/api/products", { cache: "no-store" })
    .then(response => response.ok ? response.json() : [])
    .then(products => {
      catalog = Array.isArray(products) ? products : [];
      renderFallback(catalog);
      return applyMarket(initialCode, requested !== initialCode);
    })
    .catch(() => applyMarket(initialCode, requested !== initialCode));
})();