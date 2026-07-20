const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v,c="USD")=>v==null?"See current price":new Intl.NumberFormat("en-US",{style:"currency",currency:c||"USD"}).format(v);
const discount=p=>p.original_price&&p.current_price&&p.original_price>p.current_price?Math.round((1-p.current_price/p.original_price)*100):0;

let allProducts=[];
let productGroups=[];
let activeCategory="All";

const storeName=p=>{
  const source=String(p.source||"").toLowerCase();
  if(source.includes("walmart"))return "Walmart";
  if(source.includes("amazon"))return "Amazon";
  return p.source?String(p.source):"Store";
};

const storeClass=name=>name.toLowerCase()==="amazon"?"amazon":name.toLowerCase()==="walmart"?"walmart":"other";

const normalizedTitle=title=>String(title||"")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/g," ")
  .replace(/\b(new|renewed|refurbished|amazon|walmart)\b/g," ")
  .replace(/\s+/g," ")
  .trim();

const matchKey=p=>{
  const exact=p.product_key||p.gtin||p.upc||p.ean||p.model_number||p.model;
  if(exact)return `id:${String(exact).toLowerCase().replace(/[^a-z0-9]/g,"")}`;
  return `title:${normalizedTitle(p.title)}`;
};

const buildGroups=products=>{
  const groups=new Map();
  products.forEach(p=>{
    const key=matchKey(p);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  });
  return [...groups.entries()].map(([key,offers])=>{
    const sorted=[...offers].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
    const primary=sorted[0];
    const stores=new Set(sorted.map(storeName));
    const comparable=stores.has("Amazon")&&stores.has("Walmart");
    return {key,primary,offers:sorted,comparable};
  }).sort((a,b)=>(Number(b.primary.score)||0)-(Number(a.primary.score)||0));
};

const comparisonButton=group=>group.comparable
  ?`<button class="deal-compare-button" type="button" data-deal-key="${esc(group.key)}">DEAL · Compare prices</button>`
  :"";

const shopLabel=()=>"DEAL";

const renderFeatured=()=>{
  const group=productGroups[0];
  const p=group?.primary;
  if(!p){featuredDeal.innerHTML='<div class="featured-body">No featured deal is available yet.</div>';return;}
  const saving=discount(p);
  featuredDeal.innerHTML=`
    <div class="featured-media">
      <img src="${esc(p.image_url)}" alt="${esc(p.title)}">
      <span class="featured-ribbon">DEAL OF THE DAY</span>
      ${p.badge?`<span class="featured-badge">${esc(p.badge)}</span>`:""}
    </div>
    <div class="featured-body">
      <p class="cat">${esc(p.category)}</p>
      <h2>${esc(p.title)}</h2>
      <p class="description">${esc(p.description)}</p>
      <p class="stats">★ ${esc(p.rating)} · ${Number(p.review_count||0).toLocaleString()} reviews · Score ${esc(p.score)}</p>
      <div class="featured-price-row">
        <span class="featured-price">${money(p.current_price,p.currency)}</span>
        ${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}
        ${saving?`<span class="save-pill">SAVE ${saving}%</span>`:""}
      </div>
      <a class="featured-button" href="/go/${encodeURIComponent(p.id)}" rel="nofollow sponsored">${esc(shopLabel(p))}</a>
      ${comparisonButton(group)}
    </div>`;
};

const render=()=>{
  const q=searchInput.value.trim().toLowerCase();
  const filtered=productGroups.filter(group=>{
    const p=group.primary;
    const categoryMatch=activeCategory==="All"||p.category===activeCategory;
    const text=`${p.title} ${p.description} ${p.category}`.toLowerCase();
    return categoryMatch&&(!q||text.includes(q));
  });

  resultCount.textContent=`Showing ${filtered.length} of ${productGroups.length} products`;
  emptyState.hidden=filtered.length!==0;
  products.innerHTML=filtered.map(group=>{
    const p=group.primary;
    const rank=productGroups.indexOf(group)+1;
    const saving=discount(p);
    return `<article class="card">
      <div class="image-wrap"><img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="card-content">
        <div class="card-top"><span class="rank">#${rank}</span>${p.badge?`<span class="badge">${esc(p.badge)}</span>`:""}</div>
        <p class="cat">${esc(p.category)}</p>
        <h3>${esc(p.title)}</h3>
        <p class="description">${esc(p.description)}</p>
        <p class="stats">★ ${esc(p.rating)} · ${Number(p.review_count||0).toLocaleString()} reviews · Score ${esc(p.score)}</p>
        <span class="price">${money(p.current_price,p.currency)}</span>${p.original_price?`<span class="old">${money(p.original_price,p.currency)}</span>`:""}${saving?`<span class="save-pill">SAVE ${saving}%</span>`:""}
        <a class="button" href="/go/${encodeURIComponent(p.id)}" rel="nofollow sponsored">${esc(shopLabel(p))}</a>
        ${comparisonButton(group)}
      </div>
    </article>`;
  }).join("");
};

const renderFilters=()=>{
  const categories=["All",...new Set(productGroups.map(g=>g.primary.category).filter(Boolean))];
  categoryFilters.innerHTML=categories.map(category=>`<button class="filter${category===activeCategory?" active":""}" type="button" data-category="${esc(category)}">${esc(category)}</button>`).join("");
  categoryFilters.querySelectorAll(".filter").forEach(button=>button.addEventListener("click",()=>{
    activeCategory=button.dataset.category;
    renderFilters();
    render();
  }));
};

const openDealModal=key=>{
  const group=productGroups.find(g=>g.key===key&&g.comparable);
  if(!group)return;
  const offers=group.offers.filter(p=>["Amazon","Walmart"].includes(storeName(p)));
  const priced=offers.filter(p=>Number.isFinite(Number(p.current_price)));
  const lowest=priced.length?Math.min(...priced.map(p=>Number(p.current_price))):null;
  const highest=priced.length?Math.max(...priced.map(p=>Number(p.current_price))):null;
  const best=lowest==null?null:priced.find(p=>Number(p.current_price)===lowest);

  dealModalProduct.textContent=group.primary.title;
  dealModalOffers.innerHTML=offers.map(p=>{
    const name=storeName(p);
    const isBest=lowest!=null&&Number(p.current_price)===lowest;
    return `<div class="offer-row">
      <div>
        <div class="offer-store">${esc(name)}${isBest?'<span class="best-price">BEST PRICE</span>':""}</div>
        <div class="offer-price">${money(p.current_price,p.currency)}</div>
        <div class="offer-meta">Price and availability may change.</div>
      </div>
      <a class="store-button ${storeClass(name)}" href="/go/${encodeURIComponent(p.id)}" rel="nofollow sponsored">Buy on ${esc(name)}</a>
    </div>`;
  }).join("");

  if(best&&highest>lowest){
    dealModalSummary.textContent=`Best price: ${storeName(best)}. Save ${money(highest-lowest,best.currency)} compared with the other store.`;
  }else if(best){
    dealModalSummary.textContent="The price is currently the same at Amazon and Walmart.";
  }else{
    dealModalSummary.textContent="Open either store to see the latest available price.";
  }

  dealModal.hidden=false;
  dealModal.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  dealModal.querySelector(".deal-modal-close").focus();
};

const closeDealModal=()=>{
  dealModal.hidden=true;
  dealModal.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
};

document.addEventListener("click",event=>{
  const trigger=event.target.closest("[data-deal-key]");
  if(trigger)openDealModal(trigger.dataset.dealKey);
  if(event.target.closest("[data-close-deal-modal]"))closeDealModal();
});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!dealModal.hidden)closeDealModal();});

const updateCountdown=()=>{
  const now=new Date();
  const next=new Date(now);
  next.setHours(24,0,0,0);
  const ms=Math.max(0,next-now);
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
  countdown.textContent=`${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
};
setInterval(updateCountdown,1000);updateCountdown();
searchInput.addEventListener("input",render);
themeToggle.addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("theme",document.body.classList.contains("dark")?"dark":"light");});
if(localStorage.getItem("theme")==="dark"||(!localStorage.getItem("theme")&&matchMedia("(prefers-color-scheme: dark)").matches))document.body.classList.add("dark");

fetch("/api/products")
  .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()})
  .then(ps=>{
    allProducts=Array.isArray(ps)?ps:[];
    productGroups=buildGroups(allProducts).slice(0,10);
    if(productGroups[0]?.primary?.updated_at)updated.textContent=`Updated ${new Date(productGroups[0].primary.updated_at).toLocaleString()}`;
    else updated.textContent="Today’s selection is ready";
    renderFeatured();renderFilters();render();
  })
  .catch(error=>{
    updated.textContent="Could not load the latest update";
    featuredDeal.innerHTML='<div class="featured-body">Unable to load today’s featured deal.</div>';
    products.innerHTML='<div class="empty-state">Unable to load products. Please refresh the page.</div>';
    console.error(error);
  });