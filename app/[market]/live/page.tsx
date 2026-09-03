import type { Metadata } from "next";
import { BACKEND_URL } from "@/lib/catalog";
import { LiveDropPanel, type LiveDropView } from "@/components/live/LiveDropPanel";

/**
 * The Live Drop page.
 *
 * A path on the main site rather than a subdomain: a subdomain would start its
 * own search reputation from nothing and would not carry the odd_session
 * cookie, so a visitor arriving at the drop would look like a stranger to the
 * rest of the site.
 *
 * The drop is fetched here rather than only in the browser. The panel is a
 * client component and used to fetch on mount, so the server sent "Checking
 * for a drop..." with no heading and no content: a crawler saw an empty page,
 * and so did the first paint of a slow connection. The countdown still belongs
 * to the browser — it polls and ticks — but what the drop *is* arrives with
 * the page.
 *
 * Never cached: the whole mechanic is that the price appears at a particular
 * second, and a page held for even a minute would open the drop late for one
 * visitor and early for another.
 */
export const dynamic = "force-dynamic";

/*
 * Null means the question could not be asked, which is not the same as an
 * answer of "no drop". Collapsing the two would put "No drop scheduled" on the
 * page during an outage, and on the day of a drop that is the worst possible
 * thing to say.
 */
async function currentDrop(market: string): Promise<{ drop: LiveDropView | null } | null> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/live/current?market=${encodeURIComponent(market)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { drop?: LiveDropView | null };
    return { drop: body.drop ?? null };
  } catch {
    /* The panel asks again from the browser a moment later. One render without
       an answer is better than a page that fails to render. */
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "OneDailyDrop Live",
    description:
      "Watch OneDailyDrop Live, see the product demonstration and shop the current limited-time offer.",
    /* Indexable, but with no static description of the offer: the offer changes
       every drop and the price is not knowable until it opens. */
    alternates: { canonical: `/${market}/live` },
  };
}

export default async function LivePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  const answered = await currentDrop(market);
  return (
    <LiveDropPanel
      market={market}
      initialDrop={answered?.drop ?? null}
      serverChecked={answered !== null}
    />
  );
}
