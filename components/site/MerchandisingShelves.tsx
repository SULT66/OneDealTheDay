import { DealCard } from "@/components/deal/DealCard";
import { getMerchandisingShelves } from "@/lib/merchandising";
import type { Language } from "@/lib/i18n";
import { MerchandisingTracking } from "./MerchandisingTracking";

const REASONS: Record<Language, {match:string; reviews:string; terms:string; arrival:string; interest:string; external:string; retailer:string}> = {
  en: {terms:'Price and buying terms checked; product reviews not verified', match:'Matches', reviews:'Product reviews, price and buying terms checked', arrival:'Estimated arrival', interest:'Based on recent searches on OneDailyDrop across several days.', external:'Based on cited shopping-interest evidence.', retailer:'Based on a retailer-specific bestseller list.'},
  es: {terms:'Precio y condiciones comprobados; reseñas no verificadas', match:'Coincide con', reviews:'Reseñas del producto, precio y condiciones comprobados', arrival:'Llegada estimada', interest:'Basado en búsquedas recientes en OneDailyDrop durante varios días.', external:'Basado en fuentes citadas de interés de compra.', retailer:'Basado en la lista de más vendidos de una tienda.'},
  fr: {terms:'Prix et conditions vérifiés ; avis produit non vérifiés', match:'Correspond à', reviews:'Avis produit, prix et conditions vérifiés', arrival:'Arrivée estimée', interest:'Selon les recherches récentes sur OneDailyDrop sur plusieurs jours.', external:'Selon des sources citées sur l’intérêt d’achat.', retailer:'Selon le classement des meilleures ventes d’une boutique.'},
  de: {terms:'Preis und Kaufbedingungen geprüft; Produktbewertungen nicht verifiziert', match:'Passend zu', reviews:'Produktbewertungen, Preis und Kaufbedingungen geprüft', arrival:'Voraussichtliche Ankunft', interest:'Basierend auf aktuellen Suchanfragen auf OneDailyDrop über mehrere Tage.', external:'Basierend auf belegtem Kaufinteresse.', retailer:'Basierend auf der Bestsellerliste eines Händlers.'},
};
const COPY: Record<Language, { seasonal: string; trend: string; seasonalNote: string; trendNote: string; sources: string }> = {
  en: { seasonal: "For the season", trend: "Growing interest", seasonalNote: "Selected for the occasion. Delivery estimates depend on your address; confirm at the shop.", trendNote: "Based on recent interest signals; popularity does not guarantee a saving.", sources: "Sources" },
  es: { seasonal: "Para la temporada", trend: "Interés en aumento", seasonalNote: "Selección para la ocasión. La entrega depende de tu dirección; confírmala en la tienda.", trendNote: "Basado en señales de interés recientes; la popularidad no garantiza un ahorro.", sources: "Fuentes" },
  fr: { seasonal: "Pour la saison", trend: "Intérêt en hausse", seasonalNote: "Une sélection pour l’occasion. La livraison dépend de votre adresse ; confirmez auprès de la boutique.", trendNote: "Selon des signaux d’intérêt récents ; la popularité ne garantit pas une économie.", sources: "Sources" },
  de: { seasonal: "Für die Saison", trend: "Steigendes Interesse", seasonalNote: "Für den Anlass ausgewählt. Liefertermine hängen von Ihrer Adresse ab; beim Händler bestätigen.", trendNote: "Basierend auf aktuellen Interessenssignalen; Beliebtheit garantiert keine Ersparnis.", sources: "Quellen" },
};

export async function MerchandisingShelves({ market, language, category }: {
  market: string; language: Language; category?: string;
}) {
  const shelves = await getMerchandisingShelves(market, language, category);
  if (!shelves.length) return null;
  const copy = COPY[language];
  const reasons = REASONS[language];
  const date = (value: string) => new Intl.DateTimeFormat(language, {month:'short', day:'numeric', timeZone:'UTC'}).format(new Date(value));
  return <div className="mt-12 space-y-12">
    {shelves.map(shelf => <section key={shelf.id} aria-labelledby={`merch-${shelf.id}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
        {shelf.kind === "seasonal" ? copy.seasonal : copy.trend}
      </p>
      <h2 id={`merch-${shelf.id}`} className="mt-2 text-2xl font-bold tracking-tight text-fg">{shelf.title}{shelf.kind === "seasonal" && shelf.eventAt ? ` · ${date(shelf.eventAt)}` : ""}</h2>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        {shelf.kind === "seasonal" ? copy.seasonalNote :
          shelf.evidenceType === 'site_search_interest' ? reasons.interest :
          shelf.evidenceType === 'retailer_bestseller' ? reasons.retailer : reasons.external}
      </p>
      <MerchandisingTracking market={market}>
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shelf.products.map((deal, index) => <li key={deal.id}>
          <DealCard deal={deal} market={market} index={index} tracking={{source:category ? "category" : "home", placement:shelf.kind === "seasonal" ? "seasonal_card" : "trend_card"}} />
          <p className="mt-2 px-1 text-xs leading-relaxed text-fg-muted">
            {shelf.selectionEvidence?.[deal.id]?.matchedQuery ? `${reasons.match} “${shelf.selectionEvidence[deal.id].matchedQuery}”. ` : ''}
            {shelf.selectionEvidence?.[deal.id]?.reviewsVerified ? reasons.reviews : reasons.terms}.
            {shelf.selectionEvidence?.[deal.id]?.arrivalEstimate ? ` ${reasons.arrival}: ${date(shelf.selectionEvidence[deal.id].arrivalEstimate!)}${shelf.selectionEvidence[deal.id].destinationPostalCode ? ` (${shelf.selectionEvidence[deal.id].destinationPostalCode})` : ''}.` : ''}
          </p>
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
