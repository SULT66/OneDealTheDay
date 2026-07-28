(() => {
  const $ = id => document.getElementById(id);
  const marketCode = String(window.__ODD_MARKET__ || "us").toLowerCase();
  const marketTimezone = String(window.__ODD_MARKET_TIMEZONE__ || "America/New_York");
  const locale = String(window.__ODD_LOCALE__ || "en-US");
  const text = window.__ODD_TEXT__ || {};
  const tr = (key, fallback = key, variables = {}) => String(text[key] || fallback)
    .replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? "");
  const categoryLabel = category => tr(`category.${category}`, category);
  const marketPath = path => `/${marketCode}${String(path || "").startsWith("/") ? path : `/${path || ""}`}`.replace(/\/$/, "");
  const els = {
    searchInput: $("searchInput"),
    searchForm: $("searchForm"),
    searchClear: $("searchClear"),
    themeToggle: $("themeToggle"),
    mobileMenuToggle: document.querySelector(".mobile-menu-toggle"),
    mainNavigation: $("mainNavigation"),
    categoryMenuButton: $("categoryMenuButton"),
    categoryMenu: $("categoryMenu"),
    featuredDeal: $("featuredDeal"),
    updated: $("updated"),
    countdown: $("countdown"),
    dealsTitle: $("dealsTitle"),
    resultCount: $("resultCount"),
    products: $("products"),
    emptyState: $("emptyState"),
    trendingProducts: $("trendingProducts"),
    priceDropProducts: $("priceDropProducts"),
    newProducts: $("newProducts")
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const cleanText = value => {
    const element = document.createElement("div");
    element.innerHTML = String(value ?? "");
    return (element.textContent || element.innerText || "").replace(/\s+/g, " ").trim();
  };
  const fullTitle = value => cleanText(value);
  const isDemo = product => String(product?.source || "").toLowerCase() === "demo";
  const money = (value, currency = "USD") => {
    if (value == null || value === "") return tr("product.checkPrice", "Check price");
    const amount = Number(value);
    if (!Number.isFinite(amount)) return tr("product.checkPrice", "Check price");
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };
  const discount = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0
    ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100)
    : 0;
  const storeName = product => {
    if (isDemo(product)) return "OneDailyDrop";
    if (cleanText(product.retailer_name)) return cleanText(product.retailer_name);
    const source = String(product.source || "").toLowerCase();
    if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
    if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
    return product.source ? String(product.source) : tr("product.retailer", "Retailer");
  };
  const badgeFor = product => {
    if (isDemo(product)) return "";
    if (discount(product) >= 25) return tr("product.verified", "VERIFIED DEAL");
    if (Number(product.score) >= 90) return tr("product.editorPick", "EDITOR'S PICK");
    if (Number(product.review_count) >= 5000) return tr("product.trending", "TRENDING");
    return tr("product.popular", "POPULAR PICK");
  };
  const statusText = product => isDemo(product)
    ? tr("product.availabilitySoon", "Retailer availability coming soon")
    : product.checked_at || product.updated_at
      ? tr("product.priceChecked", "Price checked {date}", { date: new Date(product.checked_at || product.updated_at).toLocaleString(locale) })
      : tr("product.priceVerified", "Price recently verified");
  const priceLabel = product => isDemo(product)
    ? tr("product.retailerPrice", "Retailer price")
    : tr("product.currentPrice", "Current price");
  const whyPicked = product => {
    if (isDemo(product)) return cleanText(product.description) || tr("product.demoFallback", "Chosen for clear everyday usefulness and straightforward features.");
    if (cleanText(product.selection_reason)) return cleanText(product.selection_reason);
    const reasons = [];
    if (Number(product.rating) >= 4.5) reasons.push(tr("product.ratingReason", "{rating}-star rating", { rating: Number(product.rating).toFixed(1) }));
    if (Number(product.review_count) >= 1000) reasons.push(tr("product.reviewsReason", "{count} reviews", { count: Number(product.review_count).toLocaleString(locale) }));
    if (Number(product.score) >= 80) reasons.push(tr("product.scoreReason", "{score}/100 OneDailyDrop score", { score: Math.round(Number(product.score)) }));
    if (discount(product)) reasons.push(tr("product.discountReason", "{percent}% verified discount", { percent: discount(product) }));
    return reasons.length
      ? `${tr("product.why", "Why we picked it:").replace(/:$/, "")} ${reasons.join(", ")}.`
      : tr("product.selectedFallback", "Picked for its price, shopper feedback and overall value.");
  };
  const dealUrl = product => product.deal_url || marketPath(`/deal/${encodeURIComponent(product.id)}`);
  const actionButton = (product, className) => isDemo(product)
    ? `<a class="${className}" href="${esc(dealUrl(product))}">${esc(tr("product.viewDetails", "VIEW DETAILS"))}</a>`
    : `<a class="${className}" href="${marketPath(`/go/${encodeURIComponent(product.id)}`)}" rel="nofollow sponsored">${esc(tr("product.viewDealAt", "VIEW DEAL AT {store}", { store: storeName(product) }))}</a>`;
  const priceHistoryAction = product => isDemo(product)
    ? ""
    : `<a class="price-history-link" href="${esc(dealUrl(product))}#price-history">${esc(tr("product.priceHistory", "PRICE HISTORY"))}</a>`;
  const offerFacts = product => {
    if (isDemo(product)) return "";
    const seller = cleanText(product.seller_name) || storeName(product);
    const shipping = cleanText(product.shipping_summary) || tr("product.confirmRetailer", "Confirm at retailer");
    const returns = cleanText(product.return_summary) || tr("product.retailerPolicy", "See retailer policy");
    return `<dl class="offer-facts" aria-label="${esc(tr("product.offerDetails", "Offer details"))}">
      <div><dt>${esc(tr("product.soldBy", "Sold by"))}</dt><dd>${esc(seller)}</dd></div>
      <div><dt>${esc(tr("product.delivery", "Delivery"))}</dt><dd>${esc(shipping)}</dd></div>
      <div><dt>${esc(tr("product.returns", "Returns"))}</dt><dd>${esc(returns)}</dd></div>
    </dl>`;
  };

  let products = [];
  let activeCategory = "More Worth Seeing";
  const searchAliases = {
    cat: ["cat", "cats", "pet", "pets"],
    cats: ["cat", "cats", "pet", "pets"],
    dog: ["dog", "dogs", "pet", "pets"],
    dogs: ["dog", "dogs", "pet", "pets"],
    phone: ["phone", "phones", "smartphone", "smartphones", "mobile"],
    tv: ["tv", "television", "televisions"],
    car: ["car", "cars", "automotive", "auto"]
  };
  const searchTerms = value => String(value || "").toLowerCase().trim().split(/\s+/).filter(Boolean)
    .map(term => searchAliases[term] || [term, term.endsWith("s") ? term.slice(0, -1) : `${term}s`]);
  const matchesSearch = (product, query) => {
    const haystack = `${product.title || ""} ${cleanText(product.description)} ${product.category || ""} ${product.brand || ""}`.toLowerCase();
    return searchTerms(query).every(alternatives => alternatives.some(term => haystack.includes(term)));
  };

  const renderFeatured = () => {
    const product = products[0];
    if (!product) {
      els.featuredDeal.innerHTML = `<div class="featured-body"><h2>${esc(tr("home.unavailable", "No featured drop is available yet."))}</h2></div>`;
      return;
    }
    const save = discount(product);
    els.featuredDeal.innerHTML = `
      <div class="featured-media">
        <a href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}"></a>
        <span class="featured-ribbon">${esc(tr("home.featured", "TODAY'S #1 PICK"))}</span>${badgeFor(product) ? `<span class="featured-badge">${esc(badgeFor(product))}</span>` : ""}
      </div>
      <div class="featured-body">
        <p class="cat">${esc(categoryLabel(product.category || "Deals"))} · ${esc(storeName(product))}</p>
        <h2><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h2>
        <p class="description">${esc(whyPicked(product))}</p>
        <p class="stats">★ ${esc(product.rating || " - ")} · ${Number(product.review_count || 0).toLocaleString(locale)} ${esc(tr("product.reviews", "reviews"))}</p>
        <div class="score-strip"><strong>${Math.round(Number(product.score) || 0)}/100</strong><span>OneDailyDrop ${esc(tr("product.score", "Score"))}</span></div>
        <div class="featured-price-row"><span class="price-label">${priceLabel(product)}</span><span class="featured-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${esc(tr("product.save", "SAVE {percent}%", { percent: save }))}</span>` : ""}</div>
        <p class="verification">${esc(statusText(product))}</p>
        ${offerFacts(product)}
        <div class="card-actions">${actionButton(product, "featured-button")}${priceHistoryAction(product)}</div>
      </div>`;
  };

  const mainCard = (product, rank) => {
    const save = discount(product);
    return `
      <article class="card">
        <a class="image-wrap" href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
        <div class="card-content">
          <div class="card-top"><span class="rank">#${rank}</span>${badgeFor(product) ? `<span class="badge">${esc(badgeFor(product))}</span>` : ""}</div>
          <p class="cat">${esc(categoryLabel(product.category || "Deals"))} · ${esc(storeName(product))}</p>
          <h3><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h3>
          <p class="description"><strong>${esc(tr("product.why", "Why we picked it:"))}</strong> ${esc(whyPicked(product))}</p>
          <p class="stats">★ ${esc(product.rating || " - ")} · ${Number(product.review_count || 0).toLocaleString(locale)} ${esc(tr("product.reviews", "reviews"))} · ${esc(tr("product.score", "Score"))} ${Math.round(Number(product.score) || 0)}/100</p>
          <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${esc(tr("product.save", "SAVE {percent}%", { percent: save }))}</span>` : ""}</div>
          <p class="verification">${esc(statusText(product))}</p>
          ${offerFacts(product)}
          <div class="card-actions">${actionButton(product, "button")}${priceHistoryAction(product)}</div>
        </div>
      </article>`;
  };

  const miniCard = product => {
    const save = discount(product);
    return `
      <article class="mini-card">
        <a href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
        <div class="mini-card-body">
          <p class="cat">${esc(categoryLabel(product.category || "Deals"))} · ${esc(storeName(product))}</p>
          <h3><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h3>
          <p class="mini-meta">★ ${esc(product.rating || " - ")} · ${esc(tr("product.score", "Score"))} ${Math.round(Number(product.score) || 0)}/100${save ? ` · ${esc(tr("product.off", "{percent}% off", { percent: save }))}` : ""}</p>
          <div class="mini-price-row"><span class="mini-price-label">${priceLabel(product)}</span><span class="mini-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}</div>
          <a class="mini-action" href="${esc(dealUrl(product))}">${esc(tr("product.viewDetails", "VIEW DETAILS"))}</a>
        </div>
      </article>`;
  };

  const visibleProducts = query => {
    if (query) {
      return products.filter(product => matchesSearch(product, query));
    }
    if (activeCategory === "More Worth Seeing") return products.slice(1, 10);
    return products.filter(product => product.category === activeCategory);
  };

  const renderMain = () => {
    const query = els.searchInput.value.trim().toLowerCase();
    const visible = visibleProducts(query);
    els.dealsTitle.textContent = query ? tr("search.results", "Search results") : activeCategory === "More Worth Seeing" ? tr("nav.more", "9 More Worth Seeing") : activeCategory;
    els.resultCount.textContent = query
      ? tr("search.found", "Found {count} products", { count: visible.length })
      : activeCategory === "More Worth Seeing"
        ? ""
        : tr("search.products", "{count} products", { count: visible.length });
    els.emptyState.hidden = visible.length !== 0;
    els.products.innerHTML = visible.map((product, index) => mainCard(product, index + 1)).join("");
  };

  const takeUnique = (source, count, used) => {
    const chosen = [];
    for (const product of source) {
      if (chosen.length >= count) break;
      if (used.has(product.id)) continue;
      used.add(product.id);
      chosen.push(product);
    }
    return chosen;
  };

  const renderCollections = () => {
    const used = new Set(products.slice(0, 10).map(product => product.id));
    const trending = takeUnique([...products].sort((a, b) => Number(b.review_count || 0) - Number(a.review_count || 0)), 4, used);
    const priceDrops = takeUnique([...products].filter(product => discount(product) > 0).sort((a, b) => discount(b) - discount(a)), 4, used);
    const newest = takeUnique([...products].sort((a, b) => Number(b.id) - Number(a.id)), 4, used);
    els.trendingProducts.innerHTML = trending.map(miniCard).join("");
    els.priceDropProducts.innerHTML = priceDrops.map(miniCard).join("");
    els.newProducts.innerHTML = newest.map(miniCard).join("");
  };

  const renderCategoryMenu = () => {
    const categories = [...new Set(products.map(product => product.category).filter(Boolean))];
    const categoryUrl = category => marketPath(`/category/${category.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
    els.categoryMenu.innerHTML = [`<a href="#top">${esc(tr("nav.more", "9 More Worth Seeing"))}</a>`, ...categories.map(category => `<a href="${esc(categoryUrl(category))}">${esc(categoryLabel(category))}</a>`)].join("");
  };

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has("country")) {
    currentUrl.searchParams.delete("country");
    history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }

  const mobileMenuQuery = window.matchMedia("(max-width: 720px)");
  const closeMobileMenu = (restoreFocus = false) => {
    if (!els.mobileMenuToggle || !els.mainNavigation) return;
    els.mobileMenuToggle.setAttribute("aria-expanded", "false");
    els.mobileMenuToggle.setAttribute("aria-label", tr("menu.open", "Open menu"));
    els.mainNavigation.classList.remove("is-open");
    if (els.categoryMenu && els.categoryMenuButton) {
      els.categoryMenu.hidden = true;
      els.categoryMenuButton.setAttribute("aria-expanded", "false");
    }
    if (restoreFocus) els.mobileMenuToggle.focus();
  };

  if (els.mobileMenuToggle && els.mainNavigation) {
    els.mobileMenuToggle.addEventListener("click", () => {
      const willOpen = els.mobileMenuToggle.getAttribute("aria-expanded") !== "true";
      els.mobileMenuToggle.setAttribute("aria-expanded", String(willOpen));
      els.mobileMenuToggle.setAttribute("aria-label", willOpen ? tr("menu.close", "Close menu") : tr("menu.open", "Open menu"));
      els.mainNavigation.classList.toggle("is-open", willOpen);
    });
    els.mainNavigation.addEventListener("click", event => {
      if (mobileMenuQuery.matches && event.target.closest("a")) closeMobileMenu();
    });
    document.addEventListener("click", event => {
      if (
        mobileMenuQuery.matches &&
        els.mobileMenuToggle.getAttribute("aria-expanded") === "true" &&
        !event.target.closest(".site-header")
      ) closeMobileMenu();
    });
    mobileMenuQuery.addEventListener("change", event => {
      if (!event.matches) closeMobileMenu();
    });
  }

  els.categoryMenuButton.addEventListener("click", () => {
    const open = els.categoryMenu.hidden;
    els.categoryMenu.hidden = !open;
    els.categoryMenuButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".category-menu")) {
      els.categoryMenu.hidden = true;
      els.categoryMenuButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const categoryWasOpen = !els.categoryMenu.hidden;
      els.categoryMenu.hidden = true;
      els.categoryMenuButton.setAttribute("aria-expanded", "false");
      if (categoryWasOpen) els.categoryMenuButton.focus();
      if (els.mobileMenuToggle?.getAttribute("aria-expanded") === "true") closeMobileMenu(true);
    }
  });
  els.searchInput.addEventListener("input", () => {
    activeCategory = "More Worth Seeing";
    els.searchClear.hidden = !els.searchInput.value;
    renderMain();
  });
  els.searchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    els.searchClear.hidden = true;
    renderMain();
    els.searchInput.focus();
  });
  if (els.searchForm) {
    els.searchForm.addEventListener("submit", event => {
      if (!els.searchInput.value.trim()) event.preventDefault();
    });
  }
  const subscribeForm = $("subscribeForm");
  if (subscribeForm) {
    subscribeForm.addEventListener("submit", async event => {
      event.preventDefault();
      const status = $("subscribeStatus");
      const button = subscribeForm.querySelector("button[type=submit]");
      const email = $("subscribeEmail").value.trim();
      const categories = [...subscribeForm.querySelectorAll('input[name="categories"]:checked')].map(input => input.value);
      const interestFieldset = $("interestFieldset");
      const categoryError = $("categoryError");
      if (!$("subscribeEmail").checkValidity()) {
        $("subscribeEmail").reportValidity();
        status.textContent = tr("form.validEmail", "Enter a valid email address.");
        return;
      }
      if (!categories.length) {
        interestFieldset.classList.add("has-error");
        categoryError.hidden = false;
        status.textContent = tr("form.chooseCategory", "Choose at least one category before subscribing.");
        subscribeForm.querySelector('input[name="categories"]').focus();
        return;
      }
      interestFieldset.classList.remove("has-error");
      categoryError.hidden = true;
      button.disabled = true;
      status.textContent = tr("form.saving", "Saving your preferences…");
      try {
        const response = await fetch(marketPath("/api/subscribe"), {
          method: "POST",
          headers: {"Content-Type": "application/json", Accept: "application/json"},
          body: JSON.stringify({email, categories})
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || tr("form.failed", "Could not subscribe."));
        subscribeForm.classList.add("is-success");
        status.textContent = result.message;
        localStorage.setItem("dailyDropInterests", JSON.stringify(categories));
        subscribeForm.reset();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    subscribeForm.querySelectorAll('input[name="categories"]').forEach(input => {
      input.addEventListener("change", () => {
        if (!subscribeForm.querySelector('input[name="categories"]:checked')) return;
        $("interestFieldset").classList.remove("has-error");
        $("categoryError").hidden = true;
        $("subscribeStatus").textContent = tr("home.noSpam", "No spam. Unsubscribe anytime.");
      });
    });
  }

  const updateCountdown = () => {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: marketTimezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date());
    const value = type => Number(parts.find(part => part.type === type)?.value || 0);
    const secondsNow = value("hour") * 3600 + value("minute") * 60 + value("second");
    const targetSeconds = 15 * 60;
    const remaining = (targetSeconds - secondsNow + 86400) % 86400 || 86400;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor(remaining % 3600 / 60);
    const seconds = remaining % 60;
    els.countdown.textContent = `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  };
  setInterval(updateCountdown, 1000);
  updateCountdown();

  fetch(`/api/products?market=${encodeURIComponent(marketCode)}`, { headers: { Accept: "application/json" } })
    .then(async response => {
      if (!response.ok) throw new Error(`Products API returned HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      products = (Array.isArray(data) ? data : []).filter(product => product && product.title).sort((a, b) => {
        const leftRank = Number(a.daily_rank || Number.MAX_SAFE_INTEGER);
        const rightRank = Number(b.daily_rank || Number.MAX_SAFE_INTEGER);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return Number(b.score || 0) - Number(a.score || 0);
      });
      els.updated.textContent = products[0] ? statusText(products[0]) : tr("home.preparing", "Today's selection is being prepared");
      renderFeatured();
      renderCategoryMenu();
      renderMain();
      renderCollections();
    })
    .catch(error => {
      console.error("OneDailyDrop load error:", error);
      els.updated.textContent = tr("load.failed", "Could not load today's selections");
    });
})();
