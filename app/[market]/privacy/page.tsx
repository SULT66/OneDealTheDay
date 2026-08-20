import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Privacy policy, moved onto the current design.
 *
 * The wording is carried over from the Express version word for word: this is
 * the text the site is held to, so it was moved, not rewritten. Only the chrome
 * around it changed.
 *
 * The params type is spelled out rather than using the generated `PageProps`
 * helper so a brand-new route compiles on a clean checkout.
 */
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What information OneDailyDrop may collect and how it is used.",
};

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Privacy"
      title="Privacy Policy"
      lede="This policy explains what information OneDailyDrop may collect and how it is used."
    >
      <h2>Information we collect</h2>
      <p>
        We may collect technical information such as device type, browser, approximate location, pages viewed, referral source, search activity and clicks on retailer links. If you contact us or subscribe to communications, we may also receive the information you provide directly.
      </p>
      <h2>Analytics and cookies</h2>
      <p>
        We use optional Google Analytics cookies to understand site usage and improve performance. For visitors in France and Germany, analytics does not load unless the visitor accepts it. Declining analytics does not disable essential site functions.
      </p>
      <h2>Affiliate links</h2>
      <p>
        When you click a retailer link, the retailer or affiliate network may use cookies or tracking parameters to attribute a qualifying purchase to OneDailyDrop. Those third parties process data under their own privacy policies.
      </p>
      <h2>How information is used</h2>
      <ul>
        <li>Operate, secure and improve the website.</li>
        <li>Measure traffic, searches and affiliate-link performance.</li>
        <li>Respond to messages and administer subscriptions.</li>
        <li>Detect abuse and comply with legal obligations.</li>
      </ul>
      <h2>Sharing</h2>
      <p>
        We do not sell personal information. Information may be shared with service providers that support hosting, analytics, email delivery and affiliate attribution, or when required by law.
      </p>
      <h2>Your choices</h2>
      <p>
        You may accept, decline or later change analytics consent using Cookie settings in the site footer. You may also disable cookies in your browser and contact us at <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a> regarding privacy questions. Depending on your jurisdiction, additional access, deletion or opt-out rights may apply.
      </p>
      <h2>Children</h2>
      <p>
        OneDailyDrop is not directed to children under 13 and we do not knowingly collect their personal information.
      </p>
      <h2>Changes</h2>
      <p>
        We may update this policy as the service changes. The current effective date will appear below.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Effective: July 30, 2026</p>
    </Prose>
  );
}
