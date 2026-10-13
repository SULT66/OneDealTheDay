/* Editorial copy is dated by an actual revision, never by a page request. */
const GUIDE_MARKETS = ["us", "ca", "uk"];
const EDITORIAL_DATE = "2026-10-13";
const guides = [
  {
    slug: "real-vs-fake-discounts", title: "How to tell a real discount from a fake one",
    description: "Check the exact model, observed prices, delivery costs and seller terms before trusting a sale percentage.",
    query: "", category: "",
    sections: [
      ["Is this deal actually a discount?", "A real discount needs a meaningful comparison for the same product and buying terms. A crossed-out list price alone does not prove that anyone previously paid it. Compare the exact model and condition, include delivery, and look for dated price observations before calling the offer a saving."],
      ["Three different numbers", "The current price is what the retailer reports now. A reference price is the retailer’s own comparison figure. Our tracked history records prices we observed after tracking began. These are different kinds of evidence: a seller’s reference price is not our historical measurement, and our lowest recorded price is not the lowest price ever charged anywhere."],
      ["How our tracked-drop label works", "OneDailyDrop uses the last observation from each day, over a rolling 60-day window. At least three observed days and a rounded drop of at least 5% are required. The percentage compares the latest recorded price with the highest daily price we recorded in that window. Gaps mean we did not observe those days; they do not prove the price stayed unchanged."],
      ["Worked example — illustrative, not a live offer", "Suppose we observed $100, $95 and $80 on three separate days. The latest price is 20% below our observed high: (100 − 80) ÷ 100. If the seller also displays a $160 list price, that does not turn our evidence into a 50% measured reduction. Delivery and taxes may still change the checkout total."],
      ["Check the product before the percentage", "Match the model number, capacity, size, bundle contents, warranty region and new or refurbished condition. A cheaper accessory is not a comparison for the full product. For marketplace listings, check the seller’s identity, return window and delivery charge separately from the product’s reviews."],
      ["When the evidence is missing", "No history means no historical claim. No product reviews means seller feedback cannot stand in for them. A displayed OneDailyDrop Score is an offer assessment, not a promise that the price is the cheapest. Open the retailer link and confirm the final price and terms before paying."]
    ]
  },
  {
    slug: "onedailydrop-score", title: "What the OneDailyDrop Score measures",
    description: "How offer quality, evidence coverage and product reviews affect the public OneDailyDrop Score — and why some listings have none.",
    query: "", category: "",
    sections: [
      ["What is the OneDailyDrop Score?", "The OneDailyDrop Score assesses a specific offer using price context, product reviews, seller signals and buying terms. It is not a product test, a fraud guarantee or a lowest-price guarantee. A missing score means the available evidence does not support a public number; it does not automatically mean the product is bad."],
      ["Eligibility before scoring", "The public score requires a current price, at least five product reviews with a positive rating, and the internal quality and confidence thresholds. Seller feedback does not count as product reviews. Listings that fail the evidence gate can remain browseable without receiving a score."],
      ["Quality and evidence are separate", "The internal ranking considers price context, product quality, review volume, seller reliability and delivery or return information. Missing merchant fields reduce data confidence. Search relevance also affects the order of search results, so a higher score need not appear before a more relevant match."],
      ["The current public calculation", "Qualified live offers use a floor of 70. The ceiling is 89 with meaningful product reviews but no current tracked price drop, or 95 when both are present. Within that range, offer quality contributes 75% and normalized evidence confidence 25%, then the result is rounded. These are model boundaries, not percentages of buyers satisfied. Archived selections may retain their original score."],
      ["Why a seller’s list price is not enough", "A large gap from a retailer’s reference price cannot, by itself, earn the higher public ceiling. The stronger ceiling requires a price drop measured in our own observations while the price is current. A listing with no product reviews gets no public score even when the seller has excellent feedback."],
      ["Who is responsible", "OneDailyDrop publishes the methodology and is responsible for its selection system. Affiliate commission adds no ranking points. We use retailer-supplied data and our own recorded observations; we do not claim to have personally tested every product. Report a misleading price or model through our contact page."]
    ]
  },
  {
    slug: "bulova-watch-deals", title: "Bulova watch deals: compare the reference, not just the discount",
    description: "Browse current Bulova listings and check watch references, movement, seller terms and the price evidence behind each offer.",
    query: "Bulova", category: "fashion",
    sections: [
      ["What makes a Bulova watch offer comparable?", "Compare the exact reference number before the collection name. Two Marine Star or Surveyor listings can use different movements, case sizes, straps and dial materials. A discount on one reference is not evidence that another reference is cheap."],
      ["Read the full delivered price", "Compare item price plus delivery in the same currency. Confirm new or pre-owned condition, box and papers, return rights and the seller’s warranty terms. Do not infer manufacturer warranty coverage from a marketplace listing’s title; read the stated coverage."],
      ["Use the evidence on each listing", "A retailer reference-price gap is labelled as the seller’s comparison. A tracked-drop label is based on prices OneDailyDrop recorded. Open the product page for the available observations and their dates. A high product rating and a strong seller record answer different questions; inspect both."],
      ["Current listings, with limits", "The listings below come from the current catalogue, not a claim to cover every retailer. Inventory and price can change. If the selection is empty, we have no matching listings to show; we do not substitute unrelated watches or invent an offer."]
    ]
  },
  {
    slug: "lego-set-deals", title: "LEGO deals: how to compare the same set",
    description: "Check LEGO set numbers, sealed condition, delivery and recorded prices before trusting a sale badge.",
    query: "LEGO", category: "toys-games",
    sections: [
      ["Start with the set number", "A LEGO deal is comparable only when the set number and contents match. A minifigure, lighting kit, display case or compatible building set is not the complete LEGO set shown in a similar photograph. Check the listing title and included contents before comparing prices."],
      ["Condition changes the comparison", "Separate sealed new sets from opened boxes, used sets and incomplete bundles. For used sets, confirm missing pieces, instructions, minifigures and packaging. A lower price can reflect fewer contents rather than a discount on the same offer."],
      ["Price per piece is only one clue", "Dividing delivered price by piece count can help compare similar sets, but it does not account for licensed themes, large parts or rare minifigures. Compare the exact set’s dated observations instead of treating one price-per-piece threshold as proof of value."],
      ["Check the offer at checkout", "Compare the same currency and include shipping. Seller list prices are not verified historical prices. The selection below shows matching catalogue listings; inspect the exact set and terms on the retailer page. An empty selection means we have no current matches, not that LEGO has no sales anywhere."]
    ]
  },
  {
    slug: "art-supply-deals", title: "Art supply deals: compare quantity, grade and delivery",
    description: "Find art supply listings and compare cost per usable unit, material grade and retailer terms rather than a headline percentage.",
    query: "", category: "arts-crafts",
    sections: [
      ["Compare the usable quantity", "For paint, compare price per millilitre in the same grade and series. For paper, match sheet count, dimensions, weight and surface. A small student-grade pack and a larger professional-grade pack are different products, even if both use the same brand name."],
      ["Check what the pack includes", "A colour set may include repeated colours or accessories you do not need. For markers and pens, check replacement refills and tip types. For canvases, match size, depth and priming. Use the delivered price for the items you will actually use."],
      ["What a sale label proves", "A retailer’s reference price describes its own comparison, not a price we independently observed. Our price history begins when we start recording that listing. Missing observations cannot establish a historical low. Open each product’s evidence before treating a percentage as a saving."],
      ["Browse current catalogue matches", "These listings are drawn from the Arts & Crafts category and may include craft tools as well as traditional supplies. Availability, reviews and return terms vary by retailer. Confirm the specific material and quantity before buying."]
    ]
  }
];
const categoryAdvice = {
  electronics: ["Match the exact model and region", "Compare storage, screen size, model year and new or refurbished condition. A similar product title does not guarantee the same specification or warranty region.", "Count the full cost", "Include delivery and necessary accessories. A seller’s list price is a reference, not a historical observation. Open a listing to see which price evidence is actually available."],
  office: ["Check compatibility before price", "For ink and printer supplies, match the cartridge or printer model and whether the item is genuine or third-party. For furniture, check dimensions and assembly requirements.", "Compare the usable unit", "Compare ink volume, pack size or delivered cost per item rather than the headline sale percentage. For chairs, confirm adjustment features, returns and the return-shipping cost."],
  gifts: ["A gift deal must arrive in time", "Check the stated delivery window, recipient’s size or preferences and return terms. A low price is of little use if the item arrives after the occasion.", "Set a delivered budget", "Include shipping and any personalization charge. A seller’s reference price does not establish value. Compare the exact contents and read the available dated price evidence."],
  "sports-outdoors": ["Match fit and intended use", "Check size, material, capacity and intended activity. Similar-looking equipment may have different specifications. Do not assume a marketplace listing proves suitability for safety-critical use.", "Compare condition and buying terms", "Separate new products from used equipment and bundles. Add delivery and confirm return terms before comparing prices. Product reviews and seller feedback provide different evidence."],
  "home-kitchen": ["Match size and specification", "Check appliance model, voltage, capacity and included parts. For cookware, compare material, dimensions and the actual pieces in a set rather than the product photograph.", "Check the final delivered price", "Large items can have substantial delivery or return costs. A list-price gap alone is not a measured saving. Read the product’s recorded observations and confirm the checkout total."]
};
module.exports = { guides, categoryAdvice, GUIDE_MARKETS, EDITORIAL_DATE };
