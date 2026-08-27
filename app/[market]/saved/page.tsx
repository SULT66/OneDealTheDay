import type { Metadata } from "next";
import { SavedList } from "@/components/account/SavedList";

/**
 * The list a shopper comes back to.
 *
 * noindex because it is one person's list and there is nothing here for a
 * search engine. The params type is spelled out rather than using the
 * generated `PageProps` helper so a brand-new route compiles on a clean
 * checkout.
 */
export const metadata: Metadata = {
  title: "Saved products",
  description: "Products you put aside to come back to.",
  robots: { index: false, follow: false },
};

export default async function SavedPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  return <SavedList market={market} />;
}
