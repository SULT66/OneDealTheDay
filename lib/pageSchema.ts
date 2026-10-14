/**
 * The two pieces of structured data every page type should carry, in one place.
 *
 * They were written out by hand on the pages that had any, and simply absent
 * from the rest: measured on production on 2026-10-14, /us/about, /us/guides,
 * /us/stores, /us/archive and /us/coupons carried no structured data at all.
 * A crawler arriving at the page that explains who runs this site was told
 * nothing about who runs this site.
 *
 * Kept as functions rather than components so a page can fold them into a
 * `@graph` it is already building, which is what the product and guide pages
 * do — one script tag per page, not three.
 */

export const SITE_ORIGIN = "https://www.onedailydrop.com";

/**
 * Who publishes this.
 *
 * The entity behind the site, declared once on the page that describes it.
 * Google uses it to connect the domain, the name and the published policies
 * into one publisher rather than treating each page as anonymous — which is
 * the whole of the "who is responsible" half of E-E-A-T, and the part an
 * affiliate site is judged hardest on.
 *
 * Only pages that genuinely describe the organization get it. Repeating it on
 * every page would not make it truer.
 */
export function organizationSchema(market: string) {
  return {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "OneDailyDrop",
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/og-default.png`,
    description:
      "OneDailyDrop records retail prices itself and publishes a saving only where its own observations show the price falling.",
    /* The pages that state how the site works and how it earns. A publisher
       who names them is making a checkable claim, which is the point. */
    publishingPrinciples: `${SITE_ORIGIN}/${market}/how-we-select-deals`,
    actionableFeedbackPolicy: `${SITE_ORIGIN}/${market}/contact`,
  };
}

/**
 * Where this page sits.
 *
 * `trail` is everything after Home, in order, as [name, path] pairs; the last
 * entry is the page itself and carries no link, which is what Google's own
 * examples do and what keeps the current page from pointing at itself.
 */
export function breadcrumbSchema(market: string, trail: [string, string?][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/${market}` },
      ...trail.map(([name, path], index) => ({
        "@type": "ListItem",
        position: index + 2,
        name,
        ...(path ? { item: `${SITE_ORIGIN}/${market}${path}` } : {}),
      })),
    ],
  };
}

/** A page whose job is to list things says what it listed. */
export function itemListSchema(name: string, items: { name: string; url: string }[]) {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

/** One script tag's worth, in the shape every page here already uses. */
export function graph(...nodes: unknown[]) {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}
