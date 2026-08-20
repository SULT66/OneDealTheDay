import type { Metadata } from "next";
import { Outfit } from "next/font/google";
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
    default: "OneDailyDrop — one genuinely good deal, checked daily",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}
