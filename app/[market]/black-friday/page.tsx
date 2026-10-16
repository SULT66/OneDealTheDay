import type { Metadata } from "next";
import { Suspense } from "react";
import { activeCampaign } from "@/src/merchandisingCalendar";
import { PRICE_DIARY } from "@/src/priceDiary";
import { getDeal } from "@/lib/catalog";
import { getLanguage, type Language } from "@/lib/i18n";
import { formatPrice } from "@/lib/format";
import { dailyPrices } from "@/lib/priceTrend";
import type { Deal } from "@/lib/types";
import { StructuredData } from "@/components/site/StructuredData";

/*
 * Black Friday, answered with the one thing we have and the shops do not:
 * a price we wrote down before they had a reason to flatter it.
 *
 * There is no product grid here on purpose. A grid of today's listings is what
 * every other deal site will publish on the 27th, and ours would say nothing
 * theirs does not. The diary is the opposite: ten listings, watched from
 * October, each shown against its own record rather than against a number the
 * shop typed. On the day, the page either proves the discount or it does not,
 * and both outcomes are worth reading.
 */

const COPY: Record<Language, {
  home: string; title: string; lede: string; watching: string; 
  method: string; methodBody: string[]; how: string; howBody: string[];
  now: string; low: string; high: string; days: string; observations: string;
  gone: string; goneNote: string; soon: string; countdown: string; noDrop: string;
  tableNote: string; see: string;  
}> = {
  en: {
    home: "Home", title: "Black Friday, checked against our own records",
    lede: "Ten products. We started writing their prices down in October. On 27 November you will see what the discount really was.",
    watching: "Watching since", 
    method: "Why this page has no deals on it yet",
    methodBody: [
      "A discount is a comparison, and the number shops print is a comparison with a price they chose. Ours is a comparison with what we recorded, four to six times a day, every day, from October.",
      "That is the whole product. It also means there is nothing to show on this page in October except the watching itself — and that is the honest state of it.",
    ],
    how: "How to read a Black Friday price anywhere",
    howBody: [
      "Look for the price before October, not the crossed-out one. A shop that raised a price in early November has done nothing illegal and told you nothing true.",
      "Check whether the model number changed. A near-identical model made for the sale is the oldest trick there is.",
      "A deal that needs you to hurry is relying on you not checking. The ones worth having survive a five-minute look.",
    ],
    now: "Price now", low: "Lowest we saw", high: "Highest we saw", days: "days watched",
    observations: "observations", gone: "No longer listed",
    goneNote: "This listing left the catalogue while we were watching it. The row stays, because a shop withdrawing an item before Black Friday is itself a reading.",
    soon: "Black Friday", countdown: "days away",
    noDrop: "Not yet below where it started.",
    tableNote: "Prices are ours, recorded four to six times a day. Shops change prices without telling anyone, including us.",
    see: "See the product", 
    
  },
  es: {
    home: "Inicio", title: "Black Friday, comprobado con nuestros propios registros",
    lede: "Diez productos. Empezamos a anotar sus precios en octubre. El 27 de noviembre verás cuál era el descuento real.",
    watching: "Observando desde", 
    method: "Por qué esta página aún no tiene ofertas",
    methodBody: [
      "Un descuento es una comparación, y el número que imprimen las tiendas se compara con un precio que ellas eligieron. El nuestro se compara con lo que registramos, de cuatro a seis veces al día, desde octubre.",
      "Eso es todo el producto. También significa que en octubre aquí no hay nada que enseñar salvo la propia vigilancia, y ese es el estado honesto de la cosa.",
    ],
    how: "Cómo leer un precio de Black Friday en cualquier sitio",
    howBody: [
      "Busca el precio anterior a octubre, no el tachado. Subir un precio a principios de noviembre no es ilegal y no te dice nada cierto.",
      "Comprueba si cambió el número de modelo. Un modelo casi idéntico fabricado para la campaña es el truco más viejo que hay.",
      "Una oferta que te mete prisa cuenta con que no compruebes. Las buenas sobreviven a cinco minutos de revisión.",
    ],
    now: "Precio ahora", low: "El más bajo visto", high: "El más alto visto", days: "días observados",
    observations: "observaciones", gone: "Ya no está publicado",
    goneNote: "Este producto salió del catálogo mientras lo observábamos. La fila se queda: que una tienda lo retire antes del Black Friday también es un dato.",
    soon: "Black Friday", countdown: "días",
    noDrop: "Todavía no por debajo de donde empezó.",
    tableNote: "Los precios son nuestros, registrados de cuatro a seis veces al día. Las tiendas los cambian sin avisar a nadie, tampoco a nosotros.",
    see: "Ver el producto", 
    
  },
  fr: {
    home: "Accueil", title: "Black Friday, vérifié sur nos propres relevés",
    lede: "Dix produits. Nous notons leurs prix depuis octobre. Le 27 novembre, vous verrez ce qu'était vraiment la remise.",
    watching: "Suivi depuis", 
    method: "Pourquoi cette page n'a pas encore d'offres",
    methodBody: [
      "Une remise est une comparaison, et le nombre affiché par les boutiques se compare à un prix qu'elles ont choisi. Le nôtre se compare à ce que nous avons relevé, quatre à six fois par jour, depuis octobre.",
      "C'est tout le produit. Cela veut aussi dire qu'en octobre il n'y a rien à montrer ici sinon le suivi lui-même, et c'est son état honnête.",
    ],
    how: "Comment lire un prix de Black Friday, partout",
    howBody: [
      "Cherchez le prix d'avant octobre, pas celui qui est barré. Augmenter un prix début novembre n'a rien d'illégal et ne vous apprend rien de vrai.",
      "Vérifiez si la référence a changé. Un modèle presque identique fabriqué pour l'occasion est la plus vieille astuce du métier.",
      "Une offre qui vous presse compte sur le fait que vous ne vérifierez pas. Les bonnes survivent à cinq minutes d'examen.",
    ],
    now: "Prix actuel", low: "Le plus bas relevé", high: "Le plus haut relevé", days: "jours suivis",
    observations: "relevés", gone: "N'est plus en vente",
    goneNote: "Ce produit a quitté le catalogue pendant notre suivi. La ligne reste : un retrait avant le Black Friday est lui aussi une information.",
    soon: "Black Friday", countdown: "jours",
    noDrop: "Pas encore sous son prix de départ.",
    tableNote: "Les prix sont les nôtres, relevés quatre à six fois par jour. Les boutiques les changent sans prévenir personne, nous compris.",
    see: "Voir le produit", 
    
  },
  de: {
    home: "Startseite", title: "Black Friday, geprüft an unseren eigenen Aufzeichnungen",
    lede: "Zehn Produkte. Seit Oktober schreiben wir ihre Preise mit. Am 27. November siehst du, wie hoch der Rabatt wirklich war.",
    watching: "Beobachtet seit", 
    method: "Warum hier noch keine Angebote stehen",
    methodBody: [
      "Ein Rabatt ist ein Vergleich, und die Zahl der Shops vergleicht mit einem Preis, den sie selbst gewählt haben. Unsere vergleicht mit dem, was wir aufgezeichnet haben — vier- bis sechsmal am Tag, seit Oktober.",
      "Das ist das ganze Produkt. Es heißt auch: im Oktober gibt es hier nichts zu zeigen außer dem Mitschreiben selbst. Das ist der ehrliche Stand.",
    ],
    how: "Wie man einen Black-Friday-Preis überall liest",
    howBody: [
      "Suche den Preis von vor Oktober, nicht den durchgestrichenen. Einen Preis Anfang November anzuheben ist nicht verboten und sagt dir nichts Wahres.",
      "Prüfe, ob sich die Modellnummer geändert hat. Ein fast identisches Modell eigens für die Aktion ist der älteste Trick überhaupt.",
      "Ein Angebot, das dich hetzt, rechnet damit, dass du nicht nachsiehst. Die guten überstehen fünf Minuten Prüfung.",
    ],
    now: "Preis jetzt", low: "Niedrigster gemessen", high: "Höchster gemessen", days: "Tage beobachtet",
    observations: "Messungen", gone: "Nicht mehr gelistet",
    goneNote: "Dieses Angebot hat den Katalog während der Beobachtung verlassen. Die Zeile bleibt: ein Rückzug vor dem Black Friday ist selbst ein Befund.",
    soon: "Black Friday", countdown: "Tage",
    noDrop: "Noch nicht unter dem Startpreis.",
    tableNote: "Die Preise sind unsere eigenen, vier- bis sechsmal täglich gemessen. Shops ändern sie, ohne jemandem Bescheid zu geben, uns eingeschlossen.",
    see: "Produkt ansehen", 
    
  },
};

export async function generateMetadata({ params }: PageProps<'/[market]/black-friday'>): Promise<Metadata> {
  const { market } = await params;
  const language = await getLanguage(market);
  const copy = COPY[language];
  return {
    title: copy.title,
    description: copy.lede,
    alternates: { canonical: `/${market}/black-friday` },
  };
}

export default async function BlackFridayPage({ params }: PageProps<'/[market]/black-friday'>) {
  const { market } = await params;
  const language = await getLanguage(market);
  const copy = COPY[language];
  const campaign = activeCampaign({ eventKey: 'black-friday', market, fromPreparation: true });
  const eventAt = campaign?.eventAt;
  const daysAway = eventAt ? Math.max(0, Math.ceil((Date.parse(eventAt) - Date.now()) / 86400000)) : null;

  return <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
    <a href={`/${market}`} className="text-sm font-semibold text-fg-muted hover:text-fg">← {copy.home}</a>

    <header className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
        {copy.soon}{daysAway !== null && daysAway > 0 ? ` · ${daysAway} ${copy.countdown}` : ""}
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-fg sm:text-5xl">{copy.title}</h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg-muted">{copy.lede}</p>
    </header>

    <section className="mt-10 rounded-card border border-border bg-surface p-6">
      <h2 className="text-lg font-bold tracking-tight text-fg">{copy.method}</h2>
      {copy.methodBody.map(line => <p key={line} className="mt-3 text-sm leading-relaxed text-fg-muted">{line}</p>)}
    </section>

    <Suspense fallback={<div aria-busy="true" className="mt-8 h-96 animate-pulse rounded-card bg-surface" />}>
      <Diary market={market} language={language} />
    </Suspense>

    <section className="mt-12 rounded-card border border-border bg-surface p-6">
      <h2 className="text-lg font-bold tracking-tight text-fg">{copy.how}</h2>
      <ol className="mt-4 space-y-3">
        {copy.howBody.map((line, index) => <li key={line} className="flex gap-3 text-sm leading-relaxed text-fg-muted">
          <span className="font-mono text-xs font-bold text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>{line}
        </li>)}
      </ol>
    </section>

    <StructuredData data={{
      "@context": "https://schema.org", "@type": "Article",
      headline: copy.title, description: copy.lede,
      about: { "@type": "Event", name: "Black Friday 2026", ...(eventAt ? { startDate: eventAt } : {}) },
    }} />
  </div>;
}

async function Diary({ market, language }: { market: string; language: Language }) {
  const copy = COPY[language];
  /* Settled, not all: one withdrawn listing must not empty the page. */
  const results = await Promise.allSettled(PRICE_DIARY.entries.map(entry => getDeal(market, entry.id)));

  return <section aria-labelledby="diary-title" className="mt-10">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="diary-title" className="text-2xl font-bold tracking-tight text-fg">{copy.watching} {PRICE_DIARY.startedAt}</h2>
    </div>
    <ul className="mt-6 space-y-3">
      {PRICE_DIARY.entries.map((entry, index) => {
        const settled = results[index];
        const deal = settled.status === "fulfilled" ? settled.value : undefined;
        return <li key={entry.id}><DiaryRow entry={entry} deal={deal} copy={copy} language={language} market={market} /></li>;
      })}
    </ul>
    <p className="mt-6 text-xs leading-relaxed text-fg-subtle">{copy.tableNote}</p>
  </section>;
}

function DiaryRow({ entry, deal, copy, language, market }: {
  entry: typeof PRICE_DIARY.entries[number];
  deal: Deal | undefined;
  copy: (typeof COPY)[Language];
  language: Language;
  market: string;
}) {
  if (!deal) return <div className="rounded-card border border-dashed border-border p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{entry.bucket}</p>
    <p className="mt-2 text-sm font-semibold text-fg">{entry.note}</p>
    <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-300">{copy.gone}</p>
    <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{copy.goneNote}</p>
  </div>;

  const days = dailyPrices(deal.priceHistory || []);
  const prices = days.map(day => day.price).filter(Number.isFinite);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const money = (value: number) => formatPrice(value, deal.currency, market);

  return <div className="rounded-card border border-border bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{entry.bucket}</p>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-fg">{deal.title}</p>
        <a href={`/${market}/deal/${deal.id}`} className="mt-2 inline-block text-xs font-semibold text-fg-muted underline hover:text-fg">{copy.see}</a>
      </div>
      <Sparkline days={days} />
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
      <div><dt className="text-xs text-fg-subtle">{copy.now}</dt><dd className="mt-0.5 text-base font-bold text-fg">{money(deal.price)}</dd></div>
      <div><dt className="text-xs text-fg-subtle">{copy.low}</dt><dd className="mt-0.5 text-base font-semibold text-fg">{low !== null ? money(low) : "—"}</dd></div>
      <div><dt className="text-xs text-fg-subtle">{copy.high}</dt><dd className="mt-0.5 text-base font-semibold text-fg">{high !== null ? money(high) : "—"}</dd></div>
      <div><dt className="text-xs text-fg-subtle">{copy.days}</dt><dd className="mt-0.5 text-base font-semibold text-fg">{days.length}</dd></div>
    </dl>
  </div>;
}

/*
 * One line per product, drawn from the daily series. No axis and no numbers:
 * the figures are in the list beside it, and this only has to answer "has it
 * moved at all". A flat line in October is the expected answer and the point.
 */
function Sparkline({ days }: { days: Array<{ date: string; price: number }> }) {
  if (days.length < 2) return null;
  const width = 180;
  const height = 48;
  const prices = days.map(day => day.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const points = days.map((day, index) => {
    const x = (index / (days.length - 1)) * (width - 2) + 1;
    const y = height - 3 - ((day.price - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img"
    aria-label={`${days.length} days`} className="shrink-0 text-fg-subtle">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}
