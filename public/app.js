(() => {
  const $ = id => document.getElementById(id);
  const primaryNav = document.querySelector(".main-nav");
  if (primaryNav && !primaryNav.querySelector('[href="/club"]')) {
    const clubLink = document.createElement("a");
    clubLink.href = "/club";
    clubLink.textContent = "Club $2.99";
    clubLink.className = "club-nav-link";
    primaryNav.appendChild(clubLink);
    const accountMount = document.createElement("span");
    accountMount.dataset.accountNav = "";
    primaryNav.appendChild(accountMount);
    const authScript = document.createElement("script");
    authScript.src = "/auth-ui.js?v=20260723";
    document.body.appendChild(authScript);
  }
  const els = {
    searchInput: $("searchInput"),
    searchForm: $("searchForm"),
    searchClear: $("searchClear"),
    themeToggle: $("themeToggle"),
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
    if (value == null || value === "") return "Check price";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Check price";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };
  const discount = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0
    ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100)
    : 0;
  const storeName = product => {
    if (isDemo(product)) return "OneDailyDrop";
    const source = String(product.source || "").toLowerCase();
    if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
    if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
    return product.source ? String(product.source) : "Retailer";
  };
  const badgeFor = product => {
    if (isDemo(product)) return "DAILY PICK";
    if (discount(product) >= 25) return "VERIFIED DEAL";
    if (Number(product.score) >= 90) return "EDITOR'S PICK";
    if (Number(product.review_count) >= 5000) return "TRENDING";
    return "POPULAR PICK";
  };
  const statusText = product => isDemo(product)
    ? "Retailer availability coming soon"
    : product.updated_at
      ? `Price verified ${new Date(product.updated_at).toLocaleString()}`
      : "Price recently verified";
  const priceLabel = product => isDemo(product) ? "Retailer price" : "Current price";
  const whyPicked = product => {
    if (isDemo(product)) return "Selected for its practical value and relevance to everyday shoppers.";
    const reasons = [];
    if (Number(product.rating) >= 4.5) reasons.push(`${Number(product.rating).toFixed(1)}-star rating`);
    if (Number(product.review_count) >= 1000) reasons.push(`${Number(product.review_count).toLocaleString()} reviews`);
    if (Number(product.score) >= 80) reasons.push(`${Math.round(Number(product.score))}/100 OneDailyDrop score`);
    if (discount(product)) reasons.push(`${discount(product)}% verified discount`);
    return `Picked for its ${reasons.join(", ") || "price, shopper feedback and overall value"}.`;
  };
  const dealUrl = product => product.deal_url || `/deal/${encodeURIComponent(product.id)}`;
  const actionButton = (product, className) => isDemo(product)
    ? `<a class="${className}" href="${esc(dealUrl(product))}">VIEW DETAILS</a>`
    : `<a class="${className}" href="/go/${encodeURIComponent(product.id)}" rel="nofollow sponsored">SEE DEAL ON ${esc(storeName(product))}</a>`;

  let products = [];
  let activeCategory = "Top 10";

  const renderFeatured = () => {
    const product = products[0];
    if (!product) {
      els.featuredDeal.innerHTML = '<div class="featured-body"><h2>No featured drop is available yet.</h2></div>';
      return;
    }
    const save = discount(product);
    els.featuredDeal.innerHTML = `
      <div class="featured-media">
        <a href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}"></a>
        <span class="featured-ribbon">TODAY'S DROP</span><span class="featured-badge">${esc(badgeFor(product))}</span>
      </div>
      <div class="featured-body">
        <p class="cat">${esc(product.category || "Deals")} · ${esc(storeName(product))}</p>
        <h2><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h2>
        <p class="description">${esc(whyPicked(product))}</p>
        <p class="stats">★ ${esc(product.rating || "—")} · ${Number(product.review_count || 0).toLocaleString()} reviews</p>
        <div class="score-strip"><strong>${Math.round(Number(product.score) || 0)}/100</strong><span>OneDailyDrop Score</span></div>
        <div class="featured-price-row"><span class="price-label">${priceLabel(product)}</span><span class="featured-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">SAVE ${save}%</span>` : ""}</div>
        <p class="verification">${esc(statusText(product))}</p>
        <div class="card-actions">${actionButton(product, "featured-button")}</div>
      </div>`;
  };

  const mainCard = (product, rank) => {
    const save = discount(product);
    return `
      <article class="card">
        <a class="image-wrap" href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
        <div class="card-content">
          <div class="card-top"><span class="rank">#${rank}</span><span class="badge">${esc(badgeFor(product))}</span></div>
          <p class="cat">${esc(product.category || "Deals")} · ${esc(storeName(product))}</p>
          <h3><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h3>
          <p class="description"><strong>Why we picked it:</strong> ${esc(whyPicked(product))}</p>
          <p class="stats">★ ${esc(product.rating || "—")} · ${Number(product.review_count || 0).toLocaleString()} reviews · Score ${Math.round(Number(product.score) || 0)}/100</p>
          <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">SAVE ${save}%</span>` : ""}</div>
          <p class="verification">${esc(statusText(product))}</p>
          <div class="card-actions">${actionButton(product, "button")}</div>
        </div>
      </article>`;
  };

  const miniCard = product => {
    const save = discount(product);
    return `
      <article class="mini-card">
        <a href="${esc(dealUrl(product))}"><img src="${esc(product.image_url)}" alt="${esc(fullTitle(product.title))}" loading="lazy"></a>
        <div class="mini-card-body">
          <p class="cat">${esc(product.category || "Deals")} · ${esc(storeName(product))}</p>
          <h3><a href="${esc(dealUrl(product))}">${esc(fullTitle(product.title))}</a></h3>
          <p class="mini-meta">★ ${esc(product.rating || "—")} · Score ${Math.round(Number(product.score) || 0)}/100${save ? ` · ${save}% off` : ""}</p>
          <div class="mini-price-row"><span class="mini-price-label">${priceLabel(product)}</span><span class="mini-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}</div>
          <a class="mini-action" href="${esc(dealUrl(product))}">VIEW DETAILS</a>
        </div>
      </article>`;
  };

  const visibleProducts = query => {
    if (query) {
      return products.filter(product => `${product.title} ${cleanText(product.description)} ${product.category || ""}`.toLowerCase().includes(query));
    }
    if (activeCategory === "Top 10") return products.slice(0, 10);
    return products.filter(product => product.category === activeCategory);
  };

  const renderMain = () => {
    const query = els.searchInput.value.trim().toLowerCase();
    const visible = visibleProducts(query);
    els.dealsTitle.textContent = query ? "Search results" : activeCategory === "Top 10" ? "Top 10 Drops Today" : activeCategory;
    els.resultCount.textContent = query ? `Found ${visible.length} products` : activeCategory === "Top 10" ? `Showing 10 of ${products.length} products` : `Showing ${visible.length} products`;
    els.emptyState.hidden = visible.length !== 0;
    els.products.innerHTML = visible.map(product => mainCard(product, products.indexOf(product) + 1)).join("");
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
    const categoryUrl = category => `/category/${category.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    els.categoryMenu.innerHTML = [`<a href="#top">Top 10 Drops</a>`, ...categories.map(category => `<a href="${esc(categoryUrl(category))}">${esc(category)}</a>`)].join("");
  };

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has("country")) {
    currentUrl.searchParams.delete("country");
    history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
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
      els.categoryMenu.hidden = true;
      els.categoryMenuButton.setAttribute("aria-expanded", "false");
      els.categoryMenuButton.focus();
    }
  });
  els.searchInput.addEventListener("input", () => {
    activeCategory = "Top 10";
    els.searchClear.hidden = !els.searchInput.value;
    renderMain();
    if (els.searchInput.value.trim()) document.querySelector("#top").scrollIntoView({behavior:"smooth"});
  });
  els.searchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    els.searchClear.hidden = true;
    renderMain();
    els.searchInput.focus();
  });
  els.searchForm.addEventListener("submit", event => {
    if (!els.searchInput.value.trim()) event.preventDefault();
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
        status.textContent = "Enter a valid email address.";
        return;
      }
      if (!categories.length) {
        interestFieldset.classList.add("has-error");
        categoryError.hidden = false;
        status.textContent = "Choose at least one category before subscribing.";
        subscribeForm.querySelector('input[name="categories"]').focus();
        return;
      }
      interestFieldset.classList.remove("has-error");
      categoryError.hidden = true;
      button.disabled = true;
      status.textContent = "Saving your preferences…";
      try {
        const response = await fetch("/api/subscribe", {
          method: "POST",
          headers: {"Content-Type": "application/json", Accept: "application/json"},
          body: JSON.stringify({email, categories})
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not subscribe.");
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
        $("subscribeStatus").textContent = "No spam. Unsubscribe anytime.";
      });
    });
  }

  const updateCountdown = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const milliseconds = Math.max(0, next - now);
    const hours = Math.floor(milliseconds / 36e5);
    const minutes = Math.floor(milliseconds % 36e5 / 6e4);
    const seconds = Math.floor(milliseconds % 6e4 / 1e3);
    els.countdown.textContent = `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  };
  setInterval(updateCountdown, 1000);
  updateCountdown();

  fetch("/api/products", { headers: { Accept: "application/json" } })
    .then(async response => {
      if (!response.ok) throw new Error(`Products API returned HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      products = (Array.isArray(data) ? data : []).filter(product => product && product.title).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      els.updated.textContent = products[0] ? statusText(products[0]) : "Today's selection is being prepared";
      renderFeatured();
      renderCategoryMenu();
      renderMain();
      renderCollections();
    })
    .catch(error => {
      console.error("OneDailyDrop load error:", error);
      els.updated.textContent = "Could not load today's selections";
    });
})();
