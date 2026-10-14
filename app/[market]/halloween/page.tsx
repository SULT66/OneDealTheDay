import type {Metadata} from 'next';
import Link from 'next/link';
import {getLanguage} from '@/lib/i18n';
import {getHalloweenCollection} from '@/lib/merchandising';
import {DealCard} from '@/components/deal/DealCard';
import {MerchandisingTracking} from '@/components/site/MerchandisingTracking';

const COPY={
  en:{home:'Home',title:'Halloween finds',note:'Costumes, masks and spooky decor. Prices, stock and buying terms checked; confirm delivery for your address at the shop.',search:'Search Halloween',sort:'Sort',popular:'Sales evidence first',low:'Price: low to high',high:'Price: high to low',apply:'Find products',count:'checked products',empty:'No matching products right now. Try a different search or check back after the next update.',pick:'Halloween Pick',sold:'sold · eBay estimate/report',arrival:'Estimated arrival',previous:'Previous',next:'Next',page:'Page',terms:'Product reviews and sales totals are shown when verified. A Halloween match alone is not proof of popularity or a discount.'},
  es:{home:'Inicio',title:'Productos Halloween',note:'Disfraces, máscaras y decoración. Precio, stock y condiciones comprobados; confirma la entrega en la tienda.',search:'Buscar Halloween',sort:'Ordenar',popular:'Ventas verificadas primero',low:'Precio: menor a mayor',high:'Precio: mayor a menor',apply:'Buscar productos',count:'productos comprobados',empty:'No hay productos coincidentes ahora. Prueba otra búsqueda o vuelve tras la próxima actualización.',pick:'Selección Halloween',sold:'vendidos · estimación/informe eBay',arrival:'Llegada estimada',previous:'Anterior',next:'Siguiente',page:'Página',terms:'Las reseñas y ventas aparecen cuando están verificadas. Coincidir con Halloween no demuestra popularidad ni descuento.'},
  fr:{home:'Accueil',title:'Produits Halloween',note:'Costumes, masques et décoration. Prix, stock et conditions vérifiés ; confirmez la livraison auprès de la boutique.',search:'Chercher Halloween',sort:'Trier',popular:'Ventes vérifiées en premier',low:'Prix croissant',high:'Prix décroissant',apply:'Chercher',count:'produits vérifiés',empty:'Aucun produit correspondant. Essayez une autre recherche ou revenez après la prochaine mise à jour.',pick:'Sélection Halloween',sold:'vendus · estimation/rapport eBay',arrival:'Arrivée estimée',previous:'Précédent',next:'Suivant',page:'Page',terms:'Avis et ventes affichés lorsqu’ils sont vérifiés. Un produit Halloween ne prouve pas sa popularité ni une réduction.'},
  de:{home:'Startseite',title:'Halloween-Produkte',note:'Kostüme, Masken und Dekoration. Preis, Bestand und Kaufbedingungen geprüft; Lieferung beim Händler bestätigen.',search:'Halloween suchen',sort:'Sortieren',popular:'Belegte Verkäufe zuerst',low:'Preis aufsteigend',high:'Preis absteigend',apply:'Produkte suchen',count:'geprüfte Produkte',empty:'Aktuell keine passenden Produkte. Andere Suche versuchen oder nach dem nächsten Update zurückkommen.',pick:'Halloween-Tipp',sold:'verkauft · eBay-Schätzung/Bericht',arrival:'Voraussichtliche Ankunft',previous:'Zurück',next:'Weiter',page:'Seite',terms:'Bewertungen und Verkaufszahlen werden nur mit Belegen angezeigt. Halloween-Relevanz beweist keine Beliebtheit oder Ersparnis.'}
};
export const metadata:Metadata={title:'Halloween finds',robots:{index:false,follow:true}};
export default async function HalloweenPage({params,searchParams}:{params:Promise<{market:string}>,searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {market}=await params, search=await searchParams;
  const language=await getLanguage(market), copy=COPY[language];
  const q=typeof search.q==='string'?search.q.slice(0,120):'';
  const sort=typeof search.sort==='string'?search.sort:'popular';
  const data=await getHalloweenCollection(market,language,Number(search.page) || 1,q,sort);
  const pageUrl=(page:number)=>`/${market}/halloween?${new URLSearchParams({page:String(page),q,sort})}`;
  const date=(value:string)=>new Intl.DateTimeFormat(language,{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value));
  return <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
    <Link href={`/${market}`} className="text-sm text-fg-muted">← {copy.home}</Link>
    <div className="mt-5 rounded-3xl bg-gradient-to-br from-red-950 via-red-900 to-orange-900 p-7 text-white sm:p-10">
      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest">{date(`${new Date().getUTCFullYear()}-10-31T00:00:00Z`)}</span>
      <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">{copy.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-red-100 sm:text-base">{copy.note}</p>
      <p className="mt-5 text-lg font-bold">{data.total} {copy.count}</p>
    </div>
    <form className="my-7 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row" method="get">
      <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-fg-muted">{copy.search}<input name="q" defaultValue={q} maxLength={120} placeholder={copy.search} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg" /></label>
      <label className="flex flex-col gap-1 text-xs font-bold text-fg-muted">{copy.sort}<select name="sort" defaultValue={sort} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg"><option value="popular">{copy.popular}</option><option value="price-asc">{copy.low}</option><option value="price-desc">{copy.high}</option></select></label>
      <button className="self-end rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700">{copy.apply}</button>
    </form>
    <p className="mb-5 text-xs leading-relaxed text-fg-muted">{copy.terms}</p>
    {!data.products.length ? <p className="rounded-2xl border border-border p-8 text-fg-muted">{copy.empty}</p> : <MerchandisingTracking market={market}>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.products.map((deal,index)=><li key={deal.id}>
          <DealCard deal={deal} market={market} index={(data.page-1)*24+index} campaignBadge={copy.pick} tracking={{source:'category',placement:'seasonal_card'}} />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
  </div>;
}
