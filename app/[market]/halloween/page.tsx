import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getLanguage, type Language } from '@/lib/i18n';
import { getHalloweenCollection } from '@/lib/merchandising';
import { HalloweenProducts } from '@/components/site/HalloweenProducts';

const COPY = {
  en:{home:'Home',title:'Halloween finds',note:'Costumes, masks, decorations and party finds. Confirm delivery for your address at the shop.',loading:'Loading Halloween finds…'},
  es:{home:'Inicio',title:'Productos Halloween',note:'Disfraces, máscaras, decoración y fiesta. Confirma la entrega para tu dirección en la tienda.',loading:'Cargando productos Halloween…'},
  fr:{home:'Accueil',title:'Produits Halloween',note:'Costumes, masques, décorations et fête. Confirmez la livraison pour votre adresse en boutique.',loading:'Chargement des produits Halloween…'},
  de:{home:'Startseite',title:'Halloween-Produkte',note:'Kostüme, Masken, Dekoration und Partybedarf. Lieferung für deine Adresse beim Händler bestätigen.',loading:'Halloween-Produkte werden geladen…'},
};
export async function generateMetadata({params}:PageProps<'/[market]/halloween'>):Promise<Metadata> {
  const {market}=await params, language=await getLanguage(market);
  return {title:COPY[language].title,description:COPY[language].note,alternates:{canonical:`/${market}/halloween`}};
}
export default async function HalloweenPage({params,searchParams}:PageProps<'/[market]/halloween'>) {
  const {market}=await params, search=await searchParams, language=await getLanguage(market);
  const q=typeof search.q==='string'?search.q.slice(0,120):'';
  const sort=typeof search.sort==='string'?search.sort:'popular';
  const page=Math.max(1,Math.floor(Number(search.page)||1));
  const copy=COPY[language];
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <Link href={`/${market}`} className="text-sm font-semibold text-fg-muted hover:text-fg">← {copy.home}</Link>
    <h1 className="mt-5 text-4xl font-bold tracking-tight text-fg">{copy.title}</h1>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">{copy.note}</p>
    <Suspense key={`${q}:${sort}:${page}`} fallback={<div aria-busy="true" className="mt-8 h-56 animate-pulse rounded-2xl bg-surface p-6 text-sm text-fg-muted">{copy.loading}</div>}>
      <Collection market={market} language={language} page={page} q={q} sort={sort}/>
    </Suspense>
  </div>;
}
async function Collection({market,language,page,q,sort}:{market:string;language:Language;page:number;q:string;sort:string}) {
  const data=await getHalloweenCollection(market,language,page,q,sort);
  return <HalloweenProducts market={market} language={language} data={data} q={q} sort={sort}/>;
}
