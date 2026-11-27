import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLanguage, type Language } from '@/lib/i18n';
import { getMarket, BACKEND_URL } from '@/lib/catalog';
import { adaptProduct, type RawProduct } from '@/lib/backendAdapter';
import { normalizeGiftZip } from '@/src/holidayCatalog';
import { DealCard } from '@/components/deal/DealCard';

const COPY = {
  en:{title:'Christmas & New Year finds',note:'Decorations, lights, thoughtful gifts and little reasons to celebrate. Check delivery for your address at the retailer.',all:'All festive finds',decor:'Trees & decor',lights:'Lights',gifts:'Gifts',party:'New Year',loading:'Finding a little holiday magic…',empty:'The holiday collection is being prepared. More checked finds will appear here as they are added.',count:'holiday finds',previous:'Previous',next:'Next',sort:'Sort',popular:'Featured',low:'Price: low to high',high:'Price: high to low'},
  es:{title:'Navidad y Año Nuevo',note:'Decoración, luces y regalos. Confirma la entrega para tu dirección en la tienda.',all:'Todo',decor:'Árboles y decoración',lights:'Luces',gifts:'Regalos',party:'Año Nuevo',loading:'Cargando productos…',empty:'Estamos preparando la colección de fiestas.',count:'productos',previous:'Anterior',next:'Siguiente',sort:'Ordenar',popular:'Destacados',low:'Precio: menor a mayor',high:'Precio: mayor a menor'},
  fr:{title:'Noël et Nouvel An',note:'Décorations, lumières et cadeaux. Vérifiez la livraison auprès du marchand.',all:'Tout',decor:'Sapins et décoration',lights:'Lumières',gifts:'Cadeaux',party:'Nouvel An',loading:'Chargement…',empty:'La collection des fêtes est en préparation.',count:'produits',previous:'Précédent',next:'Suivant',sort:'Trier',popular:'Sélection',low:'Prix croissant',high:'Prix décroissant'},
  de:{title:'Weihnachten & Neujahr',note:'Dekoration, Lichter und Geschenke. Prüfe die Lieferung an deine Adresse beim Händler.',all:'Alle',decor:'Bäume und Deko',lights:'Lichter',gifts:'Geschenke',party:'Neujahr',loading:'Produkte werden geladen…',empty:'Die festliche Auswahl wird vorbereitet.',count:'Produkte',previous:'Zurück',next:'Weiter',sort:'Sortieren',popular:'Auswahl',low:'Preis aufsteigend',high:'Preis absteigend'},
};
const SHOPPING = {
  en:{guide:'Gift guide',party:'New Year’s Eve party',partyNote:'Table settings, photo backdrops, countdown decorations and party lights.',lastMinute:'Last-Minute Gifts',lastMinuteNote:'Enter a US ZIP code to find gifts with a recent merchant estimate by December 24. Confirm the estimate at checkout.',zip:'US ZIP code',check:'Show delivery estimates',arrival:'Retailer estimates arrival by',noArrival:'No recent merchant estimates by December 24 for this ZIP code.',seeGifts:'Browse all gift picks and check delivery at the retailer',stock:'Check delivery for your ZIP at the retailer.',under:'Gifts under',allBudgets:'Any budget',error:'The holiday collection is temporarily unavailable. Try again shortly.'},
  es:{guide:'Guía de regalos',party:'Fiesta de Año Nuevo',partyNote:'Mesa, fondos para fotos, decoración y luces para la fiesta.',lastMinute:'Regalos de última hora',lastMinuteNote:'Introduce un código postal de EE. UU. para ver regalos con entrega estimada hasta el 24 de diciembre. Confirma el plazo al pagar.',zip:'Código postal de EE. UU.',check:'Ver plazos de entrega',arrival:'Entrega estimada por la tienda para el',noArrival:'No hay estimaciones recientes hasta el 24 de diciembre para este código postal.',seeGifts:'Ver los regalos y consultar la entrega en la tienda',stock:'Consulta la entrega para tu código postal en la tienda.',under:'Regalos por menos de',allBudgets:'Cualquier presupuesto',error:'La colección no está disponible temporalmente. Inténtalo en breve.'},
  fr:{guide:'Guide cadeaux',party:'Fête du Nouvel An',partyNote:'Décoration de table, fonds photo, accessoires et lumières de fête.',lastMinute:'Cadeaux de dernière minute',lastMinuteNote:'Saisissez un code postal américain pour les cadeaux dont la livraison est estimée au plus tard le 24 décembre. Confirmez chez le marchand.',zip:'Code postal américain',check:'Voir les estimations',arrival:'Livraison estimée par le marchand au',noArrival:'Aucune estimation récente au plus tard le 24 décembre pour ce code postal.',seeGifts:'Voir les cadeaux et vérifier la livraison chez le marchand',stock:'Vérifiez la livraison pour votre code postal chez le marchand.',under:'Cadeaux à moins de',allBudgets:'Tous les budgets',error:'La collection est temporairement indisponible. Réessayez dans un instant.'},
  de:{guide:'Geschenkideen',party:'Silvesterparty',partyNote:'Tischdeko, Fotohintergründe, Countdown-Deko und Partylichter.',lastMinute:'Last-Minute-Geschenke',lastMinuteNote:'Gib eine US-Postleitzahl ein, um Geschenke mit einer Lieferprognose bis zum 24. Dezember zu finden. Prüfe den Termin beim Bezahlen.',zip:'US-Postleitzahl',check:'Lieferprognosen anzeigen',arrival:'Voraussichtliche Lieferung laut Händler bis',noArrival:'Keine aktuellen Händlerprognosen bis zum 24. Dezember für diese Postleitzahl.',seeGifts:'Geschenke ansehen und Lieferung beim Händler prüfen',stock:'Prüfe die Lieferung für deine Postleitzahl beim Händler.',under:'Geschenke unter',allBudgets:'Jedes Budget',error:'Die Festtagsauswahl ist vorübergehend nicht verfügbar. Versuche es gleich noch einmal.'},
};

export async function generateMetadata({params}:PageProps<'/[market]/holiday'>):Promise<Metadata> {
  const {market} = await params, language = await getLanguage(market);
  return {title:COPY[language].title,description:COPY[language].note,alternates:{canonical:`/${market}/holiday`}};
}

type Filters = {q:string;sort:string;page:number;max:string;zip:string};
function queryString({q,sort,page,max,zip}:Filters, language:Language) {
  return new URLSearchParams({q,sort,page:String(page),lang:language,...(max ? {max} : {}),...(zip ? {zip} : {})});
}

export default async function HolidayPage({params,searchParams}:PageProps<'/[market]/holiday'>) {
  const {market} = await params;
  const info = getMarket(market);
  if (!info) notFound();
  const search = await searchParams, language = await getLanguage(market), copy = COPY[language], shopping = SHOPPING[language];
  const q = typeof search.q === 'string' ? search.q.slice(0,100) : '';
  const sort = search.sort === 'price-asc' || search.sort === 'price-desc' ? search.sort : 'popular';
  const page = Math.max(1,Math.floor(Number(search.page)||1));
  const lastMinute = q === 'last-minute' && market === 'us';
  const giftGuide = q === 'gift-guide';
  const party = q === 'new-year';
  const max = giftGuide && typeof search.max === 'string' && ['25','50','100'].includes(search.max) ? search.max : '';
  const zip = lastMinute ? normalizeGiftZip(search.zip) : '';
  const filters = {q,sort,page,max,zip};
  const title = lastMinute ? shopping.lastMinute : giftGuide ? shopping.guide : party ? shopping.party : copy.title;
  const link = (changes:Partial<Filters>) => `/${market}/holiday?${queryString({...filters,page:1,...changes},language)}`;
  const links = [['',copy.all],['decor',copy.decor],['lights',copy.lights],['gift-guide',shopping.guide],['new-year',shopping.party]];
  if (market === 'us') links.push(['last-minute',shopping.lastMinute]);
  const currency = market==='uk'?'GBP':market==='de'||market==='fr'?'EUR':market==='ca'?'CAD':'USD';

  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <div className="overflow-hidden rounded-card bg-[#f6f1e7] bg-cover bg-center px-6 py-10 text-[#101010] sm:px-10" style={{backgroundImage:'linear-gradient(90deg,#f6f1e7,#f6f1e7cc 45%,transparent),url(/campaigns/holiday-editorial-2026.webp)'}}>
      <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#101010]">{lastMinute ? shopping.lastMinuteNote : giftGuide ? shopping.stock : party ? shopping.partyNote : copy.note}</p>
    </div>
    <nav className="my-7 flex flex-wrap gap-2" aria-label={copy.title}>
      {links.map(([key,label])=><a key={key} aria-current={q===key?'page':undefined} href={link({q:key,max:'',zip:''})} className={chipClass(q===key)}>{label}</a>)}
    </nav>
    {giftGuide && <nav aria-label={shopping.guide} className="mb-6 flex flex-wrap gap-2">
      {['','25','50','100'].map(cap=><a key={cap} aria-current={max===cap?'page':undefined} href={link({max:cap})} className={chipClass(max===cap)}>
        {cap ? `${shopping.under} ${new Intl.NumberFormat(language,{style:'currency',currency,maximumFractionDigits:0}).format(Number(cap))}` : shopping.allBudgets}
      </a>)}
    </nav>}
    {lastMinute && <form action={`/${market}/holiday`} method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <input type="hidden" name="q" value={q}/><input type="hidden" name="lang" value={language}/>
      <label className="flex flex-col gap-1 text-sm font-semibold text-fg">{shopping.zip}
        <input className="w-36 rounded-xl border border-border bg-surface px-3 py-2 text-fg" name="zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} required defaultValue={zip}/>
      </label>
      <button className="rounded-xl bg-lime px-4 py-2 text-sm font-bold text-ink">{shopping.check}</button>
    </form>}
    {(!lastMinute || zip) ? <>
      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        <input type="hidden" name="q" value={q}/><input type="hidden" name="lang" value={language}/>
        {max && <input type="hidden" name="max" value={max}/>}
        {zip && <input type="hidden" name="zip" value={zip}/>}
        <label className="text-sm text-fg-muted">{copy.sort} <select name="sort" defaultValue={sort} className="ml-2 rounded-full border border-border bg-surface px-3 py-2 text-fg"><option value="popular">{copy.popular}</option><option value="price-asc">{copy.low}</option><option value="price-desc">{copy.high}</option></select></label>
        <button className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink">{copy.sort}</button>
      </form>
      <Suspense key={queryString(filters,language).toString()} fallback={<div aria-busy="true" className="rounded-card bg-surface p-10 text-fg-muted">{copy.loading}</div>}>
        <Products market={market} language={language} filters={filters} title={title} lastMinute={lastMinute}/>
      </Suspense>
    </> : <a href={link({q:'gift-guide'})} className="text-sm font-semibold underline">{shopping.seeGifts}</a>}
  </div>;
}

const chipClass = (selected:boolean) => `rounded-full border px-4 py-2 text-sm font-semibold ${selected?'border-[#0c4a38] bg-[#0c4a38] text-white':'border-border text-fg'}`;

async function Products({market,language,filters,title,lastMinute}:{market:string;language:Language;filters:Filters;title:string;lastMinute:boolean}) {
  const copy = COPY[language], shopping = SHOPPING[language];
  const query = queryString(filters,language);
  query.set('market',market);
  let data:{total:number;pages:number;page:number;products:RawProduct[];arrivalDates?:Record<string,string>}|null = null;
  try {
    const response = await fetch(`${BACKEND_URL}/api/holiday?${query}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (response.ok) data = await response.json();
  } catch {}
  if (!data) return <p data-odd-transient="1" className="rounded-card border border-border p-8 text-fg-muted">{shopping.error}</p>;
  if (!data.products.length) return <p className="rounded-card border border-border p-8 text-fg-muted">
    {lastMinute ? <>{shopping.noArrival} <a className="font-semibold underline" href={`/${market}/holiday?q=gift-guide&lang=${language}`}>{shopping.seeGifts}</a></> : copy.empty}
  </p>;
  const {products, page, pages, total, arrivalDates} = data;
  const href = (n:number) => `/${market}/holiday?${queryString({...filters,page:n},language)}`;
  const date = new Intl.DateTimeFormat(language,{month:'short',day:'numeric',timeZone:'UTC'});
  return <section>
    <p className="mb-5 text-sm text-fg-muted">{total} {copy.count}</p>
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((raw,i)=>{
      const arrival = arrivalDates?.[raw.id];
      return <li key={raw.id} className="min-w-0">
        <DealCard market={market} deal={{...adaptProduct(raw),rank:(page-1)*24+i+1}} index={i} priority={i<3} campaignBadge={title}/>
        {arrival && <p className="mt-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-fg">{shopping.arrival} <time dateTime={arrival}>{date.format(new Date(arrival))}</time></p>}
      </li>;
    })}</ul>
    {pages>1&&<nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm font-semibold">{page>1?<a href={href(page-1)}>{copy.previous}</a>:<span/>}<span>{page} / {pages}</span>{page<pages?<a href={href(page+1)}>{copy.next}</a>:<span/>}</nav>}
  </section>;
}
