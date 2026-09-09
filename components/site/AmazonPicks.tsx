import { ArrowUpRight } from "@phosphor-icons/react/ssr";
import { BACKEND_URL } from "@/lib/catalog";

/*
 * A handful of Amazon products, chosen by a person.
 *
 * Deliberately unlike every other card on this site: no price, no score, no
 * photo, no discount. Not an oversight and not a placeholder — Amazon's
 * agreement allows their price, availability and images to be shown only when
 * they come from the Product Advertising API, and that opens after three
 * qualifying sales. Until then the honest version of an Amazon listing here is
 * a name and a link, so that is what this is.
 *
 * It sits apart from the catalogue for the same reason. A card with a score and
 * a checked price next to one with neither invites the reader to assume the
 * second was checked too, and the whole argument of this site is that a number
 * on it means something.
 */

type Pick = { id: number; title: string; category: string };

async function amazonPicks(market: string): Promise<Pick[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/amazon-picks?market=${encodeURIComponent(market)}`, {
      /*
       * Not cached here, deliberately. This list is edited by hand in the
       * admin console, and a five minute data cache meant a pick was added,
       * the console showed it, and the homepage did not — which reads as a
       * form that did not work, and sends somebody looking for a bug.
       *
       * It costs nothing to skip: the payload is a few hundred bytes over the
       * loopback, and the rendered page is held by the HTML cache anyway —
       * which the admin routes clear the moment a pick changes.
       */
      cache: "no-store",
    });
    if (!response.ok) return [];
    return (await response.json()) as Pick[];
  } catch {
    /* A section that cannot load is a section that is not there. It is not
       worth an error page on the homepage. */
    return [];
  }
}

export async function AmazonPicks({ market }: { market: string }) {
  const picks = await amazonPicks(market);
  if (!picks.length) return null;

  return (
    /* Named, so the stores page can point a visitor straight at it. */
    <section id="amazon" className="mt-14 scroll-mt-32 border-t border-border pt-10">
      <h2 className="text-lg font-bold text-fg">Also worth a look on Amazon</h2>
      {/* Said plainly and up front, because the reader is about to notice
          there are no prices and should not have to wonder why. */}
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
        Picked by hand from Amazon&rsquo;s best sellers. We don&rsquo;t quote a price or a
        score for these — check both on Amazon, where they are always current.
      </p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {picks.map((pick) => (
          <li key={pick.id}>
            <a
              /* Through our own route so the click is counted, and so the
                 session the browser stamps on makes it a person rather than a
                 number. The link itself is never rewritten. */
              href={`/${market}/amazon/go/${pick.id}`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="group flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{pick.title}</span>
                {pick.category ? (
                  <span className="mt-0.5 block text-xs text-fg-subtle">{pick.category}</span>
                ) : null}
              </span>
              <ArrowUpRight
                size={16}
                weight="bold"
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-fg-subtle">
        As an Amazon Associate we earn from qualifying purchases. Following one of
        these costs you nothing and pays us a small commission.
      </p>
    </section>
  );
}
