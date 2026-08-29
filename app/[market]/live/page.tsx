import type { Metadata } from "next";
import { LiveDropPanel } from "@/components/live/LiveDropPanel";

/**
 * The Live Drop page.
 *
 * A path on the main site rather than a subdomain: a subdomain would start its
 * own search reputation from nothing and would not carry the odd_session
 * cookie, so a visitor arriving at the drop would look like a stranger to the
 * rest of the site.
 *
 * Indexable, but with no static description of the offer, because the offer
 * changes every drop and the price is not knowable until it opens. The params
 * type is spelled out rather than using the generated PageProps helper so a
 * brand-new route compiles on a clean checkout.
 */
export const metadata: Metadata = {
  title: "OneDailyDrop Live",
  description:
    "Watch OneDailyDrop Live, see the product demonstration and shop the current limited-time offer.",
};

export default async function LivePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  return <LiveDropPanel market={market} />;
}
