const decodeDescription = value => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(value || ""), "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
};

const cleanRenderedProducts = root => {
  root.querySelectorAll(".description").forEach(node => {
    const cleaned = decodeDescription(node.textContent);
    if (cleaned && cleaned !== node.textContent) node.textContent = cleaned;
  });

  root.querySelectorAll(".price, .featured-price, .offer-price").forEach(node => {
    if (node.textContent.trim() === "See current price") node.textContent = "Check price";
  });
};

const observer = new MutationObserver(() => cleanRenderedProducts(document));
observer.observe(document.documentElement, { childList: true, subtree: true });
cleanRenderedProducts(document);
