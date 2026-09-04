import { slugifyCategory } from "@/lib/backendAdapter";
import { StoreLogo } from "@/components/site/StoreLogo";

type Shop = { retailer: string; listings: number; host: string };

/**
 * The shops, travelling.
 *
 * Each logo is the shop's own favicon, served by /api/retailer-icon, which
 * fetches it from that shop's site once and caches it. Nothing is stored in
 * this repository and no logo is redrawn by hand, so a shop that changes its
 * mark changes it here too, and a shop we stop carrying takes its logo with it
 * when it leaves the catalogue.
 *
 * Every tile is a link through the affiliate network the shop reaches us by,
 * so a visitor who wanders in and buys something we never listed is still a
 * visitor we sent. A tile whose shop has no commissionable link is not drawn:
 * the backend only reports a `host` for shops a front-door link can be built
 * for.
 *
 * The list is rendered twice. The track moves exactly half its own width, so
 * when the animation restarts the second copy is sitting where the first one
 * started and the seam is invisible. The second copy is hidden from screen
 * readers, and from the page entirely when motion is turned down.
 */
export function StoreMarquee({
  market,
  shops,
}: {
  market: string;
  shops: Shop[];
}) {
  const withLogos = shops.filter((shop) => shop.host);
  if (!withLogos.length) return null;

  /* Roughly six seconds per shop, so a short list does not race past and a
     long one does not crawl. */
  const duration = `${Math.max(24, withLogos.length * 6)}s`;

  const tile = (shop: Shop, copy: 1 | 2) => (
    <a
      key={`${copy}-${shop.retailer}`}
      href={`/${market}/go/store/${slugifyCategory(shop.retailer)}`}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      aria-hidden={copy === 2 ? true : undefined}
      tabIndex={copy === 2 ? -1 : undefined}
      data-marquee-copy={copy === 2 ? "2" : undefined}
      className="group flex shrink-0 items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-4 transition-colors hover:border-fg-subtle"
    >
      <StoreLogo host={shop.host} name={shop.retailer} />
      <span className="whitespace-nowrap text-base font-semibold text-fg">
        {shop.retailer}
      </span>
    </a>
  );

  return (
    <div
      className="store-marquee relative -mx-4 overflow-hidden py-2 sm:-mx-6"
      style={{ "--marquee-duration": duration } as React.CSSProperties}
    >
      {/* The row runs to both page edges and fades out rather than stopping at
          a hard line, so it reads as continuing rather than as a list that has
          been cut off. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent"
      />
      <div className="store-marquee-track flex items-center gap-4 px-4 sm:px-6">
        {withLogos.map((shop) => tile(shop, 1))}
        {withLogos.map((shop) => tile(shop, 2))}
      </div>
    </div>
  );
}
