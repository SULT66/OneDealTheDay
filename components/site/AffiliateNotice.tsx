/** Short disclosure shared by pages and the independently scrolling chat. */
export function AffiliateNotice({
  market,
  language = "en",
  compact = false,
}: {
  market: string;
  language?: string;
  /* Smaller, for a footnote under Delia's composer, where it stays on screen
     however far the conversation scrolls. */
  compact?: boolean;
}) {
  const copy: Record<string, [string, string]> = {
    en: ["We may earn a commission when you click some retailer links or make a purchase, at no extra cost to you.", "How we earn"],
    es: ["Podemos recibir una comisión cuando haces clic en algunos enlaces de tiendas o compras, sin coste adicional para ti.", "Cómo ganamos dinero"],
    fr: ["Nous pouvons recevoir une commission pour certains clics vers les boutiques ou achats, sans frais supplémentaires pour vous.", "Notre rémunération"],
    de: ["Für Klicks auf bestimmte Händlerlinks oder Käufe können wir eine Provision erhalten, ohne Mehrkosten für Sie.", "So verdienen wir Geld"],
  };
  const [text, label] = copy[language] ?? copy.en;
  return (
    <p className={compact ? "text-xs leading-relaxed text-fg-subtle" : "text-sm leading-relaxed text-fg-muted"}>
      {text}{" "}
      <a href={`/${market}/affiliate-disclosure`} className="font-medium underline underline-offset-4 hover:text-fg">{label}</a>
    </p>
  );
}
