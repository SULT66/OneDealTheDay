"use client";

import {useEffect,useState} from "react";

type BroadcastStatus={
  desired_state:"running"|"stopped";
  actual_state:"offline"|"starting"|"running"|"stopped"|"error";
  controller_online:boolean;
  last_seen:string|null;
  detail:string;
  show?:{id:number;start_at:string;qna_start_at:string|null;end_at:string;error?:string|null;phase:"rendering"|"scheduled"|"live"|"questions"|"error"}|null;
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
  const [productSearchError,setProductSearchError]=useState("");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [showId,setShowId]=useState<number|null>(null);
  const [retryShowId,setRetryShowId]=useState<number|null>(null);
  const [broadcast,setBroadcast]=useState<BroadcastStatus|null>(null);
  const [controlBusy,setControlBusy]=useState(false);
  const [scripted,setScripted]=useState(true);
  const [script,setScript]=useState("");
  const [scheduledAt,setScheduledAt]=useState("");
  const [duration,setDuration]=useState("12");
  const [generating,setGenerating]=useState(false);
  const productLimit=scripted?1:2;
  const totalMinutes=Number(duration);
  const validDuration=Number.isInteger(totalMinutes)&&totalMinutes>=11&&totalMinutes<=30;
  const scriptWords=script.trim()?script.trim().split(/\s+/).length:0;

  useEffect(()=>{
    try{
      const pending=Number(window.sessionStorage.getItem("odd-live-pending-show"));
      if(Number.isSafeInteger(pending)&&pending>0){
        setShowId(pending);setRetryShowId(pending);setNotice("DIANA_CONTROLLER_OFFLINE");
      }
    }catch{}
  },[]);
  useEffect(()=>{
    if(!adminKey)return;
    let active=true;
    const controller=new AbortController();
    fetch("/api/admin/odd-tv/show/pending",{
      headers:{"X-Admin-Key":adminKey},cache:"no-store",signal:controller.signal,
    })
      .then(async response=>{
        if(!response.ok)throw new Error("Could not check for a saved show.");
        return response.json();
      })
      .then((data:{show_id?:number|null})=>{
        const pending=Number(data?.show_id);
        if(active&&Number.isSafeInteger(pending)&&pending>0){
          setShowId(pending);setRetryShowId(pending);setNotice("DIANA_CONTROLLER_OFFLINE");
          try{window.sessionStorage.setItem("odd-live-pending-show",String(pending));}catch{}
        }
      })
      .catch(error=>{if(active&&error?.name!=="AbortError")setNotice(error instanceof Error?error.message:"Could not check for a saved show.");});
    return()=>{active=false;controller.abort();};
  },[adminKey]);

  useEffect(()=>{
    let active=true;
    const term=query.trim();
    setMatches([]);
    setProductSearchError("");
    if(!adminKey||term.length<2){setProductSearchBusy(false);return()=>{active=false;};}
    setProductSearchBusy(true);
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      fetch("/api/admin/odd-tv/products?market="+encodeURIComponent(market)+"&q="+encodeURIComponent(term),{
        headers:{"X-Admin-Key":adminKey},cache:"no-store",signal:controller.signal,
      })
        .then(async response=>{
          if(response.status===401)throw new Error("The admin key was not accepted. Check the key above.");
          if(!response.ok)throw new Error("Could not search published products.");
          return response.json();
        })
        .then((data:unknown)=>{
          if(!Array.isArray(data))throw new Error("The catalogue did not return search results. Try again.");
          const found=data.filter((item):item is CatalogProduct=>
            typeof item==="object"&&item!==null&&"id" in item&&"title" in item&&
            Number.isSafeInteger(item.id)&&Number(item.id)>0&&typeof item.title==="string"
          );
          if(active){
            setMatches(found);
            setProducts(current=>{
              const byId=new Map(current.map(product=>[product.id,product]));
              for(const product of found)byId.set(product.id,product);
              return [...byId.values()];
            });
          }
        })
        .catch(error=>{if(active&&error?.name!=="AbortError")setProductSearchError(error instanceof Error?error.message:"Could not load products.");})
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

  async function generateScript() {
    if(!adminKey||selected.length!==1||!validDuration)return;
    setGenerating(true);setNotice("");
    try{
      const response=await fetch("/api/admin/odd-tv/script",{
        method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":adminKey},
        body:JSON.stringify({market,product_id:selected[0],duration_minutes:totalMinutes}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||typeof result.script!=="string")throw new Error(result.error||"Could not generate the script.");
      setScript(result.script);
    }catch(error){setNotice(error instanceof Error?error.message:"Could not generate the script.");}
    finally{setGenerating(false);}
  }

  async function launch(manual:boolean) {
    if(!adminKey){setNotice("Enter the admin key above first.");return;}
    if(!broadcast){setNotice("Waiting for Diana’s controller status.");return;}
    if(!broadcast.controller_online){setNotice("Diana controller is offline. Start the stream and finish its one-time setup first.");return;}
    if(manual&&selected.length!==productLimit){setNotice("Choose the products required for this format.");return;}
    const scheduled=scheduledAt?new Date(scheduledAt):null;
    if(scripted&&scheduled&&(!Number.isFinite(scheduled.getTime())||scheduled.getTime()<=Date.now())){
      setNotice("Choose a future start time or leave it blank.");return;
    }
    setBusy(true);setNotice("");setShowId(null);setRetryShowId(null);
    let createdShowId:number|null=null;
    try{
      const headers={"Content-Type":"application/json","X-Admin-Key":adminKey};
      const create=await fetch("/api/admin/odd-tv/show",{
        method:"POST",headers,
        body:JSON.stringify(scripted?{market,product_ids:selected,script,scheduled_at:scheduled?.toISOString()??null,duration_minutes:totalMinutes}
          :manual?{market,product_ids:selected}:{market}),
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
      try{window.sessionStorage.removeItem("odd-live-pending-show");}catch{}
      setNotice(scripted?"Diana is rendering the full presentation. The show starts when ready and at or after the selected time."
        :"Preparing the live host. The show goes on air when the opening is ready.");
      await refreshBroadcast();
    }catch(error){
      if(createdShowId!==null&&error instanceof Error&&error.message==="DIANA_CONTROLLER_OFFLINE"){
        setRetryShowId(createdShowId);
        try{window.sessionStorage.setItem("odd-live-pending-show",String(createdShowId));}catch{}
      }
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
      try{window.sessionStorage.removeItem("odd-live-pending-show");}catch{}
      setNotice("Preparing the live host. The show goes on air when the opening is ready.");
    }catch(error){
      setNotice(error instanceof Error?error.message:"Could not start the saved show.");
    }finally{setBusy(false);}
  }

  const selectedProducts=selected.map(id=>products.find(product=>product.id===id)).filter((product):product is CatalogProduct=>Boolean(product));
  function addProduct(id:number){setSelected(current=>current.includes(id)||current.length>=productLimit?current:[...current,id]);}
  function removeProduct(id:number){setSelected(current=>current.filter(value=>value!==id));if(scripted)setScript("");}

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
      {broadcast?.show?<p role="status" className="mt-3 text-sm font-semibold">
        {broadcast.show.phase==="error"?(broadcast.show.error==="script_length"
          ?"The recorded script does not fit the presentation time. Stop the stream and adjust the script or duration."
          :broadcast.show.error==="update_required"?"Update the Diana worker to render this show."
          :"Diana could not render the presentation. Stop the stream before retrying.")
          :broadcast.show.phase==="rendering"?"Rendering the presentation on Diana"
          :broadcast.show.phase==="scheduled"?`Scheduled for ${new Date(broadcast.show.start_at).toLocaleString()}`
          :broadcast.show.phase==="questions"?"Live Q&A":"Presentation on air"}
        {broadcast.show.qna_start_at?` · Q&A ${new Date(broadcast.show.qna_start_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:""}
      </p>:null}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Show format</span>
          <select disabled={busy||generating} value={scripted?"scripted":"live"} onChange={event=>{setScripted(event.target.value==="scripted");setSelected([]);setScript("");}} className="mt-1 block h-10 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg">
            <option value="scripted">Scripted presentation + live Q&A</option><option value="live">Two-product live narration</option>
          </select>
        </label>
        <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Market</span>
          <select disabled={busy||generating} value={market} onChange={event=>{setMarket(event.target.value);setSelected([]);setScript("");}} className="mt-1 block h-10 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg">
            <option value="us">United States</option><option value="ca">Canada</option><option value="uk">United Kingdom</option><option value="de">Germany</option><option value="fr">France</option>
          </select>
        </label>
        <label className="min-w-56 flex-1"><span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Search published products</span>
          <input value={query} disabled={!adminKey} onChange={event=>setQuery(event.target.value)} placeholder={adminKey?"Type a product or store name":"Enter the admin key to search"} className="mt-1 h-10 w-full rounded-full border border-border bg-surface-2 px-4 text-sm text-fg disabled:opacity-60"/>
        </label>
      </div>
      {!adminKey?<p className="mt-3 text-sm text-fg-muted"><button type="button" onClick={()=>document.getElementById("admin-access-key")?.focus()} className="font-semibold underline">Enter the admin key</button> to search published products.</p>:null}
      {adminKey&&query.trim()?<div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border" aria-busy={productSearchBusy}>
        {matches.map(product=>{const index=selected.indexOf(product.id);return <div key={product.id} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
          {product.image_url?<img src={product.image_url} alt="" className="h-11 w-11 rounded-lg bg-white object-contain" loading="lazy"/>:null}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{product.title}</span><span className="text-xs text-fg-muted">{product.brand||product.retailer_name||"Published product"} · {product.currency||"USD"} {product.price??product.current_price??""}</span></span>
          {index>=0?<button type="button" disabled={busy||generating} onClick={()=>removeProduct(product.id)} className="rounded-full border border-border px-3 py-1.5 text-xs">Remove</button>:<button type="button" disabled={selected.length>=productLimit||busy||generating} onClick={()=>addProduct(product.id)} className="rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-50">Add product {selected.length+1}</button>}
        </div>;})}
        {matches.length===0?<p role="status" className="p-4 text-sm text-fg-muted">{productSearchBusy?"Searching products…":productSearchError|| (query.trim().length<2?"Enter at least 2 characters to search.":"No published products match in this market.")}</p>:null}
      </div>:null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(scripted?[0]:[0,1]).map(index=>{const product=selectedProducts[index];return <div key={index} className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">{scripted?"Featured product":`Product ${index+1} · minutes ${index===0?"00–30":"30–60"}`}</p>
          {product?<><div className="mt-2 flex items-center gap-3">{product.image_url?<img src={product.image_url} alt="" className="h-12 w-12 rounded-lg bg-white object-contain"/>:null}<p className="min-w-0 flex-1 text-sm font-semibold">{product.title}</p><button type="button" disabled={busy||generating} onClick={()=>removeProduct(product.id)} className="text-xs underline">Remove</button></div>
          </>:<p className="mt-3 text-sm text-fg-muted">Search above and add a product here.</p>}
        </div>;})}
      </div>
      {scripted?<div className="mt-4 space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-sm font-semibold">Start time (local)</span>
            <input type="datetime-local" value={scheduledAt} disabled={busy} onChange={event=>setScheduledAt(event.target.value)} className="mt-1 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"/>
          </label>
          <label className="block"><span className="text-sm font-semibold">Total show length (min)</span>
            <input type="number" min={11} max={30} step={1} value={duration} disabled={busy||generating} onChange={event=>setDuration(event.target.value)} className="mt-1 block w-32 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"/>
          </label>
          <span className="text-sm text-fg-muted">{validDuration?`${totalMinutes-10} min presentation + 10 min live Q&A.`:"Choose 11–30 minutes."} Leave the start time blank to go live when ready.</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="odd-tv-script" className="text-sm font-semibold">Chloe’s script</label>
          <button type="button" disabled={busy||generating||!validDuration||selected.length!==1} onClick={()=>void generateScript()} className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">{generating?"Generating…":script?"Regenerate script":"Generate with AI"}</button>
        </div>
        <textarea id="odd-tv-script" rows={8} maxLength={24000} disabled={busy||generating} value={script} onChange={event=>setScript(event.target.value)} className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm" placeholder="Generate a draft or paste your own script."/>
        <p className="text-xs text-fg-muted">{scriptWords} words{validDuration?` · aim for about ${(totalMinutes-10)*150}`:""}</p>
      </div>:null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy||generating||selected.length!==productLimit||(scripted&&(!validDuration||script.trim().length<20))||retryShowId!==null||Boolean(broadcast?.show)} onClick={()=>void launch(true)} className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink disabled:opacity-50">{busy?"Preparing show…":retryShowId!==null?"Show "+retryShowId+" saved":scripted?(scheduledAt?"Schedule show":"Prepare and start show"):"Save products and start"}</button>
        {retryShowId!==null?<button type="button" disabled={busy} onClick={()=>void retryStart(retryShowId)} className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-fg disabled:opacity-50">Retry Show {retryShowId}</button>:null}
        <span className="text-sm text-fg-muted">{selected.length}/{productLimit} products selected</span>
      </div>
      {notice?<p role="status" className="mt-3 text-sm text-fg-muted">{notice}{showId?(" · Show "+showId):""}</p>:null}
    </section>
  );
}
