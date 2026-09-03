import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Contact details, moved onto the current design.
 *
 * The wording is carried over from the Express version word for word: this is
 * the text the site is held to, so it was moved, not rewritten. Only the chrome
 * around it changed.
 *
 * The params type is spelled out rather than using the generated `PageProps`
 * helper so a brand-new route compiles on a clean checkout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Get in touch.",
    description: "Questions, corrections, partnership inquiries and deal submissions are welcome.",
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/contact` },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Contact"
      title="Get in touch."
      lede="Questions, corrections, partnership inquiries and deal submissions are welcome."
    >
      <h2>General inquiries</h2>
      <p>
        <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>
      </p>
      <h2>Affiliate and retail partnerships</h2>
      <p>
        <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>
      </p>
      <h2>Deal submissions</h2>
      <p>
        Submit a deal by email to <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
      <h2>Corrections and copyright</h2>
      <p>
        Contact the editorial team at <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
      <h2>Response time</h2>
      <p>
        We aim to review legitimate inquiries within two business days. Product prices and availability can change quickly, so include the product name, retailer and page URL when reporting an issue.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Last updated: July 22, 2026</p>
    </Prose>
  );
}
