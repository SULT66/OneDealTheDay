import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import type { Language } from "@/lib/i18n";
import { CampaignCarousel, type CampaignSlide } from "@/components/site/CampaignCarousel";

type Copy = {
  eyebrow: string; title: string; note: string; lateNote: string; shop: string; categories: string[];
  bfEyebrow: string; bfTitle: string; bfNote: string; bfShop: string;
  browse: string; drop: string; dropNote: string; daily: string;
  everyday: string; everydayNote: string; hero: string;
};

const COPY: Record<Language, Copy> = {
  en: {eyebrow:"Halloween · October 31",title:"A little spooky.\nA lot of fun.",note:"Costumes, decorations & party finds for October 31.",lateNote:"October 31 is close. Check each seller's delivery estimate before you count on it arriving.",shop:"Explore Halloween",categories:["Costumes","Decorations","Party supplies"],
    bfEyebrow:"Black Friday · November 27",bfTitle:"We are already\nwriting the prices down.",bfNote:"Eight weeks of our own records, so on the day you can see which discounts are real and which were always that price.",bfShop:"See the price diary",
    browse:"Browse all finds",drop:"One day. One pick.",dropNote:"Meet today's Daily Drop.",daily:"See today's pick",everyday:"Find your next good buy.",everydayNote:"Explore products with price, seller and buying terms checked.",hero:"Campaigns"},
  es: {eyebrow:"Halloween · 31 de octubre",title:"Un poco de miedo.\nMucha diversión.",note:"Disfraces, decoración e ideas para tu fiesta.",lateNote:"El 31 de octubre está cerca. Comprueba el plazo de entrega de cada vendedor antes de contar con él.",shop:"Explorar Halloween",categories:["Disfraces","Decoración","Fiesta"],
    bfEyebrow:"Black Friday · 27 de noviembre",bfTitle:"Ya estamos\napuntando los precios.",bfNote:"Ocho semanas de registros propios para que ese día veas qué descuentos son reales y cuáles siempre costaron lo mismo.",bfShop:"Ver el diario de precios",
    browse:"Ver todos los productos",drop:"Un día. Una selección.",dropNote:"Descubre el Daily Drop de hoy.",daily:"Ver la selección de hoy",everyday:"Encuentra tu próxima compra.",everydayNote:"Productos con precio, vendedor y condiciones comprobados.",hero:"Campañas"},
  fr: {eyebrow:"Halloween · 31 octobre",title:"Un peu de frisson.\nBeaucoup de plaisir.",note:"Costumes, décorations et idées pour votre fête.",lateNote:"Le 31 octobre approche. Vérifiez le délai de livraison de chaque vendeur avant d'y compter.",shop:"Explorer Halloween",categories:["Costumes","Décorations","Fête"],
    bfEyebrow:"Black Friday · 27 novembre",bfTitle:"Nous notons déjà\nles prix, jour après jour.",bfNote:"Huit semaines de relevés qui nous sont propres : le jour venu, vous verrez quelles remises sont réelles.",bfShop:"Voir le journal des prix",
    browse:"Voir tous les produits",drop:"Un jour. Une sélection.",dropNote:"Découvrez le Daily Drop du jour.",daily:"Voir la sélection du jour",everyday:"Votre prochaine belle trouvaille.",everydayNote:"Des produits au prix, vendeur et conditions vérifiés.",hero:"Campagnes"},
  de: {eyebrow:"Halloween · 31. Oktober",title:"Ein wenig gruselig.\nJede Menge Spaß.",note:"Kostüme, Deko und Partyideen für den 31. Oktober.",lateNote:"Der 31. Oktober ist nah. Prüfe die Lieferzeit des jeweiligen Verkäufers, bevor du damit rechnest.",shop:"Halloween entdecken",categories:["Kostüme","Dekoration","Partybedarf"],
    bfEyebrow:"Black Friday · 27. November",bfTitle:"Wir schreiben die Preise\nschon jetzt mit.",bfNote:"Acht Wochen eigene Aufzeichnungen. Am Tag selbst siehst du, welche Rabatte echt sind und welche schon immer so hießen.",bfShop:"Zum Preistagebuch",
    browse:"Alle Produkte ansehen",drop:"Ein Tag. Ein Tipp.",dropNote:"Entdecke den heutigen Daily Drop.",daily:"Heutigen Tipp ansehen",everyday:"Finde deinen nächsten guten Kauf.",everydayNote:"Produkte mit geprüftem Preis, Verkäufer und Kaufbedingungen.",hero:"Kampagnen"},
};

/*
 * The hero, as a rotation rather than a single banner.
 *
 * Two campaigns legitimately overlap for most of October: Halloween is being
 * bought now, and Black Friday is being recorded now. A single banner forces a
 * choice between them and the loser disappears from the home page entirely; a
 * rotation lets each have the whole hero in turn. When only one campaign is
 * live, or none, this renders exactly what a single banner did.
 *
 * Which campaigns are live is the calendar's decision, taken upstream and
 * passed in here, so the copy in this file never has a date of its own to go
 * stale.
 */
export function HomeCampaigns({market,language,halloween=false,halloweenLate=false,blackFriday=false,halloweenQueries=[]}:{market:string;language:Language;halloween?:boolean;halloweenLate?:boolean;blackFriday?:boolean;halloweenQueries?:string[]}) {
  const copy = COPY[language];
  const search = `/${market}/search`;
  const slides: CampaignSlide[] = [];

  if (halloween) slides.push({
    key:"halloween", eyebrow:copy.eyebrow, title:copy.title,
    /* Past the delivery cutoff the invitation stands and the promise does not:
       the window to order and have it arrive has closed, the day has not. */
    note: halloweenLate ? copy.lateNote : copy.note,
    cta:copy.shop, href:`/${market}/halloween`,
    image:"/campaigns/halloween.webp", imagePosition:"center 65%",
    ground:"#201322", accent:"#ffc07a", accentText:"#201322", eyebrowText:"#fed7aa", dots:"#ffc07a",
  });

  if (blackFriday) slides.push({
    key:"black-friday", eyebrow:copy.bfEyebrow, title:copy.bfTitle, note:copy.bfNote,
    cta:copy.bfShop, href:`/${market}/black-friday`,
    ground:"#101208", accent:"#b8ec44", accentText:"#010101", eyebrowText:"#cdf07a", dots:"#b8ec44",
  });

  if (!slides.length) slides.push({
    key:"everyday", eyebrow:"OneDailyDrop", title:copy.everyday, note:copy.everydayNote,
    cta:copy.browse, href:search,
    ground:"#201322", accent:"#ffc07a", accentText:"#201322", eyebrowText:"#fed7aa", dots:"#ffc07a",
  });

  return <section aria-labelledby="hero-title" className="space-y-3">
    <CampaignCarousel slides={slides} label={copy.hero} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {halloween && halloweenQueries.length>0 && <nav aria-label={copy.shop} className="flex flex-wrap items-center gap-2">
        {copy.categories.map((label,index) => halloweenQueries.includes(['costume','decor','party'][index]) && <a key={label} href={`/${market}/halloween?${new URLSearchParams({q:['costume','decor','party'][index],lang:language})}`} className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-ink">{label}</a>)}
      </nav>}
      <div className="grid gap-2 sm:grid-cols-2 lg:ml-auto">
        <Link href={`/${market}/daily-drop`} className="group flex min-h-11 items-center justify-between gap-4 rounded-xl bg-lime px-4 py-2.5 text-ink">
          <span className="text-sm font-bold tracking-tight">{copy.drop}<span className="sr-only"> {copy.dropNote} {copy.daily}</span></span>
          <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link href={search} className="group flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2.5 text-fg">
          <span className="text-sm font-bold tracking-tight">{copy.browse}<span className="sr-only"> {copy.everydayNote}</span></span>
          <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </div>
  </section>;
}
