import Link from 'next/link';
import {BACKEND_URL} from '@/lib/catalog';
import {adaptProduct,type RawProduct} from '@/lib/backendAdapter';
import {DealCard} from '@/components/deal/DealCard';
import {SectionHeader} from './SectionHeader';
import type {Language} from '@/lib/i18n';
import {isHolidaySeason} from '@/src/holidayCatalog';
const COPY = {
  en:{eyebrow:'Less scrolling. Better gifting.',title:'Find their kind of holiday magic.',all:'All holiday finds',budget:'A little gift. A big smile.',under:'Gifts under',kids:'For kids',home:'For the home',tech:'For tech lovers',creative:'For creative minds',decor:'Trees & decor',lights:'Make it glow',party:'New Year party',badge:'Holiday find',note:'Choose a budget or an interest. Keep exploring from there.'},
  es:{eyebrow:'Encuentra el regalo',title:'Un poco de magia para todos.',all:'Ver todo',budget:'Pequeños regalos. Grandes sonrisas.',under:'Regalos por menos de',kids:'Para niños',home:'Para el hogar',tech:'Tecnología',creative:'Creatividad',decor:'Árboles y decoración',lights:'Luces',party:'Año Nuevo',badge:'Fiestas',note:'Elige un presupuesto o un interés.'},
  fr:{eyebrow:'Des idées à offrir',title:'Un peu de magie pour chacun.',all:'Tout découvrir',budget:'Petits cadeaux. Grands sourires.',under:'Cadeaux à moins de',kids:'Pour les enfants',home:'Pour la maison',tech:'Passion tech',creative:'Créativité',decor:'Sapins et décoration',lights:'Lumières',party:'Nouvel An',badge:'Fêtes',note:'Choisissez un budget ou une envie.'},
  de:{eyebrow:'Geschenke entdecken',title:'Ein wenig Festzauber für alle.',all:'Alle entdecken',budget:'Kleine Geschenke. Großes Lächeln.',under:'Geschenke unter',kids:'Für Kinder',home:'Für zu Hause',tech:'Für Technikfans',creative:'Für Kreative',decor:'Bäume und Deko',lights:'Lichter',party:'Silvester',badge:'Festliche Auswahl',note:'Wähle ein Budget oder ein Interesse.'},
};
export async function HolidayDiscovery({market,language}:{market:string;language:Language}) {
  if(!isHolidaySeason())return null;
  const c=COPY[language];
  let products:RawProduct[]=[];
  try {const r=await fetch(`${BACKEND_URL}/api/holiday?${new URLSearchParams({market,lang:language,preview:'1'})}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.ok)products=(await r.json()).products||[];}catch{}
  const currency=market==='uk'?'GBP':market==='de'||market==='fr'?'EUR':market==='ca'?'CAD':'USD';
  return <section aria-labelledby="holiday-discovery-title" className="mt-10 space-y-6">
    <SectionHeader id="holiday-discovery-title" eyebrow={c.eyebrow} title={c.title} action={{href:`/${market}/holiday`,label:c.all}}/>
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {[['decor',c.decor,'✦'],['lights',c.lights,'✺'],['new-year',c.party,'✧']].map(([q,label,icon],i)=><Link key={q} href={`/${market}/holiday?q=${q}`} className={`rounded-tile border border-border p-4 transition-transform hover:-translate-y-1 sm:p-6 ${i===1?'bg-lime text-ink':'bg-surface text-fg'}`}><span aria-hidden="true" className="text-3xl">{icon}</span><span className="mt-3 block text-sm font-bold sm:text-lg">{label} →</span></Link>)}
    </div>
    {products.length>0&&<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((raw,i)=><li key={raw.id}><DealCard market={market} deal={{...adaptProduct(raw),rank:i+1}} index={i} priority={i<4} campaignBadge={c.badge} tracking={{source:'home',placement:'seasonal_card'}}/></li>)}</ul>}
    <div className="rounded-card border border-border bg-surface p-5 sm:p-7">
      <h3 className="text-xl font-bold text-fg">{c.budget}</h3><p className="mt-2 text-sm text-fg-muted">{c.note}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{[25,50,100].map(max=><Link key={max} href={`/${market}/category/gifts?max=${max}`} className="rounded-xl bg-lime px-5 py-4 text-center font-bold text-ink">{c.under} {new Intl.NumberFormat(language,{style:'currency',currency,maximumFractionDigits:0}).format(max)} →</Link>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">{[['toys-games',c.kids],['home-kitchen',c.home],['electronics',c.tech],['arts-crafts',c.creative]].map(([slug,label])=><Link key={slug} href={`/${market}/category/${slug}`} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg hover:border-fg">{label} →</Link>)}</div>
    </div>
  </section>;
}
