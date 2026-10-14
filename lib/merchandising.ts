import { cache } from "react";
import { adaptProduct, type RawProduct } from "./backendAdapter";
import { BACKEND_URL } from "./catalog";
import type { Deal } from "./types";

export type MerchandiseShelf = {
  id: string;
  title: string;
  kind: "seasonal" | "trend";
  confidence: string;
  sourceUrls: string[];
  endsAt: string;
  eventAt?: string | null;
  evidenceType?: string;
  interestSessions?: number | null;
  selectionEvidence?: Record<string, {matchedQuery: string; reviewsVerified?: boolean; arrivalEstimate?: string | null; destinationPostalCode?: string | null}>;
  products: Deal[];
};

// Optional shelves must never stop the ordinary catalogue from rendering.
export const getMerchandisingShelves = cache(async (
  market: string, language: string, category?: string,
): Promise<MerchandiseShelf[]> => {
  try {
    const params = new URLSearchParams({ market, lang: language });
    if (category) params.set("category", category);
    const response = await fetch(`${BACKEND_URL}/api/merchandising?${params}`, {
      cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const body = await response.json() as { shelves: Array<
      Omit<MerchandiseShelf, "products"> & { products: RawProduct[] }
    > };
    return (body.shelves || []).map(shelf => ({
      ...shelf,
      products: shelf.products.map((product, index) => ({
        ...adaptProduct(product), rank: index + 1,
      })),
    })).filter(shelf => shelf.products.length > 0);
  } catch {
    return [];
  }
});
