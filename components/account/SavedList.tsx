"use client";

import Link from "next/link";
import { ArrowUpRight, Heart } from "@phosphor-icons/react";
import { formatPrice } from "@/lib/format";
import { RetailerIcon } from "@/components/ui/RetailerIcon";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import {
  SavedOffersProvider,
  useSavedOffers,
  type SavedOffer,
} from "@/components/account/SavedOffers";

/**
 * Everything the shopper put aside, in one place they can come back to.
 *
 * The price shown is the price on the day it was saved, and it is labelled as
 * such. Refreshing it would be a nice trick and a worse answer: half the value
 * of a saved list is being able to see that something has come down since you
 * looked, and a silently updated number destroys that comparison while looking
 * like it helps.
 */
export function SavedList({ market }: { market: string }) {
  return (
    <SavedOffersProvider market={market}>
      <SavedListInner market={market} />
    </SavedOffersProvider>
  );
}

function SavedListInner({ market }: { market: string }) {
  const saved = useSavedOffers();

  if (!saved || saved.signedIn === null) {
    return <Shell market={market}><p className="text-sm text-fg-subtle">Loading your saved products...</p></Shell>;
  }

  if (saved.signedIn === false) {
    return (
      <Shell market={market}>
        <p className="text-sm leading-relaxed text-fg-muted">
          Saved products live with your account, so they are still here when you come
          back on another device.
        </p>
        <Link
          href={`/${market}/account`}
          className="mt-5 inline-flex h-12 items-center rounded-full bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
        >
          Sign in or create an account
        </Link>
      </Shell>
    );
  }

  if (saved.offers.length === 0) {
    return (
      <Shell market={market}>
        <p className="text-sm leading-relaxed text-fg-muted">
          Nothing saved yet. Tap the heart on any offer, in a deal or in a conversation
          with Delia, and it will be waiting here.
        </p>
        {/* Both ways to find something worth saving. The drop is one deal a
            day; Delia is for when the shopper already knows what they want,
            and an empty list is exactly the moment to offer her. */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Link
            href={`/${market}`}
            className="inline-flex h-12 items-center rounded-full bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
          >
            See today&rsquo;s drop
          </Link>
          <DeliaTrigger
            variant="header"
            label="Ask Delia"
            className="h-12 px-5"
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell market={market} summary={<SavedTotal offers={saved.offers} market={market} />}>
      <ul className="space-y-3">
        {saved.offers.map((offer) => (
          <li key={offer.id}>
            <SavedRow offer={offer} market={market} />
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/**
 * What the whole list comes to.
 *
 * Totalled per currency rather than across them: adding dollars to pounds
 * produces a number that is wrong in a way nobody notices, and a shopper
 * saving from two markets would be shown one.
 *
 * Labelled as the prices when they were saved, because that is what they are.
 * The point of a saved list is partly to watch things come down, and a total
 * that silently refreshed itself would quietly erase the comparison while
 * looking more helpful.
 */
function SavedTotal({ offers, market }: { offers: SavedOffer[]; market: string }) {
  const totals = new Map<string, number>();
  let unpriced = 0;
  for (const offer of offers) {
    if (!(offer.price_value != null && offer.price_value > 0)) {
      unpriced += 1;
      continue;
    }
    const currency = offer.currency || "USD";
    totals.set(currency, (totals.get(currency) || 0) + offer.price_value);
  }

  const sums = [...totals.entries()].map(([currency, total]) =>
    formatPrice(total, currency, market),
  );

  return (
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-surface-2 px-4 py-3">
      <span className="text-sm text-fg-muted">
        {offers.length} {offers.length === 1 ? "product" : "products"} saved
        {unpriced > 0 && (
          <span className="text-fg-subtle">
            {" "}
            ({unpriced} with no confirmed price)
          </span>
        )}
      </span>
      {sums.length > 0 && (
        <span className="text-lg font-bold text-fg tnum">
          {sums.join(" · ")}
          <span className="ml-2 text-xs font-medium text-fg-subtle">
            when you saved them
          </span>
        </span>
      )}
    </div>
  );
}

function Shell({
  market,
  summary,
  children,
}: {
  market: string;
  /** The running total, when there is a list to total. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <nav className="text-xs text-fg-subtle">
        <Link href={`/${market}`} className="hover:text-fg">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-fg-muted">Saved</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-fg sm:text-3xl">Saved products</h1>
      {summary}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SavedRow({ offer, market }: { offer: SavedOffer; market: string }) {
  const saved = useSavedOffers();
  const inCatalog = offer.catalog_product_id > 0;
  const href = inCatalog ? `/${market}/deal/${offer.catalog_product_id}` : offer.url;
  const price =
    offer.price_value != null && offer.price_value > 0
      ? formatPrice(offer.price_value, offer.currency || "USD", market)
      : "";

  /* The price sits in its own column on the right, bold, the way it does in
     Delia's shortlist. Tucked into the grey line under the retailer it was
     the least visible thing on a page whose whole subject is prices. */
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug text-fg">
          {offer.title}
        </span>
        {/* The same shop icon the shortlist used, so a saved row is
            recognisable as the one that was set aside. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <RetailerIcon retailer={offer.retailer} url={offer.url} />
          <span className="truncate text-xs text-fg-muted">{offer.retailer}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 pt-0.5 text-sm font-bold text-fg tnum">
        {price || <span className="text-xs font-medium text-fg-subtle">Price at the shop</span>}
        {!inCatalog && <ArrowUpRight size={13} weight="bold" aria-hidden="true" />}
      </span>
    </>
  );

  const linkClass = "flex min-w-0 flex-1 items-start gap-3";

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border py-3 pl-3 pr-2 transition-colors hover:border-border-strong hover:bg-surface-2">
      {inCatalog ? (
        <Link href={href} className={linkClass}>
          {body}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="sponsored noopener noreferrer" className={linkClass}>
          {body}
        </a>
      )}
      <button
        type="button"
        onClick={() => saved?.toggle({ url: offer.url, title: offer.title })}
        aria-label={`Remove ${offer.title} from saved`}
        title="Remove"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lime-deep transition-colors hover:bg-surface"
      >
        <Heart size={16} weight="fill" aria-hidden="true" />
      </button>
    </div>
  );
}
