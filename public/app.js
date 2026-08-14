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
    archiveProducts: document.querySelector("#archive .mini-grid")
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const cleanText = value => {
    const element = document.createElement("div");
    element.innerHTML = String(value ?? "");
    return (element.textContent || element.innerText || "").replace(/\s+/g, " ").trim();
  };
  const fullTitle = value => cleanText(value);
  const isDemo = product => String(product?.source || "").toLowerCase() === "demo";
  const hasCurrentOffer = product => Number(product?.current_price) > 0 &&
    /^[A-Z]{3}$/.test(String(product?.currency || "").toUpperCase()) &&
    Boolean(cleanText(product?.checked_at));
  const hasReviewData = product => Number(product?.rating) > 0 && Number(product?.review_count) > 0;
  const scoreValue = product => {
    const raw = Object.prototype.hasOwnProperty.call(product || {}, "display_score")
      ? product.display_score
      : product?.score ?? product?.drop_score;
    if (raw == null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null;
  };
  const sellerRatingPercent = product => {
    const rating = Number(product?.seller_rating);
    if (!Number.isFinite(rating) || rating <= 0) return null;
    return Math.max(0, Math.min(100, rating <= 5 ? rating * 20 : rating));
  };
  const displayCategory = product => cleanText(product?.display_category) || categoryLabel(product?.category || "Deals");
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
    return cleanText(product.display_badge) || tr("product.checkedOffer", "CHECKED OFFER");
  };
  const statusText = product => isDemo(product)
    ? tr("product.availabilitySoon", "Retailer availability coming soon")
    : !hasCurrentOffer(product)
      ? tr("page.finalPrice", "Check current price and availability on the retailer website.")
    : product.checked_at || product.updated_at
      ? tr("product.priceChecked", "Price checked {date}", { date: new Date(product.checked_at || product.updated_at).toLocaleString(locale) })
      : tr("product.priceVerified", "Price recently verified");
  const priceLabel = product => isDemo(product)
    ? tr("product.retailerPrice", "Retailer price")
    : !hasCurrentOffer(product)
      ? tr("product.retailerPrice", "Retailer price")
    : tr("product.currentPrice", "Current price");
  const whyPicked = product => {
    if (isDemo(product)) return cleanText(product.description) || tr("product.demoFallback", "Chosen for clear everyday usefulness and straightforward features.");
    return cleanText(product.display_selection_reason) || tr("product.reasonCheckedOffer", "a current price and offer details checked with the retailer");
  };
  const dealUrl = product => product.deal_url || marketPath(`/deal/${encodeURIComponent(product.id)}`);
  const trackingAttributes = (product, placement) => `data-track-product="${Number(product.id)}" data-track-source="home" data-track-placement="${placement}" data-track-action="view_details"`;
  const outboundUrl = (product, placement, action = "view_deal") => {
    const query = new URLSearchParams({ source:"home", placement, action });
    return `${marketPath(`/go/${encodeURIComponent(product.id)}`)}?${query.toString()}`;
  };
  const actionButton = (product, className, placement) => isDemo(product)
    ? `<a class="${className}" href="${esc(dealUrl(product))}">${esc(tr("product.viewDetails", "VIEW DETAILS"))}</a>`
    : `<a class="${className}" href="${esc(outboundUrl(product, placement))}" target="_blank" rel="sponsored noopener noreferrer">${esc(tr("product.viewDealAt", "VIEW DEAL AT {store}", { store: storeName(product) }))}</a>`;
  const priceHistoryAction = product => isDemo(product) || !hasCurrentOffer(product)
    ? ""
    : `<a class="price-history-link" href="${esc(dealUrl(product))}#price-history">${esc(tr("product.priceHistory", "PRICE HISTORY"))}</a>`;
  const offerFacts = product => {
    if (isDemo(product)) return "";
    const seller = cleanText(product.seller_name) || storeName(product);
    const shipping = cleanText(product.display_shipping_summary) || tr("product.confirmRetailer", "Confirm at retailer");
    const returns = cleanText(product.display_return_summary) || tr("product.retailerPolicy", "See retailer policy");
    return `<dl class="offer-facts" aria-label="${esc(tr("product.offerDetails", "Offer details"))}">
      <div><dt>${esc(tr("product.soldBy", "Sold by"))}</dt><dd>${esc(seller)}</dd></div>
      <div><dt>${esc(tr("product.delivery", "Delivery"))}</dt><dd>${esc(shipping)}</dd></div>
      <div><dt>${esc(tr("product.returns", "Returns"))}</dt><dd>${esc(returns)}</dd></div>
    </dl>`;
  };
  const scoreMetrics = (product, atSelection = false) => {
    const score = scoreValue(product);
    const productRating = hasReviewData(product)
      ? (cleanText(product.display_product_rating) || `${Number(product.rating).toFixed(1)}/5`)
      : "";
    const sellerPercent = sellerRatingPercent(product);
    const sellerRating = cleanText(product.display_seller_rating) || (sellerPercent == null
      ? ""
      : tr("product.sellerRatingSummary", "{percent}% positive", {
        percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(sellerPercent)
      }));
    const sellerFeedback = cleanText(product.display_seller_feedback) || (Number(product.seller_feedback_count) > 0
      ? tr("product.sellerFeedbackCount", "{count} seller ratings", {
        count: Number(product.seller_feedback_count).toLocaleString(locale)
      })
      : "");
    if (score == null && !productRating && !sellerRating) return "";
    const ratings = [
      productRating ? `<span class="deal-rating"><strong>★ ${esc(productRating)}</strong><small>${esc(cleanText(product.display_product_rating_label) || tr("product.productRating", "Product rating"))}</small></span>` : "",
      sellerRating ? `<span class="deal-rating"><strong>${esc(sellerRating)}</strong><small>${esc(cleanText(product.display_seller_rating_label) || tr("product.sellerRating", "Seller rating"))}${sellerFeedback ? ` · ${esc(sellerFeedback)}` : ""}</small></span>` : ""
    ].filter(Boolean).join("");
    return `<div class="deal-metrics${atSelection ? " is-selection" : ""}">
      ${score == null ? "" : `<div class="deal-score"><strong>${score}/100</strong><span>${esc(atSelection ? tr("product.scoreAtSelection", "OneDailyDrop Score at selection") : tr("product.oneDailyDropScore", "OneDailyDrop Score"))}<small>${esc(tr("product.overallDealScore", "Overall deal score"))}</small></span></div>`}
      ${ratings ? `<div class="deal-ratings">${ratings}</div>` : ""}
    </div>`;
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
  const normalizeSearchText = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matchesSearch = (product, query) => {
    const haystack = normalizeSearchText([
      product.title,
      cleanText(product.description),
      product.category,
      displayCategory(product),
      product.brand,
      storeName(product)
    ].filter(Boolean).join(" "));
    return searchTerms(normalizeSearchText(query))
      .every(alternatives => alternatives.some(term => haystack.includes(normalizeSearchText(term))));
  };

  const searchSuggestions = document.createElement("div");
  searchSuggestions.id = "searchSuggestions";
  searchSuggestions.className = "search-suggestions";
  searchSuggestions.setAttribute("role", "region");
  searchSuggestions.setAttribute("aria-label", tr("search.results", "Search results"));
  searchSuggestions.hidden = true;
  els.searchForm?.appendChild(searchSuggestions);
  els.searchInput?.setAttribute("aria-controls", searchSuggestions.id);
  els.searchInput?.setAttribute("aria-expanded", "false");

  const closeSearchSuggestions = () => {
    searchSuggestions.hidden = true;
    els.searchInput?.setAttribute("aria-expanded", "false");
  };

  const renderSearchSuggestions = () => {
    const query = els.searchInput?.value.trim() || "";
    els.searchClear.hidden = !query;
    if (!query) {
      closeSearchSuggestions();
      return;
    }

    const matches = products.filter(product => matchesSearch(product, query));
    const resultLabel = tr("search.found", "Found {count} products", { count: matches.length });
    const searchUrl = `${marketPath("/search")}?q=${encodeURIComponent(query)}`;
    searchSuggestions.innerHTML = matches.length
      ? `<div class="search-suggestion-heading">${esc(resultLabel)}</div>
        <div class="search-suggestion-list">${matches.slice(0, 6).map(product => `
          <a class="search-suggestion" href="${esc(dealUrl(product))}" ${trackingAttributes(product, "search_suggestion")}>
            <img src="${esc(product.image_url)}" alt="" loading="lazy" decoding="async">
            <span><strong>${esc(fullTitle(product.title))}</strong><small>${esc(displayCategory(product))} · ${esc(money(product.current_price, product.currency))}</small></span>
          </a>`).join("")}</div>
        <a class="search-view-all" href="${esc(searchUrl)}">${esc(resultLabel)} →</a>`
      : `<div class="search-no-results">${esc(tr("home.noMatch", "No products match that search."))}</div>`;
    searchSuggestions.hidden = false;
    els.searchInput.setAttribute("aria-expanded", "true");
  };

  const renderFeatured = () => {
    const product = products[0];
    if (!product) {
      els.featuredDeal.innerHTML = `<div class="featured-body catalog-empty-featured">
        <p class="eyebrow">${esc(tr("home.catalogEyebrow", "REAL PRODUCTS, NO PLACEHOLDERS"))}</p>
        <h2>${esc(tr("home.catalogTitle", "The first verified Daily Drop is coming."))}</h2>
        <p class="description">${esc(tr("home.catalogText", "We removed every sample listing. A product will appear here only after its retailer link, source and product details have been checked."))}</p>
        <div class="catalog-empty-checks" aria-label="${esc(tr("home.catalogStandards", "Publication standards"))}">
          <span>✓ ${esc(tr("home.realProductsOnly", "Real products only"))}</span>
          <span>✓ ${esc(tr("home.verifiedRetailerLinks", "Working retailer links"))}</span>
          <span>✓ ${esc(tr("home.noInventedData", "No invented prices or ratings"))}</span>
        </div>
        <a class="featured-button" href="#subscribe">${esc(tr("home.catalogNotify", "Notify me when the first drop is live"))}</a>
      </div>`;
      return;
    }
    const save = discount(product);
    els.featuredDeal.innerHTML = `
      <div class="featured-media">
        <a href="${esc(dealUrl(product))}" ${trackingAttributes(product, "featured_media")}><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" decoding="async" fetchpriority="high"></a>
        <span class="featured-ribbon">${esc(tr("home.featured", "TODAY'S #1 PICK"))}</span>${badgeFor(product) ? `<span class="featured-badge">${esc(badgeFor(product))}</span>` : ""}
      </div>
      <div class="featured-body">
        <p class="cat">${esc(displayCategory(product))} · ${esc(storeName(product))}</p>
        <h2><a href="${esc(dealUrl(product))}" ${trackingAttributes(product, "featured_title")}>${esc(fullTitle(product.title))}</a></h2>
        <p class="description editorial-teaser">${esc(whyPicked(product))}</p>
        ${scoreMetrics(product)}
        <div class="featured-price-row"><span class="price-label">${priceLabel(product)}</span><span class="featured-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${esc(tr("product.belowReferencePercent", "{percent}% BELOW REF.", { percent: save }))}</span>` : ""}</div>
        <p class="verification">${esc(statusText(product))}</p>
        ${offerFacts(product)}
        <div class="card-actions">${actionButton(product, "featured-button", "featured_cta")}${priceHistoryAction(product)}</div>
      </div>`;
  };

  const mainCard = (product, rank) => {
    const save = discount(product);
    return `
      <article class="card">
        <a class="image-wrap" href="${esc(dealUrl(product))}" ${trackingAttributes(product, "daily_card_media")}><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy" decoding="async"></a>
        <div class="card-content">
          <div class="card-top"><span class="rank">#${rank}</span>${badgeFor(product) ? `<span class="badge">${esc(badgeFor(product))}</span>` : ""}</div>
          <p class="cat">${esc(displayCategory(product))} · ${esc(storeName(product))}</p>
          <h3><a href="${esc(dealUrl(product))}" ${trackingAttributes(product, "daily_card_title")}>${esc(fullTitle(product.title))}</a></h3>
          <p class="description editorial-teaser"><strong>${esc(tr("product.why", "Why we picked it:"))}</strong> ${esc(whyPicked(product))}</p>
          ${scoreMetrics(product)}
          <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${esc(tr("product.belowReferencePercent", "{percent}% BELOW REF.", { percent: save }))}</span>` : ""}</div>
          <p class="verification">${esc(statusText(product))}</p>
          ${offerFacts(product)}
          <div class="card-actions">${actionButton(product, "button", "daily_card_cta")}${priceHistoryAction(product)}</div>
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
    const visible = visibleProducts("");
    els.dealsTitle.textContent = activeCategory === "More Worth Seeing" ? tr("nav.more", "9 More Worth Seeing") : displayCategory({ category: activeCategory });
    els.resultCount.textContent = activeCategory === "More Worth Seeing"
      ? ""
      : tr("search.products", "{count} products", { count: visible.length });
    els.emptyState.hidden = visible.length !== 0;
    els.emptyState.textContent = products.length
      ? tr("home.noMatch", "No products match that search.")
      : tr("home.catalogSectionEmpty", "Verified selections will appear here as they are published.");
    const rankOffset = activeCategory === "More Worth Seeing" ? 2 : 1;
    els.products.innerHTML = visible.map((product, index) => mainCard(product, index + rankOffset)).join("");
  };

  const renderCollections = () => {
    const emptyCollection = message => `<div class="empty-state catalog-section-empty">${esc(message)}</div>`;
    if (els.archiveProducts && !els.archiveProducts.children.length) {
      els.archiveProducts.innerHTML = emptyCollection(tr("home.catalogArchiveEmpty", "The archive will begin with the first real Daily Drop."));
    }
  };

  const renderCategoryMenu = () => {
    const categories = [...new Set(products.map(product => product.category).filter(Boolean))];
    const categoryUrl = category => marketPath(`/category/${category.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
    els.categoryMenu.innerHTML = [`<a href="#top-picks">${esc(tr("nav.topTen", "Today's Top 10"))}</a>`, ...categories.map(category => `<a href="${esc(categoryUrl(category))}">${esc(displayCategory(products.find(product => product.category === category) || { category }))}</a>`)].join("");
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
      closeSearchSuggestions();
    }
  });

  const header = document.querySelector(".site-header");
  const updateAnchorOffset = () => {
    if (!header) return;
    const headerBottom = Math.max(0, header.getBoundingClientRect().bottom);
    document.documentElement.style.setProperty("--odd-header-offset", `${Math.ceil(headerBottom + 18)}px`);
  };
  const scrollToAnchor = (hash, updateHistory = true) => {
    if (!hash || hash === "#") return false;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return false;
    updateAnchorOffset();
    const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const targetTop = target.id === "today" || target.id === "shopping-search"
      ? 0
      : Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerBottom - 18);
    window.scrollTo({ top: targetTop, behavior: "smooth" });
    if (updateHistory && window.location.hash !== hash) {
      history.pushState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
    return true;
  };

  updateAnchorOffset();
  if (header && "ResizeObserver" in window) new ResizeObserver(updateAnchorOffset).observe(header);
  window.addEventListener("resize", updateAnchorOffset, { passive: true });
  window.addEventListener("load", () => {
    updateAnchorOffset();
    if (window.location.hash) requestAnimationFrame(() => scrollToAnchor(window.location.hash, false));
  });
  window.addEventListener("popstate", () => {
    if (window.location.hash) scrollToAnchor(window.location.hash, false);
  });
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;
    const menuWasOpen = mobileMenuQuery.matches && els.mobileMenuToggle?.getAttribute("aria-expanded") === "true";
    event.preventDefault();
    closeSearchSuggestions();
    if (menuWasOpen) closeMobileMenu();
    window.setTimeout(() => scrollToAnchor(hash), menuWasOpen ? 360 : 0);
  });

  els.searchInput.addEventListener("input", () => {
    activeCategory = "More Worth Seeing";
    renderSearchSuggestions();
  });
  els.searchInput.addEventListener("focus", renderSearchSuggestions);
  els.searchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    els.searchClear.hidden = true;
    closeSearchSuggestions();
    els.searchInput.focus();
  });
  if (els.searchForm) {
    els.searchForm.addEventListener("submit", event => {
      event.preventDefault();
      const query = els.searchInput.value.trim();
      if (!query) {
        closeSearchSuggestions();
        els.searchInput.focus();
        return;
      }
      window.location.assign(`${marketPath("/search")}?q=${encodeURIComponent(query)}`);
    });
  }
  document.addEventListener("click", event => {
    if (!event.target.closest(".header-search")) closeSearchSuggestions();
  });
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
        $("subscribeStatus").textContent = tr("home.noSpam", "Email alerts are being prepared.");
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

  // The complete verified catalog remains searchable server-side and through
  // Delia. The homepage only needs a representative working set; downloading
  // several thousand full product records blocks mobile rendering.
  fetch(`/api/products?market=${encodeURIComponent(marketCode)}&limit=200&compact=1`, { headers: { Accept: "application/json" } })
    .then(async response => {
      if (!response.ok) throw new Error(`Products API returned HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      const received = (Array.isArray(data) ? data : []).filter(product => product && product.title);
      const daily = received.filter(product => Number.isFinite(Number(product.daily_rank)))
        .sort((a, b) => (scoreValue(b) || 0) - (scoreValue(a) || 0));
      const catalog = received.filter(product => !Number.isFinite(Number(product.daily_rank)))
        .sort((a, b) => (scoreValue(b) || 0) - (scoreValue(a) || 0));
      products = [...daily, ...catalog];
      els.updated.textContent = products[0] ? statusText(products[0]) : tr("home.preparing", "Today's selection is being prepared");
      renderFeatured();
      renderCategoryMenu();
      renderMain();
      renderCollections();
      if (els.searchInput.value.trim()) renderSearchSuggestions();
    })
    .catch(error => {
      console.error("OneDailyDrop load error:", error);
      els.updated.textContent = tr("load.failed", "Could not load today's selections");
    });
})();

(() => {
  const warmed = new Set();
  const warm = anchor => {
    if (!anchor || warmed.size >= 3) return;
    let url;
    try { url = new URL(anchor.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || !/^\/(?:us|ca|uk|fr|de)\/deal\//.test(url.pathname) || warmed.has(url.href)) return;
    warmed.add(url.href);
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.as = "document";
    hint.href = url.href;
    document.head.appendChild(hint);
  };
  document.addEventListener("pointerover", event => warm(event.target.closest("a[href*='/deal/']")), {passive:true});
})();
