import { ArrowUpRight } from "@phosphor-icons/react/ssr";
import { getLanguage, t } from "@/lib/i18n";

/*
 * Products from shops we reach through Sovrn Commerce, chosen by a person.
 *
 * Sovrn's onboarding asks for its link to sit, visibly, on a real page of the
 * site, and then watches for a real visitor to follow it before a person
 * reviews the site. That is why this link points straight at sovrn.co rather
 * than going through our own /go routes like everything else: a redirect of
 * ours would put our address in the page instead of theirs, and the check
 * looks for theirs.
 *
 * It is also why nothing here is hurried or padded. Their code of conduct
 * forbids manufactured clicks, so this is one real product a visitor might
 * actually want, not a link placed to be clicked.
 *
 * No price and no score, for the same reasons as the Amazon shelf beside it: a
 * price typed in by hand is wrong within a day and nothing here would notice,
 * and a card without a score next to cards with one invites the reader to
 * assume it was checked the same way. The live price is on the shop's page.
 *
 * Once Sovrn has approved the site this should become a list the admin console
 * manages, as the Amazon picks are, rather than a constant in a component.
 */

type PartnerPick = {
  title: string;
  retailer: string;
  note: string;
  href: string;
};

/* United States only: the shop and the link are both American. */
const PICKS: Record<string, PartnerPick[]> = {
  us: [
    {
      title: "onn. 65\" 4K UHD TV, Powered by VIZIO",
      retailer: "Walmart",
      note: "Walmart's own onn. brand.",
      href: "https://sovrn.co/bksztva",
    },
  ],
};

export async function PartnerPicks({ market }: { market: string }) {
  const picks = PICKS[market] ?? [];
  if (!picks.length) return null;
  const language = await getLanguage(market);

  return (
    <section id="partners" className="mt-10 scroll-mt-32">
      <h2 className="text-lg font-bold text-fg">{t(language, "app.partner.title")}</h2>
      {/* Stated as a fact about where the price lives, not as an apology for
          what this card lacks: that it carries no score is visible, and does
          not need announcing ahead of the product. */}
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
        {t(language, "app.partner.lede")}
      </p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {picks.map((pick) => (
          <li key={pick.href}>
            <a
              href={pick.href}
              target="_blank"
              rel="sponsored noopener"
              className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{pick.title}</span>
                {pick.note ? (
                  <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{pick.note}</span>
                ) : null}
                <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-fg">{t(language, "app.partner.viewDeal")}</span>
                  <span className="text-xs text-fg-subtle">{t(language, "app.partner.seePriceAt", { store: pick.retailer })}</span>
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
        {t(language, "app.partner.disclosure")}
      </p>
    </section>
  );
}
