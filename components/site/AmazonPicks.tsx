import { ArrowUpRight } from "@phosphor-icons/react/ssr";
import { BACKEND_URL } from "@/lib/catalog";

/*
 * A handful of Amazon products, chosen by a person.
 *
 * Still no score and no photo: those are Amazon's, and only ours to show
 * through the Product Advertising API, which opens after three qualifying
 * sales. The name, the note and the price are typed in by hand instead.
 *
 * The price is the careful part. Amazon's prices move several times a day —
 * which is exactly why their agreement has prices come from the API — so this
 * one is never presented as the current one. It is shown with the day it was
 * entered: "USD 45.00 on Amazon, 9 Sep" stays true however old it gets, the
 * reader can see for themselves how old that is, and the live number is one
 * click away.
 *
 * The section sits apart from the catalogue and always will. A card with a
 * checked price and a score next to one with neither invites the reader to
 * assume the second was checked too, and the whole argument of this site is
 * that a number on it means something.
 */

type Pick = {
  id: number;
  title: string;
  category: string;
  note: string;
  price: number | null;
  currency: string;
  price_checked_at: string | null;
};

async function amazonPicks(market: string): Promise<Pick[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/amazon-picks?market=${encodeURIComponent(market)}`, {
      /*
       * Not cached here, deliberately. This list is edited by hand in the admin
       * console, and a five minute data cache meant a pick was added, the
       * console showed it, and the homepage did not — which reads as a form
       * that did not work, and sends somebody looking for a bug.
       *
       * It costs nothing to skip: a few hundred bytes over the loopback, and
       * the rendered page is held by the HTML cache anyway — which the admin
       * routes clear the moment a pick changes.
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

const checkedOn = (iso: string | null) => {
  if (!iso) return "";
  const when = new Date(iso);
  return Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleDateString("en-US", { day: "numeric", month: "short" });
};

export async function AmazonPicks({ market }: { market: string }) {
  const picks = await amazonPicks(market);
  if (!picks.length) return null;

  return (
    <section id="amazon" className="mt-14 scroll-mt-32 border-t border-border pt-10">
      <h2 className="text-lg font-bold text-fg">Also worth a look on Amazon</h2>
      {/* Up front, because the reader is about to notice these carry no score,
          and should not have to work out what is different about them. */}
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
        Picked by hand from Amazon&rsquo;s best sellers. We don&rsquo;t score these,
        and any price below is what it was on the day we looked &mdash; Amazon
        changes prices often, so the live one is on their page.
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
              className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{pick.title}</span>

                {pick.note ? (
                  <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{pick.note}</span>
                ) : null}

                <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {pick.price ? (
                    <>
                      <span className="text-sm font-semibold text-fg tnum">
                        {pick.currency} {pick.price.toFixed(2)}
                      </span>
                      {/* The date is not decoration. Without it this is a claim
                          about today's price, which is the one thing it is not. */}
                      <span className="text-xs text-fg-subtle">
                        on Amazon, {checkedOn(pick.price_checked_at)}
                      </span>
                    </>
                  ) : null}
                  {pick.category ? (
                    <span className="text-xs text-fg-subtle">{pick.category}</span>
                  ) : null}
                </span>
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
