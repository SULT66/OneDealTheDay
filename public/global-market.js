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

  const control = document.getElementById("marketControl");
  const button = document.getElementById("marketButton");
  const buttonText = document.getElementById("marketButtonText");
  const menu = document.getElementById("marketMenu");
  const options = document.getElementById("marketOptions");
  const status = document.getElementById("marketStatus");
  const flag = document.getElementById("marketFlag");

  if (!control || !button || !menu || !options) return;

  function closeMenu() {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const selected = options.querySelector('[aria-selected="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function decoratePage(market) {
    document.querySelectorAll(".market-context").forEach(node => node.remove());
    document.querySelectorAll(".card, .mini-card, .featured-deal").forEach(card => {
      const note = document.createElement("div");
      note.className = "market-context";
      note.textContent = `${market.flag} Selected market: ${market.name}`;
      const target = card.querySelector(".card-content, .mini-card-body, .featured-body") || card;
      target.appendChild(note);
    });

    const heroIntro = document.querySelector(".hero-intro");
    if (heroIntro) heroIntro.textContent = `Daily product research for shoppers in ${market.name}. Prices shown below remain in each retailer’s original currency until local retailer feeds are connected.`;

    const dealsTitle = document.getElementById("dealsTitle");
    if (dealsTitle) dealsTitle.textContent = `Top 10 Drops for ${market.name}`;
  }

  function applyMarket(code, updateUrl) {
    const market = byCode.get(code) || byCode.get("US");
    localStorage.setItem("odd_market", market.code);
    document.documentElement.dataset.market = market.code;
    document.documentElement.dataset.currency = market.currency;
    document.documentElement.lang = market.locale.split("-")[0];
    if (flag) flag.textContent = market.flag;
    if (buttonText) buttonText.textContent = `${market.name} · ${market.currency}`;
    if (status) status.textContent = `Shopping in ${market.name} · Currency: ${market.currency}`;

    options.querySelectorAll(".market-option").forEach(option => {
      const selected = option.dataset.code === market.code;
      option.setAttribute("aria-selected", String(selected));
      option.classList.toggle("is-selected", selected);
    });

    decoratePage(market);

    if (updateUrl) {
      const url = new URL(window.location.href);
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

  button.addEventListener("click", event => {
    event.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  });

  document.addEventListener("click", event => {
    if (!control.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  applyMarket(initialCode, requested !== initialCode);
})();