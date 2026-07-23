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
  const params = new URLSearchParams(window.location.search);
  const requested = String(params.get("country") || "").toUpperCase();
  const saved = String(localStorage.getItem("odd_market") || "").toUpperCase();
  const browserRegion = String(navigator.language || "en-US").split("-")[1]?.toUpperCase() || "US";
  const initialCode = byCode.has(requested) ? requested : byCode.has(saved) ? saved : byCode.has(browserRegion) ? browserRegion : "US";

  const select = document.getElementById("marketSelect");
  const status = document.getElementById("marketStatus");
  const flag = document.getElementById("marketFlag");

  if (!select) return;

  for (const market of MARKETS) {
    const option = document.createElement("option");
    option.value = market.code;
    option.textContent = `${market.flag} ${market.name} · ${market.currency}`;
    select.appendChild(option);
  }

  function applyMarket(code, updateUrl) {
    const market = byCode.get(code) || byCode.get("US");
    select.value = market.code;
    localStorage.setItem("odd_market", market.code);
    document.documentElement.dataset.market = market.code;
    document.documentElement.dataset.currency = market.currency;
    if (flag) flag.textContent = market.flag;
    if (status) status.textContent = `Shopping market: ${market.name} · Currency: ${market.currency}`;

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("country", market.code);
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    window.dispatchEvent(new CustomEvent("onedailydrop:marketchange", { detail: market }));
  }

  select.addEventListener("change", () => applyMarket(select.value, true));
  applyMarket(initialCode, requested !== initialCode);
})();
