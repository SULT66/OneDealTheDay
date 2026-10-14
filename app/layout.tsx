import type { Metadata } from "next";
import { headers } from "next/headers";
import { Outfit } from "next/font/google";
import Script from "next/script";
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
    /* Every page that does not supply its own picture — the homepage, the
       categories, the text pages — shared to Facebook, WhatsApp or Slack as a
       bare link with no image at all. A product page still uses the product's
       own photograph. */
    images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "OneDailyDrop" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-default.png"],
  },
  /*
   * Pinterest's proof that this domain is ours.
   *
   * Not a secret — it is published in the HTML of every page by design, and
   * the only thing it does is let Pinterest attribute pins that link here to
   * our account. Without it the pins are anonymous: no analytics on which pin
   * earned a visit, and no Rich Pins, which is what pulls the live price onto
   * a pin from the Product markup each listing already carries.
   *
   * Site-wide rather than on one page: Pinterest checks the homepage, and a
   * claim that lives on a single route is one refactor away from silently
   * lapsing.
   */
  other: { "p:domain_verify": "c9896fe5c98d503467e12aaa50e2f383" },
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
        <Script id="lareo-analytics-config" strategy="beforeInteractive">
          {`window.__LAREO_ANALYTICS__=${JSON.stringify({
            endpoint: process.env.NEXT_PUBLIC_LAREO_ANALYTICS_ENDPOINT || "",
            writeKey: process.env.NEXT_PUBLIC_LAREO_ANALYTICS_WRITE_KEY || "",
          })}`}
        </Script>
        <link rel="stylesheet" href="/cookie-consent.css?v=20260730" />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {children}
        {/* Same consent-gated Google Analytics loader the rest of the site
            uses (public/cookie-consent.js) — self-contained, reads the
            market straight from the URL, shows the EU consent banner only
            for fr/de. */}
        <script src="/cookie-consent.js?v=20260912-startup-fix" />
      </body>
    </html>
  );
}
