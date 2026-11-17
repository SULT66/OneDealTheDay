"use client";

import {useEffect,useMemo,useState} from "react";

type BroadcastStatus={
  desired_state:"running"|"stopped";
  actual_state:"offline"|"starting"|"running"|"stopped"|"error";
  controller_online:boolean;
  last_seen:string|null;
  detail:string;
};

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
  const [matches,setMatches]=useState<CatalogProduct[]>([]);
  const [productSearchBusy,setProductSearchBusy]=useState(false);
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<number[]>([]);
  const [scripts,setScripts]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [showId,setShowId]=useState<number|null>(null);
  const [retryShowId,setRetryShowId]=useState<number|null>(null);
  const [broadcast,setBroadcast]=useState<BroadcastStatus|null>(null);
  const [controlBusy,setControlBusy]=useState(false);

  useEffect(()=>{
    let active=true;
    const term=query.trim();
    setMatches([]);
    if(!adminKey||term.length<2){setProductSearchBusy(false);return()=>{active=false;};}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      setProductSearchBusy(true);
      setNotice("");
      fetch("/api/admin/odd-tv/products?market="+encodeURIComponent(market)+"&q="+encodeURIComponent(term),{
        headers:{"X-Admin-Key":adminKey},cache:"no-store",signal:controller.signal,
      })
        .then(async response=>{
          if(!response.ok)throw new Error("Could not search published products.");
          return response.json();
        })
        .then((data:unknown)=>{
          const found=Array.isArray(data)?data.filter((item):item is CatalogProduct=>
            typeof item==="object"&&item!==null&&"id" in item&&"title" in item&&
            Number.isSafeInteger(item.id)&&Number(item.id)>0&&typeof item.title==="string"
          ):[];
          if(active){
            setMatches(found);
            setProducts(current=>{
              const byId=new Map(current.map(product=>[product.id,product]));
              for(const product of found)byId.set(product.id,product);
              return [...byId.values()];
            });
          }
        })
        .catch(error=>{if(active&&error?.name!=="AbortError")setNotice(error instanceof Error?error.message:"Could not load products.");})
        .finally(()=>{if(active)setProductSearchBusy(false);});
    },250);
    return()=>{active=false;window.clearTimeout(timer);controller.abort();};
  },[adminKey,market,query]);

  async function refreshBroadcast() {
    if(!adminKey)return;
    try{
      const response=await fetch("/api/admin/odd-tv/broadcast/status",{
        headers:{"X-Admin-Key":adminKey},cache:"no-store",
      });
      if(!response.ok)throw new Error("Broadcast control unavailable.");
      setBroadcast(await response.json() as BroadcastStatus);
    }catch{
      setBroadcast(null);
    }
  }

  useEffect(()=>{
    if(!adminKey){setBroadcast(null);return;}
    void refreshBroadcast();
    const timer=window.setInterval(()=>void refreshBroadcast(),5000);
    return()=>window.clearInterval(timer);
  },[adminKey]);

  async function setBroadcastState(desired_state:"running"|"stopped") {
    if(!adminKey){setNotice("Enter the admin key above first.");return;}
    setControlBusy(true);setNotice("");
    try{
      const response=await fetch("/api/admin/odd-tv/broadcast/control",{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Admin-Key":adminKey},
        body:JSON.stringify({desired_state}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Could not change broadcast state.");
      setBroadcast(result as BroadcastStatus);
      setNotice(desired_state==="running"
        ?"Start requested. Diana’s control service will launch the stream."
        :"Stop requested. Diana’s control service will stop the stream and end the show.");
    }catch(error){
      setNotice(error instanceof Error?error.message:"Could not change broadcast state.");
    }finally{setControlBusy(false);}
  }

  const visible=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return matches.filter(product=>
      !term||[product.title,product.brand,product.retailer_name].some(value=>String(value||"").toLowerCase().includes(term))
    ).slice(0,8);
  },[matches,query]);

  function toggle(id:number) {
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):current.length>=2?current:[...current,id]);
  }

  async function launch(manual:boolean) {
    if(!adminKey){setNotice("Enter the admin key above first.");return;}
    if(!broadcast){setNotice("Waiting for Diana’s controller status.");return;}
    if(!broadcast.controller_online){setNotice("Diana controller is offline. Start the stream and finish its one-time setup first.");return;}
    if(manual&&selected.length!==2){setNotice("Choose exactly 2 products for the 30/30 pilot.");return;}
    setBusy(true);setNotice("");setShowId(null);setRetryShowId(null);
    let createdShowId:number|null=null;
    try{
      const headers={"Content-Type":"application/json","X-Admin-Key":adminKey};
      const create=await fetch("/api/admin/odd-tv/show",{
        method:"POST",headers,
        body:JSON.stringify(manual?{market,product_ids:selected,scripts:selected.map(id=>scripts[id]||"")}:{market}),
      });
      const draft=await create.json().catch(()=>({}));
      if(!create.ok)throw new Error(draft.error||"Could not create the ODD Live show.");
      createdShowId=Number(draft.show_id);
      setShowId(createdShowId);
      const start=await fetch("/api/admin/odd-tv/show/"+encodeURIComponent(String(draft.show_id))+"/start",{
        method:"POST",headers,
      });
      const result=await start.json().catch(()=>({}));
      if(!start.ok)throw new Error(result.error||"Show was created but could not be started.");
      setRetryShowId(null);
      setNotice("Preparing the host and product segments. The show goes live when the opening is ready.");
    }catch(error){
      if(createdShowId!==null&&error instanceof Error&&error.message==="DIANA_CONTROLLER_OFFLINE")setRetryShowId(createdShowId);
      setNotice(error instanceof Error?error.message:"Could not start the show.");
    }finally{setBusy(false);}
  }

  async function retryStart(show:number) {
    if(!adminKey){setNotice("Enter the admin key above first.");return;}
    setBusy(true);setNotice("");
    try{
      const headers={"Content-Type":"application/json","X-Admin-Key":adminKey};
      const statusResponse=await fetch("/api/admin/odd-tv/broadcast/status",{headers,cache:"no-store"});
      const status=await statusResponse.json().catch(()=>({}));
      if(!statusResponse.ok)throw new Error(status.error||"Could not refresh controller status.");
      setBroadcast(status as BroadcastStatus);
      if(!status.controller_online){
        setNotice("Diana controller is offline. Show "+show+" is saved; start the controller, then retry this show.");
        return;
      }
      const response=await fetch("/api/admin/odd-tv/show/"+encodeURIComponent(String(show))+"/start",{
        method:"POST",headers,
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Could not start the saved show.");
      setRetryShowId(null);
      setNotice("Preparing the host and product segments. The show goes live when the opening is ready.");
    }catch(error){
      setNotice(error instanceof Error?error.message:"Could not start the saved show.");
    }finally{setBusy(false);}
  }

  const selectedProducts=selected.map(id=>products.find(product=>product.id===id)).filter((product):product is CatalogProduct=>Boolean(product));
  function addProduct(id:number){setSelected(current=>current.includes(id)||current.length>=2?current:[...current,id]);}
  function removeProduct(id:number){setSelected(current=>current.filter(value=>value!==id));setScripts(current=>{const next={...current};delete next[id];return next;});}

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-fg">ODD Live TV</h2>
          <p role="status" className="mt-1 text-xs text-fg-muted">
            {broadcast?(broadcast.controller_online?"Controller online · stream "+broadcast.actual_state:"Controller offline · last state "+broadcast.actual_state):"Enter the admin key to check stream status."}
            {broadcast?.detail?" · "+broadcast.detail:""}
          </p>
          {broadcast&&!broadcast.controller_online?<p className="mt-1 text-xs text-fg-muted">
            Start the one-time setup on Diana’s PC:{" "}
            <a className="underline" href="https://raw.githubusercontent.com/SULT66/OneDealTheDay/main/scripts/install-odd-live-button-control.ps1" target="_blank" rel="noreferrer">download setup</a>.
          </p>:null}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={controlBusy||Boolean(broadcast?.controller_online&&broadcast.desired_state==="running"&&broadcast.actual_state!=="error")} onClick={()=>void setBroadcastState("running")} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg disabled:opacity-50">{controlBusy?"Sending…":"Start stream"}</button>
          <button type="button" disabled={controlBusy||broadcast?.desired_state==="stopped"} onClick={()=>void setBroadcastState("stopped")} className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Stop stream</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-fg-muted">Choose two products. Add optional talking points; the local host uses your notes and verified product facts.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Market</span>
          <select value={market} onChange={event=>{setMarket(event.target.value);setSelected([]);setScripts({});}} className="mt-1 block h-10 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg">
            <option value="us">United States</option><option value="ca">Canada</option><option value="uk">United Kingdom</option><option value="de">Germany</option><option value="fr">France</option>
          </select>
        </label>
        <label className="min-w-56 flex-1"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Search published products</span>
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Type a product or store name" className="mt-1 h-10 w-full rounded-full border border-border bg-surface-2 px-4 text-sm text-fg"/>
        </label>
      </div>
      {query.trim()?<div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border">
        {visible.map(product=>{const index=selected.indexOf(product.id);return <div key={product.id} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
          {product.image_url?<img src={product.image_url} alt="" className="h-11 w-11 rounded-lg bg-white object-contain" loading="lazy"/>:null}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{product.title}</span><span className="text-xs text-fg-muted">{product.brand||product.retailer_name||"Published product"} · {product.currency||"USD"} {product.price??product.current_price??""}</span></span>
          {index>=0?<button type="button" onClick={()=>removeProduct(product.id)} className="rounded-full border border-border px-3 py-1.5 text-xs">Remove</button>:<button type="button" disabled={selected.length>=2||busy} onClick={()=>addProduct(product.id)} className="rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-50">Add product {selected.length+1}</button>}
        </div>;})}
        {visible.length===0?<p className="p-4 text-sm text-fg-muted">{productSearchBusy?"Searching products…":query.trim().length<2?"Enter at least 2 characters to search.":"No published products match."}</p>:null}
      </div>:null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[0,1].map(index=>{const product=selectedProducts[index];return <div key={index} className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Product {index+1} · minutes {index===0?"00–30":"30–60"}</p>
          {product?<><div className="mt-2 flex items-center gap-3">{product.image_url?<img src={product.image_url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain"/>:null}<p className="min-w-0 flex-1 text-sm font-semibold">{product.title}</p><button type="button" disabled={busy} onClick={()=>removeProduct(product.id)} className="text-xs underline">Remove</button></div>
            <label className="mt-3 block"><span className="text-xs font-semibold text-fg-muted">Talking points (optional)</span><textarea maxLength={12000} value={scripts[product.id]||""} onChange={event=>setScripts(current=>({...current,[product.id]:event.target.value}))} placeholder="Paste the product script or key points for the host." className="mt-1 min-h-24 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm"/></label>
          </>:<p className="mt-3 text-sm text-fg-muted">Search above and add a product here.</p>}
        </div>;})}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy||selected.length!==2||retryShowId!==null} onClick={()=>void launch(true)} className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink disabled:opacity-50">{busy?"Preparing show…":retryShowId!==null?"Show "+retryShowId+" saved":"Save scripts and start"}</button>
        {retryShowId!==null?<button type="button" disabled={busy} onClick={()=>void retryStart(retryShowId)} className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-fg disabled:opacity-50">Retry Show {retryShowId}</button>:null}
        <span className="text-sm text-fg-muted">{selected.length}/2 products selected</span>
      </div>
      {notice?<p role="status" className="mt-3 text-sm text-fg-muted">{notice}{showId?(" · Show "+showId):""}</p>:null}
    </section>
  );
}
