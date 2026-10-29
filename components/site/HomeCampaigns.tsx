import Link from "next/link";
import { activeCampaign } from "@/src/merchandisingCalendar";
import { isHolidaySeason } from "@/src/holidayCatalog";
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
    bfEyebrow:"Black Friday · November 27",bfTitle:"BIG FINDS.\nSMARTER SPENDING.",bfNote:"The wishlist starts here. Follow our price diary before the big day.",bfShop:"See the price diary",
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
 * Festive gifts lead, followed by the Black Friday price diary and regional
 * Thanksgiving hosting. Halloween is retired during holiday preparation.
 */
export function HomeCampaigns({market,language,halloween=false,halloweenLate=false,blackFriday=false,halloweenQueries=[]}:{market:string;language:Language;halloween?:boolean;halloweenLate?:boolean;blackFriday?:boolean;halloweenQueries?:string[]}) {
  const copy = COPY[language];
  const holiday = isHolidaySeason();
  if (holiday) halloween = false;
  const search = `/${market}/search`;
  const slides: CampaignSlide[] = [];
  const thanksgiving = activeCampaign({eventKey:"thanksgiving",market,fromPreparation:true,throughEvent:true});

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
    image:"/campaigns/black-friday-editorial-2026.webp", imagePosition:"center 15%",
    ground:"#f3f0e8", textColor:"#101010",highlight:true, accent:"#101010", accentText:"#ffffff", eyebrowText:"#101010", dots:"#c1f21d",
  });

  if (holiday) {
    const festive = {
      en:{eyebrow:"Christmas & New Year",title:"GIFT MODE:\nACTIVATED.",note:"Christmas sparkle. New Year energy. Gifts that deserve a proper unboxing.",cta:"Explore holiday finds"},
      es:{eyebrow:"Navidad y Año Nuevo",title:"Un poco de brillo.\nMucho que celebrar.",note:"Regalos, luces y decoración para disfrutar de las fiestas.",cta:"Explorar las fiestas"},
      fr:{eyebrow:"Noël et Nouvel An",title:"Un peu de magie.\nTant à célébrer.",note:"Des cadeaux, des lumières et de belles trouvailles pour les fêtes.",cta:"Explorer les fêtes"},
      de:{eyebrow:"Weihnachten & Neujahr",title:"Ein wenig Glanz.\nViel zu feiern.",note:"Geschenke, Lichter und festliche Entdeckungen für eine besondere Zeit.",cta:"Festliche Angebote entdecken"},
    }[language];
    slides.push({key:"holiday",...festive,href:`/${market}/holiday`,image:"/campaigns/holiday-editorial-2026.webp",imagePosition:"center 35%",
      ground:"#f6f1e7",textColor:"#101010",highlight:true,accent:"#101010",accentText:"#ffffff",eyebrowText:"#101010",dots:"#c1f21d"});
  }

  // A consistent campaign journey: festive gifts, price diary, then hosting.
  if (holiday) slides.sort((a,b)=>Number(b.key==="holiday")-Number(a.key==="holiday"));
  if (thanksgiving) {
    const gathering = {
      en:{eyebrow:"Thanksgiving",title:"HOST MODE:\nNO PANIC.",note:"Good food. Great company. A few clever finds for your Thanksgiving table.",cta:"Get ready to gather"},
      es:{eyebrow:"Acción de Gracias",title:"TODO LISTO.\nSIN ESTRÉS.",note:"Ideas para cocinar, decorar y compartir la mesa.",cta:"Preparar la celebración"},
      fr:{eyebrow:"Thanksgiving",title:"ON REÇOIT.\nSANS STRESS.",note:"De belles trouvailles pour cuisiner et partager.",cta:"Préparer la fête"},
      de:{eyebrow:"Thanksgiving",title:"GÄSTE KOMMEN.\nKEINE PANIK.",note:"Entdeckungen zum Kochen, Dekorieren und Feiern.",cta:"Das Fest vorbereiten"},
    }[language];
    const eventDate=new Intl.DateTimeFormat(language,{month:"short",day:"numeric",timeZone:"America/New_York"}).format(new Date(thanksgiving.eventAt));
    slides.push({key:"thanksgiving",...gathering,eyebrow:`${gathering.eyebrow} · ${eventDate}`,href:`/${market}/thanksgiving`,
      image:"/campaigns/thanksgiving-editorial-2026.webp",imagePosition:"center 40%",ground:"#f4e9d9",textColor:"#101010",highlight:true,
      accent:"#101010",accentText:"#ffffff",eyebrowText:"#101010",dots:"#c1f21d"});
  }

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
