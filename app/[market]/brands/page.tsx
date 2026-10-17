import {ProgressLink as Link} from "@/components/site/ProgressLink";
import {getBrands} from "@/lib/brands";
import {getLanguage, t} from "@/lib/i18n";
import {Pagination} from "@/components/catalog/Pagination";
import {BrandSearch} from "@/components/catalog/BrandSearch";

export async function generateMetadata({params}: PageProps<'/[market]/brands'>) {
  const {market} = await params;
  const language = await getLanguage(market);
  return {title: t(language, "page.popularBrands"), alternates: {canonical: "/" + market + "/brands"}};
}

export default async function BrandsPage({params, searchParams}: PageProps<'/[market]/brands'>) {
  const {market} = await params;
  const query = await searchParams;
  const language = await getLanguage(market);
  const q = String(query.q ?? "").trim();
  const brands = (await getBrands(market)).filter(b => b.brand.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  const totalPages = Math.max(1, Math.ceil(brands.length / 24));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(query.page) || 1)));
  return <section className="mx-auto max-w-4xl px-5 py-10">
    <h1 className="text-3xl font-bold">{t(language, "page.popularBrands")}</h1>
    <BrandSearch market={market} query={q}/>
    <p className="mb-4 text-sm text-fg-muted">
      {t(language, brands.length === 1 ? "app.brands.countOne" : "app.brands.count", {count: brands.length})}
    </p>
    {!brands.length && <p>{t(language, "app.list.noMatches")}</p>}
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {brands.slice((page - 1) * 24, page * 24).map(b => <li key={b.brand_slug}>
        <Link href={"/" + market + "/brand/" + b.brand_slug}
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2">
          <span className="text-lg font-semibold">{b.brand}</span>
          <span className="text-sm text-fg-muted">
            {b.product_count} {t(language, "page.products")} · {b.avg_rating == null ? t(language, "page.noRatingData") : b.avg_rating.toFixed(1) + " / 5"}
            <span className="block text-xs">{t(language, "page.ratingCoverage", {rated: b.rated_products, total: b.product_count})}</span>
          </span>
        </Link>
      </li>)}
    </ul>
    <Pagination page={page} totalPages={totalPages}
      hrefForPage={n => "/" + market + "/brands?" + new URLSearchParams({...q ? {q} : {}, ...n > 1 ? {page: String(n)} : {}})}
      label={t(language, "app.list.pagination")} previousLabel={t(language, "app.list.previousPage")} nextLabel={t(language, "app.list.nextPage")}/>
  </section>;
}
