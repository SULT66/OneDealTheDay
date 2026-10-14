import Link from 'next/link';
import type {Language} from '@/lib/i18n';
import type {HalloweenCollection} from '@/lib/merchandising';
import {DealCard} from '@/components/deal/DealCard';
import {MerchandisingTracking} from '@/components/site/MerchandisingTracking';

const COPY={
  en:{home:'Home',title:'Halloween finds',note:'Costumes, masks and spooky decor. Prices, stock and buying terms checked; confirm delivery for your address at the shop.',search:'Search Halloween',sort:'Sort',popular:'Sales evidence first',low:'Price: low to high',high:'Price: high to low',apply:'Find products',count:'checked products',empty:'No matching products right now. Try a different search or check back after the next update.',pick:'Halloween Pick',sold:'sold · eBay estimate/report',arrival:'Estimated arrival',previous:'Previous',next:'Next',page:'Page',terms:'Product reviews and sales totals are shown when verified. A Halloween match alone is not proof of popularity or a discount.'},
  es:{home:'Inicio',title:'Productos Halloween',note:'Disfraces, máscaras y decoración. Precio, stock y condiciones comprobados; confirma la entrega en la tienda.',search:'Buscar Halloween',sort:'Ordenar',popular:'Ventas verificadas primero',low:'Precio: menor a mayor',high:'Precio: mayor a menor',apply:'Buscar productos',count:'productos comprobados',empty:'No hay productos coincidentes ahora. Prueba otra búsqueda o vuelve tras la próxima actualización.',pick:'Selección Halloween',sold:'vendidos · estimación/informe eBay',arrival:'Llegada estimada',previous:'Anterior',next:'Siguiente',page:'Página',terms:'Las reseñas y ventas aparecen cuando están verificadas. Coincidir con Halloween no demuestra popularidad ni descuento.'},
  fr:{home:'Accueil',title:'Produits Halloween',note:'Costumes, masques et décoration. Prix, stock et conditions vérifiés ; confirmez la livraison auprès de la boutique.',search:'Chercher Halloween',sort:'Trier',popular:'Ventes vérifiées en premier',low:'Prix croissant',high:'Prix décroissant',apply:'Chercher',count:'produits vérifiés',empty:'Aucun produit correspondant. Essayez une autre recherche ou revenez après la prochaine mise à jour.',pick:'Sélection Halloween',sold:'vendus · estimation/rapport eBay',arrival:'Arrivée estimée',previous:'Précédent',next:'Suivant',page:'Page',terms:'Avis et ventes affichés lorsqu’ils sont vérifiés. Un produit Halloween ne prouve pas sa popularité ni une réduction.'},
  de:{home:'Startseite',title:'Halloween-Produkte',note:'Kostüme, Masken und Dekoration. Preis, Bestand und Kaufbedingungen geprüft; Lieferung beim Händler bestätigen.',search:'Halloween suchen',sort:'Sortieren',popular:'Belegte Verkäufe zuerst',low:'Preis aufsteigend',high:'Preis absteigend',apply:'Produkte suchen',count:'geprüfte Produkte',empty:'Aktuell keine passenden Produkte. Andere Suche versuchen oder nach dem nächsten Update zurückkommen.',pick:'Halloween-Tipp',sold:'verkauft · eBay-Schätzung/Bericht',arrival:'Voraussichtliche Ankunft',previous:'Zurück',next:'Weiter',page:'Seite',terms:'Bewertungen und Verkaufszahlen werden nur mit Belegen angezeigt. Halloween-Relevanz beweist keine Beliebtheit oder Ersparnis.'}
};
export function HalloweenProducts({market,language,data,q='',sort='popular'}:{market:string;language:Language;data:HalloweenCollection;q?:string;sort?:string}) {
  const copy=COPY[language];
  const pageUrl=(page:number)=>`/${market}?${new URLSearchParams({halloween_page:String(page),halloween_q:q,halloween_sort:sort,lang:language})}#halloween-products`;
  const date=(value:string)=>new Intl.DateTimeFormat(language,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value));
  return <section id="halloween-products" aria-labelledby="halloween-products-title" className="mt-8 scroll-mt-32">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="halloween-products-title" className="text-2xl font-bold tracking-tight">{copy.title}</h2>
      <p className="text-sm font-semibold text-fg-muted">{data.total} {copy.count}</p>
    </div>
    <form className="my-7 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row" method="get" action={`/${market}#halloween-products`}>
      <input type="hidden" name="lang" value={language} />
      <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-fg-muted">{copy.search}<input name="halloween_q" defaultValue={q} maxLength={120} placeholder={copy.search} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg" /></label>
      <label className="flex flex-col gap-1 text-xs font-bold text-fg-muted">{copy.sort}<select name="halloween_sort" defaultValue={sort} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg"><option value="popular">{copy.popular}</option><option value="price-asc">{copy.low}</option><option value="price-desc">{copy.high}</option></select></label>
      <button className="self-end rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700">{copy.apply}</button>
    </form>
    <p className="mb-5 text-xs leading-relaxed text-fg-muted">{copy.terms}</p>
    {!data.products.length ? <p className="rounded-2xl border border-border p-8 text-fg-muted">{copy.empty}</p> : <MerchandisingTracking market={market}>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.products.map((deal,index)=><li key={deal.id} className="flex min-w-0 flex-col">
          <div className="flex-1">
          <DealCard deal={deal} market={market} index={(data.page-1)*24+index} campaignBadge={copy.pick} tracking={{source:'home',placement:'seasonal_card'}} />
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap gap-2 text-xs">
            {data.selectionEvidence[deal.id]?.ebaySoldQuantity != null && <span className="rounded-full bg-amber-100 px-3 py-1.5 font-bold text-amber-950">{new Intl.NumberFormat(language).format(data.selectionEvidence[deal.id].ebaySoldQuantity!)} {copy.sold}</span>}
            {data.selectionEvidence[deal.id]?.arrivalEstimate && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-900">{copy.arrival}: {date(data.selectionEvidence[deal.id].arrivalEstimate!)}</span>}
          </div>
        </li>)}
      </ul>
    </MerchandisingTracking>}
    {data.pages>1 && <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4 text-sm font-bold">
      {data.page>1?<Link className="rounded-full border border-border px-5 py-3" href={pageUrl(data.page-1)}>← {copy.previous}</Link>:<span/>}
      <span>{copy.page} {data.page} / {data.pages}</span>
      {data.page<data.pages?<Link className="rounded-full bg-red-600 px-5 py-3 text-white" href={pageUrl(data.page+1)}>{copy.next} →</Link>:<span/>}
    </nav>}
  </section>;
}
