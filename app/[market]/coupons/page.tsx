import type { Metadata } from "next";
import Link from "next/link";
import { getMerchantCoupons } from "@/lib/catalog";
import { getLanguage } from "@/lib/i18n";
import { CouponCatalog } from "@/components/coupons/CouponCatalog";

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
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
    <Link href={`/${market}`} className="text-sm text-fg-muted hover:text-fg">{spanish ? "Inicio" : "Home"}</Link>
    <div className="mt-6 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">{spanish ? "Ahorra al pagar" : "Save at checkout"}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-5xl">{spanish ? "Cupones y códigos de descuento" : "Coupons & promo codes"}</h1>
      <p className="mt-4 text-lg leading-relaxed text-fg-muted">{spanish ? "Copia un código, visita la tienda y pégalo al pagar. Consulta las condiciones antes de comprar." : "Copy a code, visit the store and paste it at checkout. Check the terms before you buy."}</p>
      <p className="mt-3 text-sm text-fg-muted">{spanish ? "Códigos publicados por las tiendas; no probados mediante una compra. La tienda confirma el descuento al pagar. Podemos recibir una comisión por compras realizadas a través de nuestros enlaces." : "Codes supplied by the stores; not tested by making a purchase. The store confirms the discount at checkout. We may earn a commission from purchases through our links."}</p>
    </div>
    <CouponCatalog coupons={coupons} spanish={spanish} />
  </div>;
}
