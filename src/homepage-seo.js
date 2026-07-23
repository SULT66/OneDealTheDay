const db = require("./db");
const renderHomepage = require("./homepage");
const buildHomepageSchema = require("./homepage-schema");

const SITE = "https://www.onedailydrop.com";
const slug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => `/deal/${slug(product.title)}-${product.id}`;
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const discount = product => Number(product.original_price) > Number(product.current_price) && Number(product.current_price) > 0 ? Math.round((1 - Number(product.current_price) / Number(product.original_price)) * 100) : 0;
const oldWhyPicked = product => { const reasons = []; if (Number(product.rating) >= 4.5) reasons.push(`${Number(product.rating).toFixed(1)}-star rating`); if (Number(product.review_count) >= 1000) reasons.push(`${Number(product.review_count).toLocaleString()}+ reviews`); if (Number(product.score) >= 80) reasons.push(`score ${Math.round(Number(product.score))}/100`); if (discount(product)) reasons.push(`${discount(product)}% verified discount`); return reasons.length ? `Picked for its ${reasons.join(", ")}.` : "Picked for its price, shopper feedback and overall value."; };
const editorialWhyPicked = product => {
  const title = clean(product.title) || "This product";
  const category = clean(product.category) || "its category";
  const retailer = clean(storeName(product));
  const rating = Number(product.rating || 0);
  const reviews = Number(product.review_count || 0);
  const score = Math.round(Number(product.score || 0));
  const savings = discount(product);
  const evidence = [];
  if (rating > 0) evidence.push(`${rating.toFixed(1)}-star customer rating`);
  if (reviews > 0) evidence.push(`${reviews.toLocaleString("en-US")} customer reviews`);
  if (score > 0) evidence.push(`${score}/100 OneDailyDrop Score`);
  const first = `${title} stands out among today’s ${category} offers${retailer ? ` from ${retailer}` : ""}.`;
  const second = evidence.length ? `We selected it based on its ${evidence.join(", ")}${savings ? ` and a verified ${savings}% price reduction` : ""}.` : "We selected it after comparing current price, product relevance and available shopper feedback.";
  return `${first} ${second}`;
};

const countrySelector = `<label class="country-selector" aria-label="Select your country"><span>🌍</span><select id="countrySelector"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="DE">Germany</option><option value="FR">France</option><option value="ES">Spain</option><option value="IT">Italy</option><option value="NL">Netherlands</option><option value="PL">Poland</option><option value="SE">Sweden</option><option value="AU">Australia</option><option value="NZ">New Zealand</option><option value="JP">Japan</option><option value="KR">South Korea</option><option value="SG">Singapore</option><option value="IN">India</option><option value="AE">United Arab Emirates</option><option value="BR">Brazil</option><option value="MX">Mexico</option><option value="AR">Argentina</option><option value="ZA">South Africa</option><option value="TR">Türkiye</option></select></label>`;

const countryScript = `<script>(function(){const select=document.getElementById('countrySelector');if(!select)return;const supported=new Set(Array.from(select.options).map(o=>o.value));const saved=localStorage.getItem('odd-country');const browser=(navigator.language||'en-US').split('-')[1];const initial=supported.has(saved)?saved:(supported.has(browser)?browser:'US');select.value=initial;document.documentElement.dataset.country=initial;select.addEventListener('change',function(){localStorage.setItem('odd-country',this.value);document.documentElement.dataset.country=this.value;const url=new URL(location.href);url.searchParams.set('country',this.value);history.replaceState({},'',url);window.dispatchEvent(new CustomEvent('odd:countrychange',{detail:{country:this.value}}));});const q=new URLSearchParams(location.search).get('q');if(q){const input=document.getElementById('searchInput');if(input)input.value=q;}})();</script>`;

module.exports = function homepageSeo(req, res) {
  const originalSend = res.send.bind(res);

  res.send = body => {
    if (typeof body !== "string" || !body.includes("application/ld+json")) return originalSend(body);

    const top = db.prepare("SELECT * FROM products WHERE status='published' ORDER BY score DESC, updated_at DESC LIMIT 10").all();
    const schema = buildHomepageSchema({ SITE, top, dealPath, shortTitle, storeName });
    const json = JSON.stringify(schema).replace(/</g, "\\u003c");

    let enhanced = body.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${json}</script>`
    );

    enhanced = enhanced.replace(
      '<link rel="canonical" href="https://www.onedailydrop.com/">',
      '<link rel="canonical" href="https://www.onedailydrop.com/"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:site_name" content="OneDailyDrop">'
    );

    enhanced = enhanced.replace(
      '<label class="header-search">',
      `${countrySelector}<label class="header-search">`
    );

    enhanced = enhanced.replace(
      '</head>',
      '<style>.country-selector{display:flex;align-items:center;gap:.45rem;border:1px solid rgba(127,127,127,.28);border-radius:999px;padding:.55rem .8rem;background:var(--surface,#fff);min-width:170px}.country-selector select{border:0;background:transparent;color:inherit;font:inherit;max-width:145px;outline:none;cursor:pointer}@media(max-width:800px){.country-selector{min-width:auto}.country-selector select{max-width:115px}}</style></head>'
    );

    for (const product of top) {
      enhanced = enhanced.split(esc(oldWhyPicked(product))).join(esc(editorialWhyPicked(product)));
    }

    enhanced = enhanced.replace(
      '<script src="/app.js?v=20260721-v2"></script>',
      `${countryScript}<script src="/app.js?v=20260721-v2"></script>`
    );

    return originalSend(enhanced);
  };

  return renderHomepage(req, res);
};