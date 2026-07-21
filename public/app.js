const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const cleanText = value => {
  const html = String(value ?? "");
  const element = document.createElement("div");
  element.innerHTML = html;
  return (element.textContent || element.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
};

const money = (value, currency = "USD") => value == null
  ? "Check price"
  : new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);

const discount = product => product.original_price && product.current_price && product.original_price > product.current_price
  ? Math.round((1 - product.current_price / product.original_price) * 100)
  : 0;

let allProducts = [];
let productGroups = [];
let activeCategory = "Top 10";

const storeName = product => {
  const source = String(product.source || "").toLowerCase();
  if (source.includes("walmart") || source.includes("bluecart")) return "Walmart";
  if (source.includes("amazon") || source.includes("rainforest")) return "Amazon";
  return product.source ? String(product.source) : "Store";
};

const storeClass = name => name.toLowerCase() === "amazon"
  ? "amazon"
  : name.toLowerCase() === "walmart"
    ? "walmart"
    : "other";

const normalizedTitle = title => String(title || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(newest|new|renewed|refurbished|amazon|walmart|exclusive|pack|count)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const titleTokens = title => new Set(normalizedTitle(title)
  .split(" ")
  .filter(token => token.length > 2));

const similarity = (left, right) => {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
};

const exactMatchKey = product => {
  const exact = product.product_key || product.gtin || product.upc || product.ean || product.model_number || product.model;
  return exact ? String(exact).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
};

const buildGroups = products => {
  const groups = [];
  const sorted = [...products].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  for (const product of sorted) {
    const store = storeName(product);
    const exact = exactMatchKey(product);

    let group = groups.find(candidate => {
      if (candidate.offers.some(offer => storeName(offer) === store)) return false;
      const candidateExact = candidate.offers.map(exactMatchKey).find(Boolean);
      if (exact && candidateExact && exact === candidateExact) return true;
      return similarity(product.title, candidate.primary.title) >= 0.72;
    });

    if (!group) {
      group = { key: `group-${groups.length}`, primary: product, offers: [], comparable: false };
      groups.push(group);
    }

    group.offers.push(product);
    group.offers.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    group.primary = group.offers[0];
    const stores = new Set(group.offers.map(storeName));
    group.comparable = stores.has("Amazon") && stores.has("Walmart");
  }

  return groups.sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    return (Number(b.primary.score) || 0) - (Number(a.primary.score) || 0);
  });
};

const actionButton = (group, product, className) => group.comparable
  ? `<button class="${className} deal-action" type="button" data-deal-key="${esc(group.key)}">COMPARE PRICES</button>`
  : `<a class="${className}" href="/go/${encodeURIComponent(product.id)}" rel="nofollow sponsored">VIEW DEAL</a>`;

const renderFeatured = () => {
  const group = productGroups[0];
  const product = group?.primary;
  if (!product) {
    featuredDeal.innerHTML = '<div class="featured-body">No featured deal is available yet.</div>';
    return;
  }

  const saving = discount(product);
  featuredDeal.innerHTML = `
    <div class="featured-media">
      <img src="${esc(product.image_url)}" alt="${esc(product.title)}">
      <span class="featured-ribbon">DEAL OF THE DAY</span>
      ${product.badge ? `<span class="featured-badge">${esc(product.badge)}</span>` : ""}
    </div>
    <div class="featured-body">
      <p class="cat">${esc(product.category)} · ${esc(storeName(product))}</p>
      <h2>${esc(product.title)}</h2>
      <p class="description">${esc(cleanText(product.description))}</p>
      <p class="stats">★ ${esc(product.rating)} · ${Number(product.review_count || 0).toLocaleString()} reviews · Score ${esc(product.score)}</p>
      <div class="featured-price-row">
        <span class="featured-price">${money(product.current_price, product.currency)}</span>
        ${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}
        ${saving ? `<span class="save-pill">SAVE ${saving}%</span>` : ""}
      </div>
      ${actionButton(group, product, "featured-button")}
    </div>`;
};

const groupsForView = query => {
  if (query) {
    return productGroups.filter(group => {
      const product = group.primary;
      const text = `${product.title} ${cleanText(product.description)} ${product.category} ${storeName(product)}`.toLowerCase();
      return text.includes(query);
    });
  }

  if (activeCategory === "Top 10") return productGroups.slice(0, 10);
  return productGroups.filter(group => group.primary.category === activeCategory);
};

const render = () => {
  const query = searchInput.value.trim().toLowerCase();
  const visible = groupsForView(query);

  const heading = document.getElementById("dealsTitle");
  if (heading) heading.textContent = query ? "Search results" : activeCategory === "Top 10" ? "Today’s Top 10" : activeCategory;

  resultCount.textContent = query
    ? `Found ${visible.length} products`
    : activeCategory === "Top 10"
      ? `Showing the 10 best products of ${productGroups.length}`
      : `Showing ${visible.length} products in ${activeCategory}`;

  emptyState.hidden = visible.length !== 0;
  products.innerHTML = visible.map(group => {
    const product = group.primary;
    const rank = productGroups.indexOf(group) + 1;
    const saving = discount(product);

    return `<article class="card">
      <div class="image-wrap"><img src="${esc(product.image_url)}" alt="${esc(product.title)}" loading="lazy"></div>
      <div class="card-content">
        <div class="card-top"><span class="rank">#${rank}</span>${product.badge ? `<span class="badge">${esc(product.badge)}</span>` : ""}</div>
        <p class="cat">${esc(product.category)} · ${esc(storeName(product))}</p>
        <h3>${esc(product.title)}</h3>
        <p class="description">${esc(cleanText(product.description))}</p>
        <p class="stats">★ ${esc(product.rating)} · ${Number(product.review_count || 0).toLocaleString()} reviews · Score ${esc(product.score)}</p>
        <span class="price">${money(product.current_price, product.currency)}</span>
        ${product.original_price ? `<span class="old">${money(product.original_price, product.currency)}</span>` : ""}
        ${saving ? `<span class="save-pill">SAVE ${saving}%</span>` : ""}
        ${actionButton(group, product, "button")}
      </div>
    </article>`;
  }).join("");
};

const renderFilters = () => {
  const categories = ["Top 10", ...new Set(productGroups.map(group => group.primary.category).filter(Boolean))];
  categoryFilters.innerHTML = categories.map(category => {
    const count = category === "Top 10" ? 10 : productGroups.filter(group => group.primary.category === category).length;
    return `<button class="filter${category === activeCategory ? " active" : ""}" type="button" data-category="${esc(category)}">${esc(category)} <span>${count}</span></button>`;
  }).join("");

  categoryFilters.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    searchInput.value = "";
    renderFilters();
    render();
  }));
};

const openDealModal = key => {
  const group = productGroups.find(candidate => candidate.key === key && candidate.comparable);
  if (!group) return;

  const offers = group.offers.filter(product => ["Amazon", "Walmart"].includes(storeName(product)));
  const priced = offers.filter(product => Number.isFinite(Number(product.current_price)));
  const lowest = priced.length ? Math.min(...priced.map(product => Number(product.current_price))) : null;
  const highest = priced.length ? Math.max(...priced.map(product => Number(product.current_price))) : null;
  const best = lowest == null ? null : priced.find(product => Number(product.current_price) === lowest);

  dealModalProduct.textContent = group.primary.title;
  dealModalOffers.innerHTML = offers.map(product => {
    const name = storeName(product);
    const isBest = lowest != null && Number(product.current_price) === lowest;
    return `<div class="offer-row">
      <div>
        <div class="offer-store">${esc(name)}${isBest ? '<span class="best-price">BEST PRICE</span>' : ""}</div>
        <div class="offer-price">${money(product.current_price, product.currency)}</div>
        <div class="offer-meta">Price and availability may change.</div>
      </div>
      <a class="store-button ${storeClass(name)}" href="/go/${encodeURIComponent(product.id)}" rel="nofollow sponsored">Buy on ${esc(name)}</a>
    </div>`;
  }).join("");

  if (best && highest > lowest) {
    dealModalSummary.textContent = `Best price: ${storeName(best)}. Save ${money(highest - lowest, best.currency)} compared with the other store.`;
  } else if (best) {
    dealModalSummary.textContent = "The price is currently the same at Amazon and Walmart.";
  } else {
    dealModalSummary.textContent = "Open either store to see the latest available price.";
  }

  dealModal.hidden = false;
  dealModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  dealModal.querySelector(".deal-modal-close").focus();
};

const closeDealModal = () => {
  dealModal.hidden = true;
  dealModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

document.addEventListener("click", event => {
  const trigger = event.target.closest("[data-deal-key]");
  if (trigger) openDealModal(trigger.dataset.dealKey);
  if (event.target.closest("[data-close-deal-modal]")) closeDealModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !dealModal.hidden) closeDealModal();
});

const updateCountdown = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const milliseconds = Math.max(0, next - now);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  countdown.textContent = `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
};

setInterval(updateCountdown, 1000);
updateCountdown();
searchInput.addEventListener("input", render);
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.body.classList.add("dark");
}

fetch("/api/products")
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(productsResponse => {
    allProducts = Array.isArray(productsResponse) ? productsResponse : [];
    productGroups = buildGroups(allProducts);
    if (productGroups[0]?.primary?.updated_at) updated.textContent = `Updated ${new Date(productGroups[0].primary.updated_at).toLocaleString()}`;
    else updated.textContent = "Today’s selection is ready";
    renderFeatured();
    renderFilters();
    render();
  })
  .catch(error => {
    updated.textContent = "Could not load the latest update";
    featuredDeal.innerHTML = '<div class="featured-body">Unable to load today’s featured deal.</div>';
    products.innerHTML = '<div class="empty-state">Unable to load products. Please refresh the page.</div>';
    console.error(error);
  });