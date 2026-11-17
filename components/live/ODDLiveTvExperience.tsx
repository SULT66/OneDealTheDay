"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {analyticsSessionId} from "@/lib/analyticsSession";

type Product = {
  id:number;title:string;brand:string|null;retailer_name:string|null;
  description:string|null;price:number|null;currency:string|null;
  image_url:string|null;affiliate_url:string|null;price_verified:boolean;
};
type Show = {
  show_id:number;state:string;product_index:number;product_count:number;
  start_at:string;end_at:string;seconds_remaining:number;viewer_count:number;
  product:Product|null;
};
type ChatLine = {id:number;author:string;text:string;created_at:string;status:string};
type Props = {
  market:string;compact?:boolean;chatOpen?:boolean;onChatToggle?:()=>void;
  onFullscreen?:()=>void;onSizeToggle?:()=>void;onCompactToggle?:()=>void;expanded?:boolean;
};

const clock=(seconds:number)=>{
  const total=Math.max(0,Math.floor(seconds));
  const hh=Math.floor(total/3600),mm=Math.floor((total%3600)/60),ss=total%60;
  const pad=(n:number)=>String(n).padStart(2,"0");
  return hh?hh+":"+pad(mm)+":"+pad(ss):pad(mm)+":"+pad(ss);
};

export function ODDLiveTvExperience({
  market,compact=false,chatOpen=false,onChatToggle,onFullscreen,onSizeToggle,
  onCompactToggle,expanded=false,
}:Props) {
  const [show,setShow]=useState<Show|null>(null);
  const [messages,setMessages]=useState<ChatLine[]>([]);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const [remaining,setRemaining]=useState(0);
  const [viewerCount,setViewerCount]=useState(0);

  const refresh=useCallback(async()=>{
    const current=await fetch("/api/odd-tv/live?market="+encodeURIComponent(market),{cache:"no-store"}).catch(()=>null);
    if(!current?.ok)return;
    const data=(await current.json().catch(()=>({}))) as {show?:Show|null};
    const next=data.show||null;
    setShow(next);
    if(next){
      setRemaining(Number(next.seconds_remaining)||0);
      setViewerCount(Number(next.viewer_count)||0);
      const chat=await fetch("/api/odd-tv/chat?market="+encodeURIComponent(market),{cache:"no-store"}).catch(()=>null);
      if(chat?.ok){
        const body=(await chat.json().catch(()=>({}))) as {messages?:ChatLine[]};
        setMessages(body.messages||[]);
      }
    }else{
      setMessages([]);
      setViewerCount(0);
    }
  },[market]);

  useEffect(()=>{
    void refresh();
    const timer=setInterval(()=>void refresh(),5000);
    return()=>clearInterval(timer);
  },[refresh]);

  useEffect(()=>{
    const timer=setInterval(()=>setRemaining(value=>Math.max(0,value-1)),1000);
    return()=>clearInterval(timer);
  },[]);

  useEffect(()=>{
    if(!show?.show_id)return;
    let disposed=false;
    const showId=show.show_id;
    const sendPresence=async(active:boolean)=>{
      try{
        const response=await fetch("/api/odd-tv/viewers",{
          method:"POST",keepalive:!active,headers:{"Content-Type":"application/json"},
          body:JSON.stringify({market,show_id:showId,session_id:analyticsSessionId(),active}),
        });
        const data=await response.json().catch(()=>({})) as {viewer_count?:number};
        if(!disposed&&active&&Number.isFinite(data.viewer_count))
          setViewerCount(Number(data.viewer_count));
      }catch{}
    };
    const pulse=()=>void sendPresence(document.visibilityState==="visible");
    const leave=()=>void sendPresence(false);
    pulse();
    const timer=setInterval(pulse,12000);
    document.addEventListener("visibilitychange",pulse);
    window.addEventListener("pagehide",leave);
    return()=>{
      disposed=true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange",pulse);
      window.removeEventListener("pagehide",leave);
      void sendPresence(false);
    };
  },[market,show?.show_id]);

  async function sendQuestion(event:FormEvent<HTMLFormElement>) {
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
      setDraft("");setNotice("Question sent — queued for the next Q&A break.");
      void refresh();
    }catch{setNotice("Unable to connect to chat right now.");}
    finally{setSending(false);}
  }

  const product=show?.product;
  const price=product?.price!=null&&product.currency
    ?new Intl.NumberFormat("en-US",{style:"currency",currency:product.currency}).format(product.price)
    :null;

  return (
    <>
      <div className="pointer-events-none absolute left-0 top-0 z-20 aspect-video w-full">
        <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2 sm:left-5 sm:right-5 sm:top-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-red-300/40 bg-red-700/90 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-lg">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/90"/>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white"/>
            </span>
            LIVE
            {show?<span className="font-mono tabular-nums">{clock(remaining)}</span>:null}
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {show?<span className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white shadow-lg" aria-live="polite">◉ {viewerCount} watching</span>:null}
            <button type="button" onClick={onSizeToggle} className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-black/85" aria-label={expanded?"Return to normal size":"Enlarge live player"}>
              {expanded?"−":"＋"}
            </button>
            <button type="button" onClick={onFullscreen} className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-black/85" aria-label="Watch full screen">⛶</button>
            <button type="button" onClick={onCompactToggle} className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-black/85" aria-label={compact?"Restore live player":"Minimize live player"}>{compact?"↗":"−"}</button>
          </div>
        </div>

        {compact&&!chatOpen?(
          <button type="button" onClick={onChatToggle} className="pointer-events-auto absolute bottom-3 right-3 rounded-full bg-black/75 px-3 py-2 text-xs font-bold text-white shadow-lg">
            {"Chat"+(messages.length?" · "+messages.length:"")}
          </button>
        ):null}

        {(!compact||chatOpen)?(
          <aside aria-label="ODD Live audience chat" className="pointer-events-auto absolute bottom-10 right-2 flex max-h-[47%] w-[min(78%,330px)] flex-col overflow-hidden rounded-xl border border-white/25 bg-[#061224]/85 p-2.5 text-white shadow-xl backdrop-blur-md sm:bottom-12 sm:right-4 sm:p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black">Ask Chloe live</h3>
                <p className="text-[10px] text-white/65">Questions are answered in scheduled breaks</p>
              </div>
              {compact?<button type="button" onClick={onChatToggle} className="rounded-full px-2 py-1 text-lg leading-none text-white/80" aria-label="Close chat">×</button>:null}
            </div>
            <div role="log" aria-live="polite" className="mt-2 min-h-8 flex-1 space-y-1.5 overflow-y-auto text-xs">
              {messages.length===0?<p className="text-white/65">No questions yet. Be the first.</p>:messages.slice(-8).map(msg=>
                <p key={msg.id} className="rounded-lg bg-white/10 px-2 py-1.5">
                  <span className="font-bold">{msg.author}: </span>{msg.text}
                  <span className="ml-1 text-[10px] text-lime-200/80">
                    {msg.status==="sent"?"Answered":msg.status==="queued"?"Queued for Q&A":""}
                  </span>
                </p>
              )}
            </div>
            <form onSubmit={sendQuestion} className="mt-2 flex gap-1.5">
              <label htmlFor="odd-tv-question" className="sr-only">Your product question</label>
              <input id="odd-tv-question" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-xs text-white placeholder:text-white/45" placeholder="Ask about this product…" maxLength={200} value={draft} disabled={!show||sending} onChange={event=>setDraft(event.target.value)}/>
              <button disabled={!show||sending||draft.trim().length<2} type="submit" className="shrink-0 rounded-lg bg-lime-300 px-3 py-2 text-xs font-black text-black disabled:opacity-50">{sending?"…":"Send"}</button>
            </form>
            {notice?<p role="status" className="mt-1 text-[10px] text-white/75">{notice}</p>:null}
          </aside>
        ):null}

        {!show?<div className="pointer-events-auto absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">Waiting for the next scheduled ODD Live show.</div>:null}

        {!compact&&product?<div className="pointer-events-auto absolute bottom-10 left-2 max-h-[34%] w-[min(55%,440px)] overflow-hidden rounded-xl border border-white/20 bg-[#061224]/85 p-2.5 text-white shadow-xl backdrop-blur-md sm:bottom-12 sm:left-4 sm:w-[min(52%,480px)] sm:p-3">
          <p className="mb-1 text-[9px] font-black tracking-wider text-lime-300 sm:text-[10px]">PRODUCT {show?.product_index||1} OF {show?.product_count||2}</p>
          <h3 className="line-clamp-2 text-[11px] font-bold leading-snug sm:text-sm">{product.title}</h3>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[9px] text-white/70 sm:text-xs">{product.brand||product.retailer_name||"Featured product"}{price?" · "+price:""}</span>
            {product.affiliate_url?<a href={product.affiliate_url} target="_blank" rel="noopener sponsored" className="shrink-0 rounded-full bg-lime-300 px-2.5 py-1 text-[9px] font-black text-black sm:px-3 sm:text-xs">Shop</a>:null}
          </div>
        </div>:null}
      </div>

    </>
  );
}
