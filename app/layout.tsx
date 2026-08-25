import type { Metadata } from "next";
import { headers } from "next/headers";
import { Outfit } from "next/font/google";
import { tagFor } from "@/lib/i18n";
import "./globals.css";

/* Reference brand uses Lufga, which is a commercial licence we cannot ship.
   Outfit is the closest free geometric grotesque — swap this one import if
   a Lufga licence is ever purchased. */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.onedailydrop.com"),
  title: {
    default: "OneDailyDrop: one genuinely good deal, checked daily",
    template: "%s | OneDailyDrop",
  },
  description:
    "We compare local prices, product quality and seller signals so your first stop before buying is a smarter one.",
  openGraph: {
    siteName: "OneDailyDrop",
    type: "website",
  },
};

/* Applies the saved theme before first paint so the page never flashes
   the wrong palette. Kept tiny and dependency-free on purpose. */
const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('odd-theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {}
})();
`;

/**
 * The market and language for this request are resolved by the Express server
 * in front of these pages and handed over on request headers (src/server.js).
 * Reading them here is what puts a truthful `lang` on the document: until now
 * every page claimed English, including the French and German markets, which
 * misleads search engines and screen readers alike.
 *
 * `next build` renders this with no request behind it, hence the fallback.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const header = await headers();
  const market = header.get("x-odd-market") || "us";
  const language = header.get("x-odd-language") || "";
  const lang = language ? tagFor(market, language) : "en-US";

  return (
    <html lang={lang} className={`${outfit.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="stylesheet" href="/cookie-consent.css?v=20260730" />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {children}
        {/* Same consent-gated Google Analytics loader the rest of the site
            uses (public/cookie-consent.js) — self-contained, reads the
            market straight from the URL, shows the EU consent banner only
            for fr/de. */}
        <script src="/cookie-consent.js?v=20260730" />
      </body>
    </html>
  );
}
