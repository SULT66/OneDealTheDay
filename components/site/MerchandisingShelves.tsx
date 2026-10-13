import { DealCard } from "@/components/deal/DealCard";
import { getMerchandisingShelves } from "@/lib/merchandising";
import type { Language } from "@/lib/i18n";
import { MerchandisingTracking } from "./MerchandisingTracking";

const COPY: Record<Language, { seasonal: string; trend: string; seasonalNote: string; trendNote: string; sources: string }> = {
  en: { seasonal: "For the season", trend: "Growing interest", seasonalNote: "Selected for the occasion. See each shop for delivery dates.", trendNote: "Based on recent interest signals; popularity does not guarantee a saving.", sources: "Sources" },
  es: { seasonal: "Para la temporada", trend: "Interés en aumento", seasonalNote: "Selección para la ocasión. Consulta los plazos de entrega en cada tienda.", trendNote: "Basado en señales de interés recientes; la popularidad no garantiza un ahorro.", sources: "Fuentes" },
  fr: { seasonal: "Pour la saison", trend: "Intérêt en hausse", seasonalNote: "Une sélection pour l’occasion. Consultez les délais de livraison de chaque boutique.", trendNote: "Selon des signaux d’intérêt récents ; la popularité ne garantit pas une économie.", sources: "Sources" },
  de: { seasonal: "Für die Saison", trend: "Steigendes Interesse", seasonalNote: "Für den Anlass ausgewählt. Liefertermine finden Sie beim jeweiligen Händler.", trendNote: "Basierend auf aktuellen Interessenssignalen; Beliebtheit garantiert keine Ersparnis.", sources: "Quellen" },
};

export async function MerchandisingShelves({ market, language, category }: {
  market: string; language: Language; category?: string;
}) {
  const shelves = await getMerchandisingShelves(market, language, category);
  if (!shelves.length) return null;
  const copy = COPY[language];
  return <div className="mt-12 space-y-12">
    {shelves.map(shelf => <section key={shelf.id} aria-labelledby={`merch-${shelf.id}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
        {shelf.kind === "seasonal" ? copy.seasonal : copy.trend}
      </p>
      <h2 id={`merch-${shelf.id}`} className="mt-2 text-2xl font-bold tracking-tight text-fg">{shelf.title}</h2>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        {shelf.kind === "seasonal" ? copy.seasonalNote : copy.trendNote}
      </p>
      <MerchandisingTracking market={market}>
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shelf.products.map((deal, index) => <li key={deal.id}>
          <DealCard deal={deal} market={market} index={index} tracking={{source:category ? "category" : "home", placement:shelf.kind === "seasonal" ? "seasonal_card" : "trend_card"}} />
        </li>)}
      </ul>
      </MerchandisingTracking>
      {shelf.kind === "trend" && shelf.sourceUrls.length > 0 && <details className="mt-3 text-xs text-fg-subtle">
        <summary className="cursor-pointer">{copy.sources}</summary>
        <ul className="mt-2 space-y-1">
          {shelf.sourceUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all">{new URL(url).hostname}</a></li>)}
        </ul>
      </details>}
    </section>)}
  </div>;
}
