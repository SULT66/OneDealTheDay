module.exports = function buildHomepageSchema({ SITE, top, dealPath, shortTitle, storeName }) {
  const cleanText = value => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const schemaDescription = product => {
    const supplied = cleanText(product.description);
    if (supplied) return supplied;
    const category = cleanText(product.category) || "online shopping";
    const rating = Number(product.rating);
    const reviews = Number(product.review_count || 0);
    const signals = [];
    if (rating > 0) signals.push(`${rating.toFixed(1)}-star customer rating`);
    if (reviews > 0) signals.push(`${reviews.toLocaleString("en-US")} customer reviews`);
    return signals.length
      ? `A ${category} product selected by OneDailyDrop using price, availability and ${signals.join(" with ")}.`
      : `A ${category} product selected by OneDailyDrop after reviewing price, availability and overall value.`;
  };

  const productNodes = top.map(product => {
    const price = Number(product.current_price);
    const rating = Number(product.rating);
    const reviewCount = Number(product.review_count || 0);
    const canonical = SITE + dealPath(product);
    return {
      "@type": "Product",
      "@id": `${canonical}#product`,
      url: canonical,
      name: cleanText(product.title),
      image: product.image_url ? [product.image_url] : undefined,
      description: schemaDescription(product),
      brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
      sku: product.product_key || String(product.id),
      gtin: product.gtin || product.ean || product.upc || undefined,
      aggregateRating: rating > 0 && reviewCount > 0 ? {
        "@type": "AggregateRating",
        ratingValue: rating,
        reviewCount
      } : undefined,
      offers: Number.isFinite(price) && price > 0 ? {
        "@type": "Offer",
        url: canonical,
        priceCurrency: String(product.currency || "USD").toUpperCase(),
        price,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: storeName(product) }
      } : undefined
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "OneDailyDrop",
        url: SITE
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "OneDailyDrop",
        publisher: { "@id": `${SITE}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE}/?q={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/#top-drops`,
        name: "Top 10 Drops Today",
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        numberOfItems: top.length,
        itemListElement: top.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: { "@id": `${SITE + dealPath(product)}#product` }
        }))
      },
      ...productNodes
    ]
  };
};