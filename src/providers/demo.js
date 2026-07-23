const data = [
  ["D001", "Cordless Car Vacuum", "Automotive", 4.7, 18640, 39.99, 59.99, "Best Seller", "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80"],
  ["D002", "Rechargeable Milk Frother", "Kitchen", 4.6, 28400, 14.99, 19.99, "Popular", "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=1200&q=80"],
  ["D003", "Wi-Fi Smart Plug 4-Pack", "Smart Home", 4.7, 83200, 24.99, 34.99, "Amazon's Choice", "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=1200&q=80"],
  ["D004", "Portable USB-C Blender", "Kitchen", 4.5, 12100, 29.99, 39.99, "Deal", "https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1200&q=80"],
  ["D005", "Pet Water Fountain", "Pets", 4.7, 52600, 27.99, 39.99, "Best Seller", "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1200&q=80"],
  ["D006", "Magnetic Phone Car Mount", "Automotive", 4.6, 46100, 18.99, 25.99, "Popular", "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=1200&q=80"],
  ["D007", "Mini Electric Screwdriver Set", "Tools", 4.7, 9700, 42.99, 59.99, "Deal", "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80"],
  ["D008", "Packing Cubes Travel Set", "Travel", 4.8, 37800, 21.99, 29.99, "Best Seller", "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80"],
  ["D009", "LED Desk Lamp with Wireless Charger", "Office", 4.6, 14200, 32.99, 49.99, "Amazon's Choice", "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80"],
  ["D010", "Digital Kitchen Scale", "Kitchen", 4.7, 94500, 12.99, 17.99, "Best Seller", "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80"],
  ["D011", "Resistance Bands Set", "Fitness", 4.6, 33500, 19.99, 29.99, "Popular", "https://images.unsplash.com/photo-1598289431512-b97b0917affc?auto=format&fit=crop&w=1200&q=80"]
];

exports.searchProducts = async ({ affiliateTag }) => data.map((product, index) => {
  const search = new URL("https://www.amazon.com/s");
  search.searchParams.set("k", product[1]);
  if (affiliateTag) search.searchParams.set("tag", affiliateTag);

  return {
    external_id: product[0],
    title: product[1],
    category: product[2],
    description: `Preview ${product[2].toLowerCase()} product used while OneDailyDrop is under development.`,
    rating: product[3],
    review_count: product[4],
    current_price: product[5],
    original_price: product[6],
    currency: "USD",
    badge: product[7],
    image_url: product[8],
    affiliate_url: search.toString(),
    source: "demo",
    source_rank: index + 1
  };
});
