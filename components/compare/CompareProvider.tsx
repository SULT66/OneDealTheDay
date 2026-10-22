"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ComparisonItem as Item, ComparisonOffer } from "@/lib/comparison";
import { adaptProduct } from "@/lib/backendAdapter";
import { formatDateTime, formatPrice, retailerLabel } from "@/lib/format";
import { useLanguage } from "@/components/site/CopyProvider";
import { ProductImage } from "@/components/ui/ProductImage";
import { MAX_COMPARE_ITEMS, toggleCompareItem, comparisonResults } from "@/src/compareSelection";

type Context = {items:Item[]; toggle:(item:Item)=>void; copy:typeof words.en; register:(id:string,offer:ComparisonOffer)=>void};
const CompareContext = createContext<Context | null>(null);
const words = {
  en:{add:"Compare",selected:"Added to comparison",title:"Compare products",close:"Close comparison",remove:"Remove",clear:"Clear all",choose:"Choose 2–4 products from these related picks",limit:"Maximum 4 products",category:"Choose products in the same category and currency",loading:"Checking current offers…",error:"Could not refresh this offer. Open the product to check it.",unknown:"Not provided",price:"Price",store:"Retailer",brand:"Brand",rating:"Product rating",seller:"Seller",score:"OneDailyDrop Score",delivery:"Delivery",returns:"Returns",stock:"Availability",checked:"Last checked",view:"View product",buy:"View at retailer",note:"Prices and terms can change. Confirm the final total at the retailer. Missing information is not estimated.",stale:"Price needs rechecking",reviews:"reviews"},
  es:{add:"Comparar",selected:"Añadido a la comparación",title:"Comparar productos",close:"Cerrar comparación",remove:"Quitar",clear:"Borrar todo",choose:"Elige 2–4 productos de estas recomendaciones",limit:"Máximo 4 productos",category:"Elige productos de la misma categoría y moneda",loading:"Comprobando ofertas actuales…",error:"No se pudo actualizar esta oferta. Abre el producto para comprobarlo.",unknown:"No disponible",price:"Precio",store:"Tienda",brand:"Marca",rating:"Valoración del producto",seller:"Vendedor",score:"OneDailyDrop Score",delivery:"Entrega",returns:"Devoluciones",stock:"Disponibilidad",checked:"Última comprobación",view:"Ver producto",buy:"Ver en la tienda",note:"Los precios y condiciones pueden cambiar. Confirma el total en la tienda. No estimamos los datos que faltan.",stale:"Hay que comprobar el precio",reviews:"reseñas"},
  fr:{add:"Comparer",selected:"Ajouté à la comparaison",title:"Comparer les produits",close:"Fermer la comparaison",remove:"Retirer",clear:"Tout effacer",choose:"Choisissez 2–4 produits parmi ces suggestions",limit:"4 produits maximum",category:"Choisissez la même catégorie et la même devise",loading:"Vérification des offres actuelles…",error:"Impossible d’actualiser cette offre. Ouvrez le produit pour vérifier.",unknown:"Non renseigné",price:"Prix",store:"Boutique",brand:"Marque",rating:"Note du produit",seller:"Vendeur",score:"OneDailyDrop Score",delivery:"Livraison",returns:"Retours",stock:"Disponibilité",checked:"Dernière vérification",view:"Voir le produit",buy:"Voir chez le marchand",note:"Les prix et conditions peuvent changer. Vérifiez le total chez le marchand. Les données manquantes ne sont pas estimées.",stale:"Prix à revérifier",reviews:"avis"},
  de:{add:"Vergleichen",selected:"Zum Vergleich hinzugefügt",title:"Produkte vergleichen",close:"Vergleich schließen",remove:"Entfernen",clear:"Alles löschen",choose:"Wähle 2–4 Produkte aus diesen Empfehlungen",limit:"Maximal 4 Produkte",category:"Wähle dieselbe Kategorie und Währung",loading:"Aktuelle Angebote werden geprüft…",error:"Angebot konnte nicht aktualisiert werden. Öffne das Produkt zur Prüfung.",unknown:"Nicht angegeben",price:"Preis",store:"Händler",brand:"Marke",rating:"Produktbewertung",seller:"Verkäufer",score:"OneDailyDrop Score",delivery:"Lieferung",returns:"Rückgabe",stock:"Verfügbarkeit",checked:"Zuletzt geprüft",view:"Produkt ansehen",buy:"Beim Händler ansehen",note:"Preise und Bedingungen können sich ändern. Prüfe den Endbetrag beim Händler. Fehlende Angaben werden nicht geschätzt.",stale:"Preis erneut prüfen",reviews:"Bewertungen"},
};

export function CompareProvider({market,allowedItems,children}:{market:string;allowedItems:Item[];children:React.ReactNode}) {
  const language = useLanguage();
  const copy = words[language as keyof typeof words] || words.en;
  const [items,setItems] = useState<Item[]>([]);
  const [open,setOpen] = useState(false);
  const [offers,setOffers] = useState<Array<ComparisonOffer | null>>([]);
  const [unrefreshed,setUnrefreshed] = useState<boolean[]>([]);
  const snapshots = useRef(new Map<string,ComparisonOffer>());
  const register = useCallback((id:string,offer:ComparisonOffer)=>{snapshots.current.set(id,offer);},[]);
  const [loading,setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open) dialog.current?.showModal(); else dialog.current?.close();},[open]);
  useEffect(()=>{
    if(!open) return;
    const abort = new AbortController();
    setLoading(true); setOffers([]);
    Promise.all(items.map(async item=>{
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(item.id)}?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)]),cache:"no-store",headers:{Accept:"application/json"}});
        if(!response.ok) return null;
        const body = await response.json();
        if(String(body.product?.id)!==item.id) return null;
        return adaptProduct(body.product);
      } catch {return null;}
    })).then(result=>{if(!abort.signal.aborted){const resolved:Array<{offer:ComparisonOffer|null;refreshed:boolean}> = comparisonResults(items,result,snapshots.current);setOffers(resolved.map(row=>row.offer));setUnrefreshed(resolved.map(row=>!row.refreshed));setLoading(false);}});
    return ()=>abort.abort();
  },[open,items,market,language]);
  const toggle = (item:Item)=>setItems(current=>toggleCompareItem(current,item,allowedItems));
  const rows:Array<[string,(deal:ComparisonOffer)=>React.ReactNode]> = [
    [copy.price,d=>Number.isFinite(d.price)&&d.price>0?<>{formatPrice(d.price,d.currency,market)}{!d.priceIsCurrent&&<span className="mt-1 block text-xs text-fg-muted">{copy.stale}</span>}</>:copy.unknown],
    [copy.store,d=>retailerLabel(d.retailer)], [copy.brand,d=>d.brand||copy.unknown],
    [copy.rating,d=>d.reviewCount>0&&d.rating>0?`${d.rating.toFixed(1)}/5 · ${d.reviewCount} ${copy.reviews}`:copy.unknown],
    [copy.score,d=>d.score!=null?`${d.score}/100`:copy.unknown],
    [copy.seller,d=>d.seller.name||copy.unknown], [copy.delivery,d=>d.delivery||copy.unknown],
    [copy.returns,d=>d.returns||copy.unknown], [copy.stock,d=>d.availability||copy.unknown],
    [copy.checked,d=>d.checkedAt&&Number.isFinite(Date.parse(d.checkedAt))?formatDateTime(d.checkedAt,market):copy.unknown],
  ];
  return <CompareContext.Provider value={{items,toggle,copy,register}}>
    {children}
    {items.length>0&&!open&&<aside aria-label={copy.title} className="fixed bottom-4 left-4 right-24 z-40 mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-3 shadow-xl sm:left-8 sm:right-28">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">{copy.title} · {items.length}/{MAX_COMPARE_ITEMS}</p>
        <div className="flex flex-1 gap-2">{items.map(item=><button key={item.id} type="button" onClick={()=>toggle(item)} aria-label={`${copy.remove}: ${item.title}`} title={`${copy.remove}: ${item.title}`} className="max-w-36 truncate rounded-full bg-bg px-3 py-1.5 text-xs">{item.title} ×</button>)}</div>
        <button type="button" disabled={items.length<2} onClick={()=>setOpen(true)} className="rounded-full bg-lime px-5 py-2 text-sm font-bold text-ink disabled:opacity-40">{copy.add}</button>
        <button type="button" onClick={()=>setItems([])} className="text-xs underline">{copy.clear}</button>
      </div>
      <p className="mt-1 text-xs text-fg-muted" role="status">{copy.choose}</p>
    </aside>}
    <dialog ref={dialog} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-labelledby="comparison-title" aria-describedby="comparison-note" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-6xl overflow-auto rounded-3xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface p-5">
        <h2 id="comparison-title" className="text-xl font-bold">{copy.title}</h2>
        <button type="button" autoFocus onClick={()=>setOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm">{copy.close} ×</button>
      </div>
      {loading?<p role="status" className="p-8">{copy.loading}</p>:<div className="overflow-x-auto p-4 sm:p-6">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <caption className="sr-only">{copy.title}</caption>
          <thead><tr><th scope="col" className="w-36"><span className="sr-only">{copy.title}</span></th>{items.map((item,index)=><th key={item.id} scope="col" className="min-w-52 max-w-80 px-3 pb-5 align-top">
            <div className="relative mb-3 h-32 overflow-hidden rounded-xl bg-white"><ProductImage src={offers[index]?.image||item.image} alt={item.title} categoryIcon="Package" sizes="260px" className="p-3" /></div>
            <a href={`/${market}/deal/${item.id}`} className="line-clamp-3 font-semibold hover:underline">{offers[index]?.title||item.title}</a>
            {unrefreshed[index]&&<p role="status" className="mt-2 text-xs font-normal text-fg-muted">{copy.error}</p>}
          </th>)}</tr></thead>
          <tbody>{rows.map(([label,value])=><tr key={label} className="border-t border-border"><th scope="row" className="py-4 pr-3 text-xs font-medium text-fg-muted">{label}</th>{items.map((item,index)=><td key={item.id} className="px-3 py-4 align-top">{offers[index]?value(offers[index]!):"—"}</td>)}</tr>)}</tbody>
          <tfoot><tr className="border-t border-border"><td />{items.map((item,index)=><td key={item.id} className="px-3 py-5">{offers[index]?<a href={`/${market}/go/${item.id}?source=product&placement=product_compare&action=view_deal`} target="_blank" rel="sponsored noopener" className="inline-flex rounded-full bg-lime px-4 py-2 font-semibold text-ink">{copy.buy} ↗</a>:<a href={`/${market}/deal/${item.id}`} className="underline">{copy.view}</a>}</td>)}</tr></tfoot>
        </table>
      </div>}
      <p id="comparison-note" className="px-6 pb-6 text-xs text-fg-muted">{copy.note}</p>
    </dialog>
  </CompareContext.Provider>;
}

export function CompareButton({deal}:{deal:Item}) {
  const context = useContext(CompareContext);
  const register = context?.register;
  useEffect(()=>{if(register&&deal.offer) register(deal.id,deal.offer);},[register,deal.id,deal.offer]);
  if(!context) return null;
  const {items,toggle,copy} = context;
  const selected = items.some(item=>item.id===deal.id);
  const different = !!items[0]&&(items[0].category!==deal.category||items[0].currency!==deal.currency);
  const disabled = !selected&&(different||items.length>=MAX_COMPARE_ITEMS);
  return <button type="button" aria-label={`${selected?copy.selected:copy.add}: ${deal.title}`} aria-pressed={selected} disabled={disabled} title={disabled?(different?copy.category:copy.limit):undefined} onClick={()=>toggle(deal)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold transition-colors hover:border-lime disabled:cursor-not-allowed disabled:opacity-40">{selected?"✓":"＋"} {selected?copy.selected:copy.add}</button>;
}
