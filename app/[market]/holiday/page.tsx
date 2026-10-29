import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLanguage, type Language } from '@/lib/i18n';
import { getMarket, BACKEND_URL } from '@/lib/catalog';
import { adaptProduct, type RawProduct } from '@/lib/backendAdapter';
import { DealCard } from '@/components/deal/DealCard';

const COPY = {
  en:{title:'Christmas & New Year finds',note:'Decorations, lights, thoughtful gifts and little reasons to celebrate. Check delivery for your address at the retailer.',all:'All festive finds',decor:'Trees & decor',lights:'Lights',gifts:'Gifts',party:'New Year',loading:'Finding a little holiday magic…',empty:'The holiday collection is being prepared. More checked finds will appear here as they are added.',count:'holiday finds',previous:'Previous',next:'Next',sort:'Sort',popular:'Featured',low:'Price: low to high',high:'Price: high to low'},
  es:{title:'Navidad y Año Nuevo',note:'Decoración, luces y regalos. Confirma la entrega para tu dirección en la tienda.',all:'Todo',decor:'Árboles y decoración',lights:'Luces',gifts:'Regalos',party:'Año Nuevo',loading:'Cargando productos…',empty:'Estamos preparando la colección de fiestas.',count:'productos',previous:'Anterior',next:'Siguiente',sort:'Ordenar',popular:'Destacados',low:'Precio: menor a mayor',high:'Precio: mayor a menor'},
  fr:{title:'Noël et Nouvel An',note:'Décorations, lumières et cadeaux. Vérifiez la livraison auprès du marchand.',all:'Tout',decor:'Sapins et décoration',lights:'Lumières',gifts:'Cadeaux',party:'Nouvel An',loading:'Chargement…',empty:'La collection des fêtes est en préparation.',count:'produits',previous:'Précédent',next:'Suivant',sort:'Trier',popular:'Sélection',low:'Prix croissant',high:'Prix décroissant'},
  de:{title:'Weihnachten & Neujahr',note:'Dekoration, Lichter und Geschenke. Prüfe die Lieferung an deine Adresse beim Händler.',all:'Alle',decor:'Bäume und Deko',lights:'Lichter',gifts:'Geschenke',party:'Neujahr',loading:'Produkte werden geladen…',empty:'Die festliche Auswahl wird vorbereitet.',count:'Produkte',previous:'Zurück',next:'Weiter',sort:'Sortieren',popular:'Auswahl',low:'Preis aufsteigend',high:'Preis absteigend'},
};
export async function generateMetadata({params}:PageProps<'/[market]/holiday'>):Promise<Metadata> {
  const {market}=await params,language=await getLanguage(market);
  return {title:COPY[language].title,description:COPY[language].note,alternates:{canonical:`/${market}/holiday`}};
}
export default async function HolidayPage({params,searchParams}:PageProps<'/[market]/holiday'>) {
  const {market}=await params;if(!getMarket(market))notFound();
  const search=await searchParams,language=await getLanguage(market),copy=COPY[language];
  const q=typeof search.q==='string'?search.q.slice(0,100):'';
  const sort=typeof search.sort==='string'?search.sort:'popular';
  const page=Math.max(1,Math.floor(Number(search.page)||1));
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <div className="overflow-hidden rounded-card bg-[#09241c] bg-cover bg-center px-6 py-10 text-white sm:px-10" style={{backgroundImage:'linear-gradient(90deg,#09241cf2,#09241c99,transparent),url(/campaigns/holiday-2026.webp)'}}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#e9c982]">OneDailyDrop · Holiday collection</p>
      <h1 className="mt-3 max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/85">{copy.note}</p>
    </div>
    <nav className="my-7 flex flex-wrap gap-2" aria-label={copy.title}>
      {[['',copy.all],['decor',copy.decor],['lights',copy.lights],['gifts',copy.gifts],['new-year',copy.party]].map(([key,label])=><a key={key} aria-current={q===key?'page':undefined} href={`/${market}/holiday?${new URLSearchParams({q:key,sort,lang:language})}`} className={`rounded-full border px-4 py-2 text-sm font-semibold ${q===key?'border-[#0c4a38] bg-[#0c4a38] text-white':'border-border text-fg'}`}>{label}</a>)}
    </nav>
    <form method="get" className="mb-6 flex items-center gap-3"><input type="hidden" name="q" value={q}/><input type="hidden" name="lang" value={language}/>
      <label className="text-sm text-fg-muted">{copy.sort} <select name="sort" defaultValue={sort} className="ml-2 rounded-full border border-border bg-surface px-3 py-2 text-fg"><option value="popular">{copy.popular}</option><option value="price-asc">{copy.low}</option><option value="price-desc">{copy.high}</option></select></label>
      <button className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink">{copy.sort}</button>
    </form>
    <Suspense key={`${q}:${sort}:${page}`} fallback={<div aria-busy="true" className="rounded-card bg-surface p-10 text-fg-muted">{copy.loading}</div>}>
      <Products market={market} language={language} q={q} sort={sort} page={page}/>
    </Suspense>
  </div>;
}
async function Products({market,language,q,sort,page}:{market:string;language:Language;q:string;sort:string;page:number}) {
  const copy=COPY[language];
  let data:{total:number;pages:number;page:number;products:RawProduct[]}|null=null;
  try {const response=await fetch(`${BACKEND_URL}/api/holiday?${new URLSearchParams({market,lang:language,q,sort,page:String(page)})}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok)data=await response.json();}catch{}
  if(!data)return <p data-odd-transient="1" className="rounded-card border border-border p-8 text-fg-muted">{copy.empty}</p>;
  const href=(n:number)=>`/${market}/holiday?${new URLSearchParams({q,sort,page:String(n),lang:language})}`;
  return <section><p className="mb-5 text-sm text-fg-muted">{data.total} {copy.count}</p>
    {!data.products.length?<p className="rounded-card border border-border p-8 text-fg-muted">{copy.empty}</p>:<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.products.map((raw,i)=><li key={raw.id}><DealCard market={market} deal={{...adaptProduct(raw),rank:(data!.page-1)*24+i+1}} index={i} priority={i<3} campaignBadge={copy.title}/></li>)}</ul>}
    {data.pages>1&&<nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm font-semibold">{data.page>1?<a href={href(data.page-1)}>{copy.previous}</a>:<span/>}<span>{data.page} / {data.pages}</span>{data.page<data.pages?<a href={href(data.page+1)}>{copy.next}</a>:<span/>}</nav>}
  </section>;
}
