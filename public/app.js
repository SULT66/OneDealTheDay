const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v,c="USD")=>v==null?"See current price":new Intl.NumberFormat("en-US",{style:"currency",currency:c}).format(v);

let allProducts=[];
let activeCategory="All";

const renderFeatured=()=>{
  const p=allProducts[0];
  if(!p){
    featuredDeal.innerHTML='<div class="featured-body">No featured deal is available yet.</div>';
    return;
  }
  featuredDeal.innerHTML=`
    <div class="featured-media">
      <img src="${esc(p.image_url)}" alt="${esc(p.title)}">
      <span class="featured-ribbon">DEAL OF THE DAY</span>
    </div>
    <div class="featured-body">
      <p class="cat">${esc(p.category)}</p>
      <h2>${esc(p.title)}</h2>
      <p class="description">${esc(p.description)}</p>
      <p class="stats">★ ${esc(p.rating)} · ${Number(p.review_count||0).toLocaleString()} reviews · Score ${esc(p.score)}</p>
      <div class="featured-price-row">
        <span class="featured-price">${money(p.current_price,p.currency)}</span>
        ${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}
      </div>
      <a class="featured-button" href="/go/${encodeURIComponent(p.id)}" rel="nofollow sponsored">View today’s deal</a>
    </div>`;
};

const render=()=>{
  const q=searchInput.value.trim().toLowerCase();
  const filtered=allProducts.filter(p=>{
    const categoryMatch=activeCategory==="All"||p.category===activeCategory;
    const text=`${p.title} ${p.description} ${p.category}`.toLowerCase();
    return categoryMatch&&(!q||text.includes(q));
  });

  resultCount.textContent=`Showing ${filtered.length} of ${allProducts.length} products`;
  emptyState.hidden=filtered.length!==0;
  products.innerHTML=filtered.map((p)=>{
    const rank=allProducts.indexOf(p)+1;
    return `<article class="card">
      <div class="image-wrap"><img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="card-content">
        <div class="card-top"><span class="rank">#${rank}</span>${p.badge?`<span class="badge">${esc(p.badge)}</span>`:""}</div>
        <p class="cat">${esc(p.category)}</p>
        <h3>${esc(p.title)}</h3>
        <p class="description">${esc(p.description)}</p>
        <p class="stats">★ ${esc(p.rating)} · ${Number(p.review_count||0).toLocaleString()} reviews · Score ${esc(p.score)}</p>
        <span class="price">${money(p.current_price,p.currency)}</span>${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}
        <a class="button" href="/go/${encodeURIComponent(p.id)}" rel="nofollow sponsored">View current offer</a>
      </div>
    </article>`;
  }).join("");
};

const renderFilters=()=>{
  const categories=["All",...new Set(allProducts.map(p=>p.category).filter(Boolean))];
  categoryFilters.innerHTML=categories.map(category=>`<button class="filter${category===activeCategory?" active":""}" type="button" data-category="${esc(category)}">${esc(category)}</button>`).join("");
  categoryFilters.querySelectorAll(".filter").forEach(button=>button.addEventListener("click",()=>{
    activeCategory=button.dataset.category;
    renderFilters();
    render();
  }));
};

searchInput.addEventListener("input",render);

themeToggle.addEventListener("click",()=>{
  document.body.classList.toggle("dark");
  localStorage.setItem("theme",document.body.classList.contains("dark")?"dark":"light");
});
if(localStorage.getItem("theme")==="dark"||(!localStorage.getItem("theme")&&matchMedia("(prefers-color-scheme: dark)").matches))document.body.classList.add("dark");

fetch("/api/products")
  .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()})
  .then(ps=>{
    allProducts=Array.isArray(ps)?ps.slice(0,10):[];
    if(allProducts[0]?.updated_at)updated.textContent=`Updated ${new Date(allProducts[0].updated_at).toLocaleString()}`;
    else updated.textContent="Today’s selection is ready";
    renderFeatured();
    renderFilters();
    render();
  })
  .catch(error=>{
    updated.textContent="Could not load the latest update";
    featuredDeal.innerHTML='<div class="featured-body">Unable to load today’s featured deal.</div>';
    products.innerHTML='<div class="empty-state">Unable to load products. Please refresh the page.</div>';
    console.error(error);
  });