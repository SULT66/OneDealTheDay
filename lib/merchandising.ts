import { cache } from "react";
import { adaptProduct, type RawProduct } from "./backendAdapter";
import { BACKEND_URL } from "./catalog";
import type { Deal } from "./types";
import { activeHalloween } from "@/src/merchandisingCalendar";

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
  selectionEvidence?: Record<string, {matchedQuery: string; reviewsVerified?: boolean; ebaySoldQuantity?: number | null; ebaySalesEvidence?: {basis: 'api_estimate' | 'listing_report'; sourceUrl?: string | null; retrievedAt?: string; snapshot?: string; scope?: string} | null; arrivalEstimate?: string | null; destinationPostalCode?: string | null}>;
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

export type HalloweenCollection={active:boolean;unavailable?:boolean;total:number;page:number;pages:number;products:Deal[];
  selectionEvidence:Record<string,{arrivalEstimate?:string;ebaySoldQuantity?:number|null}>};
export async function getHalloweenCollection(market:string,language:string,page:number,q:string,sort:string,preview=false):Promise<HalloweenCollection> {
  const empty={active:Boolean(activeHalloween({market})),unavailable:true,total:0,page:1,pages:0,products:[],selectionEvidence:{}};
  try {
    const params=new URLSearchParams({market,lang:language,collection:'halloween',page:String(page),q,sort});
    if(preview) params.set('preview','1');
    const response=await fetch(`${BACKEND_URL}/api/merchandising?${params}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok) return empty;
    const body=await response.json();
    return {...empty,...body,unavailable:false,products:(body.products || []).map((p:RawProduct,index:number)=>({...adaptProduct(p),rank:index+1}))};
  } catch {return empty;}
}
