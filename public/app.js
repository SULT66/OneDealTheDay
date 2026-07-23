(() => {
  const $ = id => document.getElementById(id);
  const els = {
    searchInput: $("searchInput"),
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
    if (isDemo(product)) return "Preview catalog";
    const source = String(product.source || "").toLowerCase();
    if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
    if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
    return product.source ? String(product.source) : "Retailer";
  };
  const badgeFor = product => {
    if (isDemo(product)) return "DEMO PREVIEW";
    if (discount(product) >= 25) return "VERIFIED DEAL";
    if (Number(product.score) >= 90) return "EDITOR'S PICK";
    if (Number(product.review_count) >= 5000) return "TRENDING";
    return "POPULAR PICK";
  };
  const statusText = product => isDemo(product)
    ? "Sample price · Preview data"
    : product.updated_at
      ? `Price verified ${new Date(product.updated_at).toLocaleString()}`
      : "Price recently verified";
  const priceLabel = product => isDemo(product) ? "Sample price" : "Current price";
  const whyPicked = product => {
    const reasons = [];
    if (Number(product.rating) >= 4.5) reasons.push(`${Number(product.rating).toFixed(1)}-star ${isDemo(product) ? "sample " : ""}rating`);
    if (Number(product.review_count) >= 1000) reasons.push(`${Number(product.review_count).toLocaleString()} ${isDemo(product) ? "sample " : ""}reviews`);
    if (Number(product.score) >= 80) reasons.push(`${Math.round(Number(product.score))}/100 ${isDemo(product) ? "preview " : "OneDailyDrop "}score`);
    if (discount(product)) reasons.push(`${discount(product)}% ${isDemo(product) ? "sample savings" : "verified discount"}`);
    return isDemo(product)
      ? `Preview selection based on its ${reasons.join(", ") || "sample shopping signals"}.`
      : `Picked for its ${reasons.join(", ") || "price, shopper feedback and overall value"}.`;
  };
  const dealUrl = product => product.deal_url || `/deal/${encodeURIComponent(product.id)}`;
  const actionButton = (product, className) => isDemo(product)
    ? `<a class="${className}" href="${esc(dealUrl(product))}">VIEW PRODUCT PREVIEW</a>`
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
        <p class="stats">★ ${esc(product.rating || "—")} · ${Number(product.review_count || 0).toLocaleString()} ${isDemo(product) ? "sample reviews" : "reviews"}</p>
        <div class="score-strip"><strong>${Math.round(Number(product.score) || 0)}/100</strong><span>${isDemo(product) ? "Preview score" : "OneDailyDrop Score"}</span></div>
        <div class="featured-price-row"><span class="price-label">${priceLabel(product)}</span><span class="featured-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${isDemo(product) ? "SAMPLE " : "SAVE "}${save}%</span>` : ""}</div>
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
          <p class="stats">★ ${esc(product.rating || "—")} · ${Number(product.review_count || 0).toLocaleString()} ${isDemo(product) ? "sample reviews" : "reviews"} · Score ${Math.round(Number(product.score) || 0)}/100</p>
          <div class="price-row"><span class="price-label">${priceLabel(product)}</span><span class="price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}${save ? `<span class="save-pill">${isDemo(product) ? "SAMPLE " : "SAVE "}${save}%</span>` : ""}</div>
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
          <p class="mini-meta">★ ${esc(product.rating || "—")} · Preview score ${Math.round(Number(product.score) || 0)}/100${save ? ` · Sample ${save}% off` : ""}</p>
          <div class="mini-price-row"><span class="mini-price-label">${priceLabel(product)}</span><span class="mini-price">${money(product.current_price, product.currency)}</span>${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}</div>
          <a class="mini-action" href="${esc(dealUrl(product))}">VIEW PRODUCT PREVIEW</a>
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
    els.dealsTitle.textContent = query ? "Search results" : activeCategory === "Top 10" ? "Top 10 Drops Today" : `${activeCategory} Preview`;
    els.resultCount.textContent = query ? `Found ${visible.length} products` : activeCategory === "Top 10" ? `Showing 10 of ${products.length} preview products` : `Showing ${visible.length} products`;
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
    els.categoryMenu.innerHTML = [`<button data-category="Top 10">Top 10 Drops</button>`, ...categories.map(category => `<button data-category="${esc(category)}">${esc(category)}</button>`)].join("");
    els.categoryMenu.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      els.searchInput.value = "";
      els.categoryMenu.hidden = true;
      els.categoryMenuButton.setAttribute("aria-expanded", "false");
      renderMain();
      document.querySelector("#top").scrollIntoView({ behavior: "smooth" });
    }));
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
  els.searchInput.addEventListener("input", () => {
    activeCategory = "Top 10";
    renderMain();
  });
  els.themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  if (localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.body.classList.add("dark");
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
      els.updated.textContent = "Could not load the preview catalog";
    });
})();
