import {Suspense} from 'react';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getLanguage,type Language} from '@/lib/i18n';
import {getMarket,BACKEND_URL} from '@/lib/catalog';
import {adaptProduct,type RawProduct} from '@/lib/backendAdapter';
import {DealCard} from '@/components/deal/DealCard';
import {activeCampaign} from '@/src/merchandisingCalendar';
const COPY={
  en:{title:'Host mode: no panic.',note:'Make room for good company. Discover cooking essentials, table finds and autumn touches. Confirm delivery to your address at the shop.',all:'All hosting finds',table:'Set the table',kitchen:'In the kitchen',decor:'Autumn details',empty:'More hosting finds are being checked. Explore the collections below while we prepare them.',count:'hosting finds',previous:'Previous',next:'Next',home:'Explore Home & Kitchen',gifts:'Bring a little gift',loading:'Finding a few good reasons to gather…'},
  es:{title:'Todo listo. Sin estrés.',note:'Ideas para cocinar, decorar y compartir. Confirma la entrega en la tienda.',all:'Todo',table:'La mesa',kitchen:'La cocina',decor:'Decoración',empty:'Estamos preparando más productos.',count:'productos',previous:'Anterior',next:'Siguiente',home:'Hogar y cocina',gifts:'Regalos',loading:'Cargando…'},
  fr:{title:'On reçoit. Sans stress.',note:'Des idées pour cuisiner, décorer et partager. Vérifiez la livraison en boutique.',all:'Tout',table:'La table',kitchen:'La cuisine',decor:'Décoration',empty:'De nouvelles trouvailles sont en préparation.',count:'produits',previous:'Précédent',next:'Suivant',home:'Maison et cuisine',gifts:'Cadeaux',loading:'Chargement…'},
  de:{title:'Gäste kommen. Keine Panik.',note:'Entdeckungen zum Kochen, Dekorieren und Feiern. Lieferung beim Händler prüfen.',all:'Alle',table:'Für den Tisch',kitchen:'Für die Küche',decor:'Herbstdeko',empty:'Weitere Angebote werden vorbereitet.',count:'Angebote',previous:'Zurück',next:'Weiter',home:'Haus und Küche',gifts:'Geschenke',loading:'Wird geladen…'},
};
export async function generateMetadata({params}:PageProps<'/[market]/thanksgiving'>):Promise<Metadata>{
  const {market}=await params,language=await getLanguage(market);
  return {title:`Thanksgiving | ${COPY[language].title}`,description:COPY[language].note,alternates:{canonical:`/${market}/thanksgiving`}};
}
export default async function ThanksgivingPage({params,searchParams}:PageProps<'/[market]/thanksgiving'>){
  const {market}=await params;if(!getMarket(market))notFound();
  const language=await getLanguage(market),c=COPY[language],search=await searchParams;
  const q=typeof search.q==='string'?search.q:'',page=Math.max(1,Math.floor(Number(search.page)||1));
  const campaign=activeCampaign({eventKey:'thanksgiving',market,throughEvent:true});
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <header className="overflow-hidden rounded-card bg-[#f4e9d9] bg-cover bg-center px-6 py-12 text-[#101010] sm:px-10" style={{backgroundImage:'linear-gradient(90deg,#f4e9d9,#f4e9d9bb 40%,transparent 85%),url(/campaigns/thanksgiving-editorial-2026.webp)'}}>
      <p className="text-xs font-bold uppercase tracking-widest">Thanksgiving{campaign&&` · ${new Intl.DateTimeFormat(language,{month:'long',day:'numeric',timeZone:'America/New_York'}).format(new Date(campaign.eventAt))}`}</p>
      <h1 className="mt-4 max-w-lg text-4xl font-black uppercase tracking-tight sm:text-5xl">{c.title}</h1><p className="mt-4 max-w-md text-sm leading-relaxed">{c.note}</p>
    </header>
    <nav className="my-7 flex flex-wrap gap-2" aria-label="Thanksgiving">{[['',c.all],['table',c.table],['kitchen',c.kitchen],['decor',c.decor]].map(([key,label])=><a key={key} href={`/${market}/thanksgiving?${new URLSearchParams({q:key,lang:language})}`} aria-current={q===key?'page':undefined} className={`rounded-full border border-border px-4 py-3 text-sm font-bold ${q===key?'bg-lime text-ink':'text-fg'}`}>{label}</a>)}</nav>
    <Suspense key={`${q}:${page}`} fallback={<p aria-busy="true">{c.loading}</p>}><Products market={market} language={language} q={q} page={page}/></Suspense>
    <nav className="mt-10 flex flex-wrap gap-3"><a className="rounded-full bg-lime px-6 py-3 font-bold text-ink" href={`/${market}/category/home-kitchen`}>{c.home} →</a><a className="rounded-full border border-border px-6 py-3 font-bold text-fg" href={`/${market}/category/gifts`}>{c.gifts} →</a></nav>
  </div>;
}
async function Products({market,language,q,page}:{market:string;language:Language;q:string;page:number}){
  const c=COPY[language];let data:{total:number;pages:number;page:number;products:RawProduct[]}|null=null;
  try{const r=await fetch(`${BACKEND_URL}/api/thanksgiving?${new URLSearchParams({market,lang:language,q,page:String(page)})}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok)data=await r.json();}catch{}
  if(!data?.products.length)return <p className="rounded-card border border-border p-8 text-fg-muted" data-odd-transient={!data?'1':undefined}>{c.empty}</p>;
  const href=(n:number)=>`/${market}/thanksgiving?${new URLSearchParams({q,page:String(n),lang:language})}`;
  return <section><p className="mb-5 text-sm text-fg-muted">{data.total} {c.count}</p><ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.products.map((raw,i)=><li key={raw.id}><DealCard market={market} deal={{...adaptProduct(raw),rank:i+1}} index={i} priority={i<4} campaignBadge="Thanksgiving"/></li>)}</ul>
    {data.pages>1&&<nav className="mt-8 flex justify-between text-sm font-bold" aria-label="Pagination">{data.page>1?<a href={href(data.page-1)}>{c.previous}</a>:<span/>}<span>{data.page} / {data.pages}</span>{data.page<data.pages?<a href={href(data.page+1)}>{c.next}</a>:<span/>}</nav>}
  </section>;
}
