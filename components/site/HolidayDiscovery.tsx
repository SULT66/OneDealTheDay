import Link from 'next/link';
import {BACKEND_URL} from '@/lib/catalog';
import {adaptProduct,type RawProduct} from '@/lib/backendAdapter';
import {DealCard} from '@/components/deal/DealCard';
import {SectionHeader} from './SectionHeader';
import type {Language} from '@/lib/i18n';
import {isNewYearSpotlight} from '@/src/holidayCatalog';

const COPY = {
  en:{title:'Holiday gifts by budget',all:'All holiday finds',under:'Gifts under',party:'New Year’s Eve party',lastMinute:'Last-Minute Gifts',delivery:'Check delivery at the retailer',badge:'Gift pick',partyNote:'Table settings, photo backdrops, countdown decorations and party lights.'},
  es:{title:'Regalos navideños por presupuesto',all:'Ver todo',under:'Regalos por menos de',party:'Fiesta de Año Nuevo',lastMinute:'Regalos de última hora',delivery:'Comprueba la entrega en la tienda',badge:'Idea de regalo',partyNote:'Mesa, fondos para fotos, decoración y luces para la fiesta.'},
  fr:{title:'Cadeaux de fêtes par budget',all:'Tout découvrir',under:'Cadeaux à moins de',party:'Fête du Nouvel An',lastMinute:'Cadeaux de dernière minute',delivery:'Vérifiez la livraison chez le marchand',badge:'Idée cadeau',partyNote:'Décoration de table, fonds photo, accessoires et lumières de fête.'},
  de:{title:'Geschenke nach Budget',all:'Alle entdecken',under:'Geschenke unter',party:'Silvesterparty',lastMinute:'Last-Minute-Geschenke',delivery:'Lieferung beim Händler prüfen',badge:'Geschenktipp',partyNote:'Tischdeko, Fotohintergründe, Countdown-Deko und Partylichter.'},
};

const RECIPIENTS = {
  en:{games:'For game nights',coffee:'For coffee lovers',kids:'For kids',tech:'For tech lovers',home:'For the home',creative:'For creatives',travel:'For travelers',wellness:'For winding down',personalized:'For a personal touch'},
  es:{games:'Para jugar en grupo',coffee:'Para amantes del café',kids:'Para niños',tech:'Para amantes de la tecnología',home:'Para el hogar',creative:'Para creativos',travel:'Para viajeros',wellness:'Para relajarse',personalized:'Para personalizar'},
  fr:{games:'Pour les soirées jeux',coffee:'Pour les amateurs de café',kids:'Pour les enfants',tech:'Pour les passionnés de tech',home:'Pour la maison',creative:'Pour les créatifs',travel:'Pour les voyageurs',wellness:'Pour se détendre',personalized:'À personnaliser'},
  de:{games:'Für Spieleabende',coffee:'Für Kaffeefans',kids:'Für Kinder',tech:'Für Technikfans',home:'Für zu Hause',creative:'Für Kreative',travel:'Für Reisende',wellness:'Zum Entspannen',personalized:'Für eine persönliche Note'},
};
type GiftGroup = keyof typeof RECIPIENTS.en;
type Preview = {products:RawProduct[];giftGroups?:Record<string,GiftGroup>};

async function getPreview(market:string, language:Language, q:string):Promise<Preview|null> {
  const query = new URLSearchParams({market,lang:language,q,preview:'1'});
  try {
    const response = await fetch(`${BACKEND_URL}/api/holiday?${query}`, {cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (response.ok) return await response.json();
  } catch {}
  return null;
}

export async function HolidayDiscovery({market,language}:{market:string;language:Language}) {
  const copy = COPY[language];
  const showParty = isNewYearSpotlight();
  const [gifts, party] = await Promise.all([
    getPreview(market, language, 'gift-guide'),
    showParty ? getPreview(market, language, 'new-year') : {products:[]},
  ]);
  const currency = market==='uk'?'GBP':market==='de'||market==='fr'?'EUR':market==='ca'?'CAD':'USD';
  const collection = `/${market}/holiday`;
  const holidayHref = (q:string, max?:number) => `${collection}?${new URLSearchParams({q,lang:language,...(max ? {max:String(max)} : {})})}`;

  return <div data-odd-transient={gifts === null || party === null ? '1' : undefined}>
    <section aria-labelledby="holiday-discovery-title" className="mt-8 space-y-4">
      <SectionHeader id="holiday-discovery-title" title={copy.title} action={{href:collection,label:copy.all}}/>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[25,50,100].map(max=><Link key={max} href={holidayHref('gift-guide',max)} className="rounded-xl bg-lime px-2 py-3 text-center text-sm font-bold text-ink sm:px-5 sm:py-4 sm:text-base">
          {copy.under} {new Intl.NumberFormat(language,{style:'currency',currency,maximumFractionDigits:0}).format(max)}
        </Link>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={holidayHref('new-year')} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg hover:border-fg">{copy.party}</Link>
        {market==='us' && <Link href={holidayHref('last-minute')} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg hover:border-fg">{copy.lastMinute}</Link>}
      </div>
      {gifts && gifts.products.length > 0 && <><p className="text-sm text-fg-muted">{copy.delivery}</p><HolidayCards data={gifts} market={market} language={language} badge={copy.badge}/></>}
    </section>
    {party && party.products.length > 0 && <section aria-labelledby="holiday-party-title" className="mt-10 space-y-4">
      <SectionHeader id="holiday-party-title" title={copy.party} action={{href:holidayHref('new-year'),label:copy.all}}/>
      <p className="text-sm text-fg-muted">{copy.partyNote}</p>
      <HolidayCards data={party} market={market} language={language} badge={copy.party}/>
    </section>}
  </div>;
}

function HolidayCards({data,market,language,badge}:{data:Preview;market:string;language:Language;badge:string}) {
  return <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{data.products.map((raw,i)=>{
    const group = data.giftGroups?.[raw.id];
    return <li className="min-w-0" key={raw.id}>
    <DealCard market={market} deal={{...adaptProduct(raw),rank:i+1}} index={i} priority={i<2} campaignBadge={group ? RECIPIENTS[language][group] : badge} tracking={{source:'home',placement:'seasonal_card'}}/>
  </li>;})}</ul>;
}
