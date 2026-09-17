import type { NextConfig } from "next";

/*
 * Which image hosts the optimizer will fetch from.
 *
 * This was `hostname: "**"`, which let anybody point /_next/image at any HTTPS
 * address on the internet and have our server fetch and re-encode it —
 * bandwidth, and an image decoder, spent on somebody else's behalf. The
 * catalogue's own photographs render `unoptimized` (components/ui/ProductImage
 * .tsx), so they never pass through the optimizer at all; what is left is the
 * Live Drop's artwork and the retailer icons, from a handful of known CDNs.
 *
 * A new feed on a new CDN adds a line here, or a hostname in IMAGE_HOSTS
 * (comma separated), so production can accept one without a deploy.
 */
const KNOWN_IMAGE_HOSTS = [
  "i.ebayimg.com",
  "c1.neweggimages.com",
  "cdn.shopify.com",
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "www.onedailydrop.com",
];

const extraHosts = String(process.env.IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => /^[a-z0-9.*-]+\.[a-z]{2,}$/i.test(host));

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [...new Set([...KNOWN_IMAGE_HOSTS, ...extraHosts])].map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
};

export default nextConfig;
