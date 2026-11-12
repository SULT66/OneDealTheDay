"use client";

import {useEffect,useMemo,useState} from "react";

type CatalogProduct={
  id:number;
  title:string;
  brand?:string|null;
  retailer_name?:string|null;
  current_price?:number|null;
  price?:number|null;
  currency?:string|null;
  image_url?:string|null;
};

export function ODDTVConsole({adminKey}:{adminKey:string}) {
  const [market,setMarket]=useState("us");
  const [products,setProducts]=useState<CatalogProduct[]>([]);
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [showId,setShowId]=useState<number|null>(null);

  useEffect(()=>{
    setProducts([]);
    if(!adminKey)return;
    let active=true;
    fetch("/api/products?market="+encodeURIComponent(market),{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)throw new Error("Could not load published products.");
        return response.json();
      })
      .then((data:unknown)=>{
        if(active)setProducts(Array.isArray(data)?data.filter((item):item is CatalogProduct=>
          typeof item==="object"&&item!==null&&"id" in item&&"title" in item&&
          Number.isSafeInteger(item.id)&&Number(item.id)>0&&typeof item.title==="string"
        ):[]);
      })
      .catch(error=>{if(active)setNotice(error instanceof Error?error.message:"Could not load products.");});
    return()=>{active=false;};
  },[adminKey,market]);

  const visible=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return products.filter(product=>
      !term||[product.title,product.brand,product.retailer_name].some(value=>String(value||"").toLowerCase().includes(term))
    ).slice(0,100);
  },[products,query]);

  function toggle(id:number) {
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):current.length>=10?current:[...current,id]);
  }

  async function launch(manual:boolean) {
    if(!adminKey){setNotice("Enter the admin key above first.");return;}
    if(manual&&(selected.length<8||selected.length>10)){setNotice("Choose 8 to 10 products.");return;}
    setBusy(true);setNotice("");setShowId(null);
    try{
      const headers={"Content-Type":"application/json","X-Admin-Key":adminKey};
      const create=await fetch("/api/admin/odd-tv/show",{
        method:"POST",headers,
        body:JSON.stringify(manual?{market,product_ids:selected}:{market}),
      });
      const draft=await create.json().catch(()=>({}));
      if(!create.ok)throw new Error(draft.error||"Could not create the ODD Live show.");
      setShowId(draft.show_id);
      const start=await fetch("/api/admin/odd-tv/show/"+encodeURIComponent(String(draft.show_id))+"/start",{
        method:"POST",headers,
      });
      const result=await start.json().catch(()=>({}));
      if(!start.ok)throw new Error(result.error||"Show was created but could not be started.");
      setNotice("ODD Live is on air with "+(manual?selected.length:"automatically selected")+" products.");
    }catch(error){
      setNotice(error instanceof Error?error.message:"Could not start the show.");
    }finally{setBusy(false);}
  }

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-bold text-fg">ODD Live TV products</h2>
      <p className="mt-1 max-w-prose text-sm text-fg-muted">
        Published products are already in the catalog. Choose 8–10 for a custom show, or let ODD Live select an eligible lineup across merchants. The live page changes its featured product about every six minutes during the one-hour show.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Market</span>
          <select value={market} onChange={event=>{setMarket(event.target.value);setSelected([]);}} className="mt-1 block h-10 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg">
            <option value="us">United States</option>
            <option value="ca">Canada</option>
            <option value="uk">United Kingdom</option>
            <option value="de">Germany</option>
            <option value="fr">France</option>
          </select>
        </label>
        <label className="min-w-56 flex-1">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Find published products ({products.length})</span>
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search title or store" className="mt-1 h-10 w-full rounded-full border border-border bg-surface-2 px-4 text-sm text-fg" />
        </label>
        <span className="text-sm font-semibold text-fg-muted">{selected.length}/10 selected</span>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border">
        {visible.map(product=>(
          <label key={product.id} className="flex cursor-pointer items-center gap-3 border-b border-border p-3 last:border-b-0 hover:bg-surface-2">
            <input type="checkbox" checked={selected.includes(product.id)} disabled={!selected.includes(product.id)&&selected.length>=10||busy} onChange={()=>toggle(product.id)} />
            {product.image_url?<img src={product.image_url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain" loading="lazy"/>:null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{product.title}</span>
              <span className="block text-xs text-fg-muted">{product.brand||product.retailer_name||"Published product"} · ID {product.id}</span>
            </span>
            {(product.price??product.current_price)!=null?<span className="text-xs text-fg-muted">{product.currency||""} {product.price??product.current_price}</span>:null}
          </label>
        ))}
        {visible.length===0?<p className="p-4 text-sm text-fg-muted">No published products match.</p>:null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy||selected.length<8||selected.length>10} onClick={()=>void launch(true)} className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">
          {busy?"Starting…":"Start with selected products"}
        </button>
        <button type="button" disabled={busy} onClick={()=>void launch(false)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg disabled:opacity-50">
          Auto-select products and start
        </button>
      </div>
      {notice?<p role="status" className="mt-3 text-sm text-fg-muted">{notice}{showId?(" · Show "+showId):""}</p>:null}
    </section>
  );
}
