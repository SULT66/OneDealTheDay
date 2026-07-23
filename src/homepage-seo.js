const db = require("./db");
const renderHomepage = require("./homepage");
const buildHomepageSchema = require("./homepage-schema");

const SITE = "https://www.onedailydrop.com";
const slug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => `/deal/${slug(product.title)}-${product.id}`;
const clean = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shortTitle = value => { const text = clean(value); return text.length <= 78 ? text : `${text.slice(0, 75).trim()}…`; };
const storeName = product => { const source = String(product.source || "").toLowerCase(); if (source.includes("amazon") || source.includes("rainforest")) return "Amazon"; if (source.includes("walmart") || source.includes("bluecart")) return "Walmart"; return product.source || "Retailer"; };

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
      '<script src="/app.js?v=20260721-v2"></script>',
      `<script>(function(){const q=new URLSearchParams(location.search).get('q');if(!q)return;const input=document.getElementById('searchInput');if(input)input.value=q;})();</script><script src="/app.js?v=20260721-v2"></script>`
    );

    return originalSend(enhanced);
  };

  return renderHomepage(req, res);
};
