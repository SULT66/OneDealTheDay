"use client";

import {useCallback,useEffect,useState} from "react";
import {analyticsSessionId} from "@/lib/analyticsSession";

type Product = {
  id:number;title:string;brand:string|null;retailer_name:string|null;
  description:string|null;price:number|null;currency:string|null;
  image_url:string|null;affiliate_url:string|null;price_verified:boolean;
};
type Show = {show_id:number;state:string;product_index:number;product_count:number;product:Product|null};
type ChatLine = {id:number;author:string;text:string;created_at:string;status:string};

export function ODDLiveTvExperience({market}:{market:string}) {
  const [show,setShow]=useState<Show|null>(null);
  const [messages,setMessages]=useState<ChatLine[]>([]);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const refresh=useCallback(async()=>{
    const current=await fetch("/api/odd-tv/live?market="+encodeURIComponent(market),{cache:"no-store"}).catch(()=>null);
    if(!current?.ok)return;
    const data=(await current.json().catch(()=>({}))) as {show?:Show|null};
    setShow(data.show||null);
    if(!data.show){setMessages([]);return;}
    const chat=await fetch("/api/odd-tv/chat?market="+encodeURIComponent(market),{cache:"no-store"}).catch(()=>null);
    if(chat?.ok){
      const body=(await chat.json().catch(()=>({}))) as {messages?:ChatLine[]};
      setMessages(body.messages||[]);
    }
  },[market]);
  useEffect(()=>{
    void refresh();
    const timer=setInterval(()=>void refresh(),5000);
    return()=>clearInterval(timer);
  },[refresh]);
  async function sendQuestion(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text=draft.trim();
    if(!show||text.length<2||text.length>200||sending)return;
    setSending(true);setNotice("");
    try{
      const res=await fetch("/api/odd-tv/chat",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({market,text,session_id:analyticsSessionId()})
      });
      const body=await res.json().catch(()=>({}));
      if(!res.ok){setNotice(String(body.error||"Could not send question."));return;}
      setDraft("");setNotice("Question added to Chloe's queue.");
      void refresh();
    }catch{setNotice("Unable to connect to chat right now.");}
    finally{setSending(false);}
  }
  const product=show?.product;
  const price=product?.price!=null && product.currency
    ? new Intl.NumberFormat(market==="us"?"en-US":"en-US",{style:"currency",currency:product.currency}).format(product.price)
    : null;
  return (
    <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {!show ? <p className="text-sm text-white/70">The next ODD Live shopping show has not started yet.</p> :
          <>
            <p className="mb-2 text-xs font-bold tracking-wider text-lime-300">ON AIR · PRODUCT {show.product_index} OF {show.product_count}</p>
            {product ? <div className="flex gap-4 rounded-xl bg-white/10 p-3">
              {product.image_url ? <img src={product.image_url} alt={product.title} className="h-28 w-28 shrink-0 rounded-lg bg-white object-contain" loading="lazy" />:null}
              <div className="min-w-0">
                <h3 className="font-bold">{product.title}</h3>
                <p className="mt-1 text-sm text-white/70">{product.brand||product.retailer_name||"Featured product"}</p>
                {price ? <p className="mt-2 font-semibold">{price}</p> : <p className="mt-2 text-xs text-white/70">Check retailer for current price</p>}
                {product.affiliate_url ? <a href={product.affiliate_url} target="_blank" rel="noopener sponsored" className="mt-3 inline-block rounded-full bg-lime-300 px-4 py-2 text-sm font-bold text-black">See at retailer</a>:null}
              </div>
            </div>:<p>Featured product information is currently unavailable.</p>}
          </>
        }
      </div>
      <aside aria-label="ODD Live audience chat" className="rounded-xl border border-white/15 bg-black/30 p-3">
        <h3 className="font-bold">Ask Chloe live</h3>
        <p className="mt-1 text-xs text-white/60">Questions are visible to viewers. Chloe answers selected questions when ready.</p>
        <div role="log" aria-live="polite" className="mt-3 h-52 space-y-2 overflow-y-auto text-sm">
          {messages.length===0 ? <p className="text-white/60">No questions yet.</p> : messages.map(msg=>
            <p key={msg.id} className="rounded-lg bg-white/10 p-2"><span className="font-semibold">{msg.author}: </span>{msg.text}</p>
          )}
        </div>
        <form onSubmit={sendQuestion} className="mt-3 space-y-2">
          <label htmlFor="odd-tv-question" className="text-xs text-white/80">Your product question</label>
          <input id="odd-tv-question" className="w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/40" placeholder="Does it make cappuccino?" maxLength={200} value={draft} disabled={!show||sending} onChange={event=>setDraft(event.target.value)}/>
          <button disabled={!show||sending||draft.trim().length<2} type="submit" className="rounded-full bg-lime-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{sending?"Sending…":"Ask Chloe"}</button>
          {notice ? <p role="status" className="text-xs text-white/70">{notice}</p>:null}
        </form>
      </aside>
    </div>
  );
}
