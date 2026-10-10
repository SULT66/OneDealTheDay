"use client";
import { useState } from "react";
import type { MerchantCoupon } from "@/lib/catalog";
import { CopyCoupon } from "./CopyCoupon";

const searchText = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

export function CouponCatalog({coupons, spanish}: {coupons: MerchantCoupon[]; spanish: boolean}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("high");
  const stores = [...new Set(["eBay", "AliExpress", ...coupons.map(c => c.merchant)])].sort();
  const visible = coupons.filter(c => searchText(c.merchant).includes(searchText(query))).sort((a,b) => {
    if (a.discountPercent == null) return b.discountPercent == null ? 0 : 1;
    if (b.discountPercent == null) return -1;
    return sort === "low" ? a.discountPercent - b.discountPercent : b.discountPercent - a.discountPercent;
  });
  const shopCount = new Set(visible.map(c => c.merchant)).size;
  const date = (value:string) => new Intl.DateTimeFormat(spanish ? "es-US" : "en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(value));
  if (!coupons.length) return <p className="mt-10 rounded-2xl border border-border bg-surface p-6 text-fg-muted">{spanish ? "No hay códigos recientes disponibles para este país. Vuelve más tarde." : "No recent codes are available for this country. Check back later."}</p>;
  return <section className="mt-8" aria-label={spanish ? "Buscar cupones por tienda" : "Find coupons by store"}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
    <div className="w-full max-w-xl">
      <label htmlFor="coupon-store-search" className="mb-2 block text-sm font-semibold text-fg">{spanish ? "Buscar tiendas" : "Search stores"}</label>
      <div className="flex items-center gap-2">
        <input id="coupon-store-search" type="search" list="coupon-store-options" value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={spanish ? "Nombre de la tienda, p. ej. Argendon" : "Store name, e.g. Argendon"}
          autoComplete="off" aria-controls="coupon-results"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-fg placeholder:text-fg-muted focus:outline-2 focus:outline-offset-2 focus:outline-lime" />
        <datalist id="coupon-store-options">{stores.map(store => <option key={store} value={store} />)}</datalist>
        {query && <button type="button" onClick={() => setQuery("")} className="h-12 shrink-0 cursor-pointer rounded-xl border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-2">{spanish ? "Borrar" : "Clear"}</button>}
      </div>
    </div>
    <div>
      <label htmlFor="coupon-sort" className="mb-2 block text-sm font-semibold text-fg">{spanish ? "Ordenar descuento" : "Sort discount"}</label>
      <select id="coupon-sort" value={sort} onChange={event => setSort(event.target.value)} aria-controls="coupon-results" className="h-12 rounded-xl border border-border bg-surface px-4 text-fg">
        <option value="high">{spanish ? "Porcentaje: mayor a menor" : "Percent: high to low"}</option>
        <option value="low">{spanish ? "Porcentaje: menor a mayor" : "Percent: low to high"}</option>
      </select>
    </div></div>
    <p className="mt-3 text-xs text-fg-muted">{spanish ? "Los descuentos de importe fijo o sin porcentaje aparecen al final." : "Fixed-amount discounts and offers without a percentage appear last."}</p>
    <p role="status" aria-live="polite" className="my-6 text-sm font-semibold text-fg">{visible.length} {spanish ? "códigos" : "codes"} · {shopCount} {spanish ? "tiendas" : "stores"}</p>
    <div id="coupon-results">
      {visible.length > 0 ? <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visible.map(coupon => <article key={coupon.id} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{coupon.merchant}</p>
          {coupon.itemTitle && <p className="mt-2 text-xs text-fg-muted">{spanish ? "Producto elegible" : "Eligible item"}: {coupon.itemTitle}</p>}
          <h2 className="mt-3 text-xl font-bold leading-snug text-fg">{coupon.title.replace(/(Take 10% off your entire order sitewide)\s+\1/, "$1")}</h2>
          <p className="mb-5 mt-3 text-sm leading-relaxed text-fg-muted">{coupon.description.replace(/(Take 10% off your entire order sitewide)\s+\1/, "$1")}</p>
          <div className="mt-auto"><CopyCoupon code={coupon.code} spanish={spanish} />
            <a href={coupon.href} target="_blank" rel="sponsored noopener" className="mt-3 inline-flex rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-85">{spanish ? "Ir a la tienda" : "Shop offer"} ↗</a>
            <details className="mt-5 text-sm text-fg-muted">
              <summary className="cursor-pointer font-medium text-fg">{spanish ? "Condiciones de la tienda" : "Store terms"}</summary>
              <p className="mt-2 leading-relaxed">{!coupon.terms || /^(N\/A|No restrictions|No exclusions\.)$/i.test(coupon.terms) ? (spanish ? "La tienda no indica restricciones adicionales. Confirma el descuento al pagar." : "The store lists no additional restrictions. Confirm the discount at checkout.") : coupon.terms}</p>
              {coupon.termsUrl && <a href={coupon.termsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">{spanish ? "Condiciones oficiales" : "Official offer terms"} ↗</a>}
            </details>
            <p className="mt-4 text-xs text-fg-muted">{spanish ? "Caduca" : "Expires"}: {coupon.expiresAt ? date(coupon.expiresAt) : (spanish ? "Ver condiciones" : "See offer terms")}<br />{spanish ? "Fuente comprobada" : "Source checked"}: {date(coupon.checkedAt)}</p>
          </div>
        </article>)}
      </div>
      </> : <p className="rounded-2xl border border-border bg-surface p-6 text-fg-muted">{spanish ? "No hay cupones para esa tienda. Prueba con otro nombre o borra la búsqueda." : "No coupons found for that store. Try another name or clear the search."}</p>}
    </div>
  </section>;
}
