import type { Metadata } from "next";
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

  return (
    <Prose
      market={market}
      crumb="How we select"
      title="How we select deals"
      lede={`One pick a day for ${info?.country ?? "your market"}, chosen from listings that clear three separate checks. Here is what each one means.`}
    >
      <h2>Price signal</h2>
      <p>
        We track a listing&apos;s price over time and compare the current figure
        against the retailer&apos;s own reference price. A saving is only shown
        when that reference has actually been verified. Where none exists, the
        page says so instead of inventing a struck-through number.
      </p>

      <h2>Product quality</h2>
      <p>
        Product ratings and review counts are read from the listing itself and
        kept separate from seller feedback, because a well-rated product sold by
        an unreliable seller is not a good buy. Listings with no reviews are not
        excluded, but they are labelled as unrated rather than scored as if they
        were perfect.
      </p>

      <h2>Seller confidence</h2>
      <p>
        Feedback percentage, the number of ratings behind it, stated delivery
        terms and stated returns terms all feed the assessment. A high
        percentage from a handful of ratings carries less weight than the same
        percentage from thousands.
      </p>

      <h2>What the Score is</h2>
      <p>
        The OneDailyDrop Score runs from 0 to 100 and combines those three
        checks with the buying terms attached to the offer. It describes one
        specific listing at one moment, not a product in general.
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
