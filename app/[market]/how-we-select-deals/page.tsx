import type { Metadata } from "next";
import { countryName, getLanguage } from "@/lib/i18n";
import { SpanishHowWeSelect, spanishMeta } from "@/components/site/SpanishPages";
import { getMarket } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "How we select deals",
    description:
    "The evidence behind every OneDailyDrop pick: price signal, product quality and seller confidence, and what the Score does not measure.",
    ...((await getLanguage(market)) === "es" ? { title: spanishMeta.howWeSelect.title, description: spanishMeta.howWeSelect.description } : {}),
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/how-we-select-deals` },
  };
}

export default async function HowWeSelectPage({
  params,
}: PageProps<"/[market]/how-we-select-deals">) {
  const { market } = await params;
  const info = getMarket(market);
  if ((await getLanguage(market)) === "es") {
    return <SpanishHowWeSelect market={market} country={info ? countryName(market, "es") : "tu mercado"} />;
  }

  return (
    <Prose
      market={market}
      crumb="How we select"
      title="How we select deals"
      lede={`One pick a day for ${info?.country ?? "your market"}, chosen from listings that clear three separate checks. Here is what each one means.`}
    >
      <h2>Price signal</h2>
      <p>
        We record each listing&apos;s price ourselves, several times a day. The
        only saving this site states in its own voice is the one those records
        show: how far today&apos;s price sits below the highest daily price we
        have seen in the last sixty days. Under five per cent, or with fewer
        than three days of our own observations behind it, we say nothing.
      </p>
      <p>
        Where the retailer publishes a reference price, it is shown beside the
        current one and labelled as theirs. We do not work a percentage out of
        it. It is their figure, we have not been able to check it, and a
        struck-through number nobody checked is the oldest trick in retail.
      </p>

      <h2>Product quality</h2>
      <p>
        Product ratings and review counts are read from the listing itself and
        kept separate from seller feedback, because a well-rated product sold by
        an unreliable seller is not a good buy. A rating counts for what the
        number of reviews behind it is worth: five stars from three buyers is
        pulled toward the average of everything we list, while the same rating
        from three hundred stands on its own. Listings with no reviews are not
        excluded — the page shows that they have none, rather than scoring them
        as though they were perfect.
      </p>

      <h2>Seller confidence</h2>
      <p>
        Feedback percentage, the number of ratings behind it, stated delivery
        terms and stated returns terms all feed the assessment. A seller with a
        hundred ratings behind their percentage counts for more than one with
        five; past a hundred we treat them alike, because the difference
        between a thousand and a million tells a shopper nothing further.
      </p>

      <h2>What the Score is</h2>
      <p>
        The OneDailyDrop Score runs from 0 to 100 and combines those three
        checks with the buying terms attached to the offer. It describes one
        specific listing at one moment, not a product in general.
      </p>
      <p>
        Most listings do not get one. A Score needs product reviews behind it,
        and only a small part of the catalogue has any — most shops send us
        none. Those pages show no number at all, which is the honest answer,
        rather than a number implying evidence nobody supplied.
      </p>

      <h2>What the Score is not</h2>
      <p>
        Affiliate commission adds no points and never determines which item
        becomes the Daily Drop. We do not sell products, hold stock or process
        payments. When you choose a deal we send you to the retailer, and the
        retailer remains the final source for price, model, condition and total
        at checkout.
      </p>
    </Prose>
  );
}
