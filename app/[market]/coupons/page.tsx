import type { Metadata } from "next";
import Link from "next/link";
import { getMerchantCoupons } from "@/lib/catalog";
import { getLanguage } from "@/lib/i18n";
import { CopyCoupon } from "@/components/coupons/CopyCoupon";

export async function generateMetadata({params}: {params:Promise<{market:string}>}): Promise<Metadata> {
  const {market} = await params;
  const spanish = (await getLanguage(market)) === "es";
  return {title:spanish ? "Cupones y códigos de descuento" : "Coupons & promo codes",
    description:spanish ? "Códigos publicados por nuestras tiendas asociadas, con condiciones y fechas." : "Merchant supplied promo codes from our partner stores, with terms and dates."};
}
export default async function CouponsPage({params}: {params:Promise<{market:string}>}) {
  const {market} = await params;
  const spanish = (await getLanguage(market)) === "es";
  const coupons = await getMerchantCoupons(market);
  const shops = new Set(coupons.map(c=>c.merchant));
  const date = (value:string) => new Intl.DateTimeFormat(spanish ? "es-US" : "en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(value));
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <Link href={`/${market}`} className="text-sm text-fg-muted hover:text-fg">{spanish ? "Inicio" : "Home"}</Link>
    <div className="mt-6 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">{spanish ? "Ahorra al pagar" : "Save at checkout"}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-5xl">{spanish ? "Cupones y códigos de descuento" : "Coupons & promo codes"}</h1>
      <p className="mt-4 text-lg leading-relaxed text-fg-muted">{spanish ? "Copia un código, visita la tienda y pégalo al pagar. Consulta las condiciones antes de comprar." : "Copy a code, visit the store and paste it at checkout. Check the terms before you buy."}</p>
      <p className="mt-3 text-sm text-fg-muted">{spanish ? "Códigos publicados por las tiendas; no probados mediante una compra. La tienda confirma el descuento al pagar. Podemos recibir una comisión por compras realizadas a través de nuestros enlaces." : "Codes supplied by the stores; not tested by making a purchase. The store confirms the discount at checkout. We may earn a commission from purchases through our links."}</p>
    </div>
    {coupons.length > 0 ? <>
      <p className="my-8 text-sm font-semibold text-fg">{coupons.length} {spanish ? "códigos" : "codes"} · {shops.size} {spanish ? "tiendas" : "stores"}</p>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {coupons.map(coupon => <article key={coupon.id} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{coupon.merchant}</p>
          <h2 className="mt-3 text-xl font-bold leading-snug text-fg">{coupon.title.replace(/(Take 10% off your entire order sitewide)\s+\1/, "$1")}</h2>
          <p className="mb-5 mt-3 text-sm leading-relaxed text-fg-muted">{coupon.description.replace(/(Take 10% off your entire order sitewide)\s+\1/, "$1")}</p>
          <div className="mt-auto"><CopyCoupon code={coupon.code} spanish={spanish} />
            <a href={coupon.href} target="_blank" rel="sponsored noopener" className="mt-3 inline-flex rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-85">{spanish ? "Ir a la tienda" : "Shop offer"} ↗</a>
            <details className="mt-5 text-sm text-fg-muted">
              <summary className="cursor-pointer font-medium text-fg">{spanish ? "Condiciones de la tienda" : "Store terms"}</summary>
              <p className="mt-2 leading-relaxed">{!coupon.terms || /^(N\/A|No restrictions|No exclusions\.)$/i.test(coupon.terms) ? (spanish ? "La tienda no indica restricciones adicionales. Confirma el descuento al pagar." : "The store lists no additional restrictions. Confirm the discount at checkout.") : coupon.terms}</p>
            </details>
            <p className="mt-4 text-xs text-fg-muted">{spanish ? "Caduca" : "Expires"}: {date(coupon.expiresAt)}<br />{spanish ? "Fuente comprobada" : "Source checked"}: {date(coupon.checkedAt)}</p>
          </div>
        </article>)}
      </div>
    </> : <p className="mt-10 rounded-2xl border border-border bg-surface p-6 text-fg-muted">{spanish ? "No hay códigos recientes disponibles para este país. Vuelve más tarde." : "No recent codes are available for this country. Check back later."}</p>}
  </div>;
}
