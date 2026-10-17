import {cache} from "react";
import {BACKEND_URL} from "./catalog";
import {adaptProduct, type RawProduct} from "./backendAdapter";

export type Brand = {
  brand: string;
  brand_slug: string;
  product_count: number;
  avg_rating: number | null;
  rated_products: number;
  url: string;
};

async function read(path: string) {
  const res = await fetch(BACKEND_URL + path, {cache: "no-store", signal: AbortSignal.timeout(15000)});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Brand data temporarily unavailable");
  return res.json();
}

export const getBrands = cache(async (market: string): Promise<Brand[]> =>
  await read("/api/brands?market=" + market) ?? []
);

export const getBrand = cache(async (market: string, slug: string, language: string) => {
  const data = await read("/api/brands/" + encodeURIComponent(slug) + "?market=" + market + "&lang=" + language + "&view=listing");
  if (!data) return null;
  return {
    brand: data.brand as string,
    summary: data.summary as {products: number; average_rating: number | null; rated_products: number},
    deals: (data.products as RawProduct[]).map((product, index) => ({...adaptProduct(product), rank: index + 1})),
  };
});
