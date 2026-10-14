import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import type { Language } from "@/lib/i18n";

const COPY: Record<Language, {eyebrow:string; title:string; note:string; shop:string; categories:string[]; browse:string; drop:string; dropNote:string; daily:string; everyday:string; everydayNote:string}> = {
  en: {eyebrow:"Halloween · October 31",title:"A little spooky.\nA lot of fun.",note:"Costumes, decorations & party finds for October 31.",shop:"Explore Halloween",categories:["Costumes","Decorations","Party supplies"],browse:"Browse all finds",drop:"One day. One pick.",dropNote:"Meet today's Daily Drop.",daily:"See today's pick",everyday:"Find your next good buy.",everydayNote:"Explore products with price, seller and buying terms checked."},
  es: {eyebrow:"Halloween · 31 de octubre",title:"Un poco de miedo.\nMucha diversión.",note:"Disfraces, decoración e ideas para tu fiesta.",shop:"Explorar Halloween",categories:["Disfraces","Decoración","Fiesta"],browse:"Ver todos los productos",drop:"Un día. Una selección.",dropNote:"Descubre el Daily Drop de hoy.",daily:"Ver la selección de hoy",everyday:"Encuentra tu próxima compra.",everydayNote:"Productos con precio, vendedor y condiciones comprobados."},
  fr: {eyebrow:"Halloween · 31 octobre",title:"Un peu de frisson.\nBeaucoup de plaisir.",note:"Costumes, décorations et idées pour votre fête.",shop:"Explorer Halloween",categories:["Costumes","Décorations","Fête"],browse:"Voir tous les produits",drop:"Un jour. Une sélection.",dropNote:"Découvrez le Daily Drop du jour.",daily:"Voir la sélection du jour",everyday:"Votre prochaine belle trouvaille.",everydayNote:"Des produits au prix, vendeur et conditions vérifiés."},
  de: {eyebrow:"Halloween · 31. Oktober",title:"Ein wenig gruselig.\nJede Menge Spaß.",note:"Kostüme, Deko und Partyideen für den 31. Oktober.",shop:"Halloween entdecken",categories:["Kostüme","Dekoration","Partybedarf"],browse:"Alle Produkte ansehen",drop:"Ein Tag. Ein Tipp.",dropNote:"Entdecke den heutigen Daily Drop.",daily:"Heutigen Tipp ansehen",everyday:"Finde deinen nächsten guten Kauf.",everydayNote:"Produkte mit geprüftem Preis, Verkäufer und Kaufbedingungen."},
};

export function HomeCampaigns({market,language}:{market:string;language:Language}) {
  const copy = COPY[language];
  // The campaign expires automatically after October; no year-old holiday hero.
  const halloween = new Date().getUTCMonth() === 9;
  const search = `/${market}/search`;
  return <section aria-labelledby="hero-title" className="space-y-4">
    <div className="relative isolate overflow-hidden rounded-card bg-[#201322] text-white">
      {halloween && <Image src="/campaigns/halloween.webp" alt="" fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover object-[65%_65%] sm:object-[center_65%]" />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#201322]/95 via-[#201322]/60 to-transparent" />
      <div className="relative max-w-2xl px-6 py-10 sm:px-10 sm:py-14 lg:px-12 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">{halloween ? copy.eyebrow : "OneDailyDrop"}</p>
        <h1 id="hero-title" className="mt-4 whitespace-pre-line text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{halloween ? copy.title : copy.everyday}</h1>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/80 sm:text-base">{halloween ? copy.note : copy.everydayNote}</p>
        <Link href={halloween ? `${search}?q=Halloween` : search} className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#ffc07a] px-6 text-sm font-semibold text-[#201322] transition-colors hover:bg-orange-200">
          {halloween ? copy.shop : copy.browse}<ArrowRight size={18} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    </div>
    {halloween && <nav aria-label={copy.shop} className="flex flex-wrap items-center gap-2">
      {copy.categories.map((label,index) => <Link key={label} href={`${search}?q=${encodeURIComponent(['Halloween costume','Halloween decoration','Halloween party supplies'][index])}`} className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-ink">{label}</Link>)}
    </nav>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href={`/${market}/daily-drop`} className="group flex items-center justify-between gap-4 rounded-card bg-lime px-6 py-5 text-ink">
        <div><p className="text-lg font-bold tracking-tight">{copy.drop}</p><p className="mt-1 text-sm text-ink/75">{copy.dropNote}</p><span className="mt-3 block text-xs font-semibold">{copy.daily}</span></div>
        <ArrowRight size={24} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>
      <Link href={search} className="group flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-6 py-5 text-fg">
        <div><p className="text-lg font-bold tracking-tight">{copy.browse}</p><p className="mt-1 max-w-sm text-sm text-fg-muted">{copy.everydayNote}</p></div>
        <ArrowRight size={24} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </div>
  </section>;
}
