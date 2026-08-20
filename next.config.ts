import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product photography comes straight from whichever retailer's own CDN
    // hosts the listing — eBay, Awin feed partners (often on their own
    // storefront platform, e.g. Shopify), and any future source the backend
    // enables. The catalog is entirely backend-driven, so there is no fixed
    // hostname list to allowlist here; any HTTPS image host is accepted.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
