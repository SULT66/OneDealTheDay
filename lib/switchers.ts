import { headers } from "next/headers";
import { getMarkets } from "@/lib/catalog";
import { countryName, languageOptions, type LanguageOption } from "@/lib/i18n";

/**
 * The country and language switchers that live in the footer.
 *
 * Both used to sit in a strip above the header. A visitor picks a country
 * roughly once, so a permanent row of five country codes above every page was
 * spending the most valuable space on the rarest action — but the switchers
 * still have to exist somewhere, because detecting the country from the IP
 * address is wrong often enough (VPNs, travel, corporate networks, mobile
 * carriers routing through another country) that a visitor who lands in the
 * wrong market needs a way out.
 */
export type CountryOption = {
  code: string;
  country: string;
  href: string;
  current: boolean;
};

/**
 * Switching country returns to that market's front page rather than the
 * equivalent deep link: a deal id or a category that exists in one market
 * often does not exist in another, and a 404 is a worse answer than the
 * homepage of the country you just asked for.
 */
export function countryOptions(market: string, language: string): CountryOption[] {
  return getMarkets().map((m) => ({
    code: m.code,
    /* markets.json carries only the English name — fine as configuration,
       wrong to print on a German page. */
    country: countryName(m.code, language),
    href: `/${m.code}`,
    current: m.code === market,
  }));
}

/**
 * Switching language keeps the visitor exactly where they are — same path,
 * same filters — because unlike a country, a language does not change which
 * products exist. `?lang=` is also what the Express pages use, and the server
 * stores the choice in a cookie so it survives the next visit.
 */
export async function languageLinks(
  market: string,
  language: string,
): Promise<Array<LanguageOption & { href: string }>> {
  const header = await headers();
  const raw = header.get("x-odd-path") || `/${market}`;
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);

  return languageOptions(market, language).map((option) => {
    const next = new URLSearchParams(params);
    next.set("lang", option.code);
    return { ...option, href: `${path || `/${market}`}?${next.toString()}` };
  });
}
