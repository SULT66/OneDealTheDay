import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/AccountPanel";

/**
 * Signing in, on the site's own design.
 *
 * The account page was a standalone HTML file with its own header and its own
 * stylesheet, so a shopper who clicked "sign in" landed on something that
 * looked like a different company. The endpoints behind it are untouched; only
 * the chrome around them changed.
 *
 * noindex because there is nothing here for a search engine, and a sign-in
 * page in results is a phishing target rather than a visit.
 *
 * The params type is spelled out rather than using the generated `PageProps`
 * helper so a brand-new route compiles on a clean checkout.
 */
export const metadata: Metadata = {
  title: "Your account",
  description: "Sign in to save products and keep your conversations with Delia.",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  return <AccountPanel market={market} />;
}
