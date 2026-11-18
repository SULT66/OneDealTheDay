"use client";

import {useCallback,useEffect,useState,type ReactNode,type FormEvent} from "react";
import styles from "./ODDLiveChannel.module.css";
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
  children:ReactNode;market:string;compact?:boolean;chatOpen?:boolean;onChatToggle?:()=>void;
  onFullscreen?:()=>void;onSizeToggle?:()=>void;onCompactToggle?:()=>void;expanded?:boolean;
};

export function ODDLiveTvExperience({
  children,market,compact=false,chatOpen=false,onChatToggle,onFullscreen,onSizeToggle,
  onCompactToggle,expanded=false,
}:Props) {
  const [show,setShow]=useState<Show|null>(null);
  const [messages,setMessages]=useState<ChatLine[]>([]);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const [viewerCount,setViewerCount]=useState(0);

  const refresh=useCallback(async()=>{
    const current=await fetch("/api/odd-tv/live?market="+encodeURIComponent(market),{cache:"no-store"}).catch(()=>null);
    if(!current?.ok)return;
    const data=(await current.json().catch(()=>({}))) as {show?:Show|null};
    const next=data.show||null;
    setShow(next);
    if(next){
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
      setDraft("");setNotice("Question sent — the live host will answer it shortly.");
      void refresh();
    }catch{setNotice("Unable to connect to chat right now.");}
    finally{setSending(false);}
  }

  const product=show?.product;
  const price=product?.price!=null&&product.currency
    ?new Intl.NumberFormat("en-US",{style:"currency",currency:product.currency}).format(product.price)
    :null;

  const live=show?.state==="live";
  return (
    <div className={[styles.experience,compact?styles.compact:""].join(" ")}>
      <div className={styles.stage}>
        {children}
        <div className={styles.onAir} aria-live="polite">
          <span className={live?styles.liveBadge:styles.offlineBadge}><span/>{live?"Live":"Standby"}</span>
        </div>
        {show?<span className={styles.viewers}><LiveIcon name="viewers"/>{viewerCount}<span> watching</span></span>:null}
        {!show?<p className={styles.waiting}>The next discovery is coming soon.</p>:null}
        <div className={styles.toolbar}>
          <span className={styles.stageLabel}>ODD <strong>LIVE</strong></span>
          <div className={styles.controls}>
            {compact?<button type="button" onClick={onChatToggle} aria-label={chatOpen?"Close chat":"Open chat"} aria-expanded={chatOpen}><LiveIcon name="chat"/></button>:null}
            {!compact?<button type="button" onClick={onSizeToggle} aria-label={expanded?"Return to normal size":"Enlarge live player"} aria-pressed={expanded} title={expanded?"Normal size":"Theater mode"}><LiveIcon name="size"/></button>:null}
            <button type="button" onClick={onFullscreen} aria-label="Watch full screen" title="Full screen"><LiveIcon name="fullscreen"/></button>
            <button type="button" onClick={onCompactToggle} aria-label={compact?"Restore live player":"Minimize live player"} title={compact?"Restore player":"Mini player"}><LiveIcon name={compact?"restore":"minimize"}/></button>
          </div>
        </div>
      </div>
      {(!compact||chatOpen)?<aside className={styles.sidebar} aria-label="Live shopping and audience chat">
        {!compact?<section className={styles.productSection} aria-label="Currently featured product">
          <div className={styles.sectionLabel}><span className={styles.accentDot}/>{product?"IN THE SPOTLIGHT":"COMING UP"}
            {show?<span className={styles.productCount}>{show.product_index||1} / {show.product_count||2}</span>:null}
          </div>
          {product?<>
            {product.image_url?<div className={styles.productImage}><img src={product.image_url} alt={product.title} loading="eager"/></div>:null}
            <p className={styles.retailer}>{product.retailer_name||product.brand||"Featured find"}</p>
            <h3 className={styles.productTitle}>{product.title}</h3>
            {price&&product.price_verified?<p className={styles.price}>{price}</p>:null}
            {product.affiliate_url?<a href={product.affiliate_url} target="_blank" rel="noopener sponsored" className={styles.shopButton}>Shop this find <LiveIcon name="arrow"/></a>:null}
            <p className={styles.shopNote}>Purchase on the store’s website. Final price and availability may change.</p>
          </>:<div className={styles.emptyProduct}><LiveIcon name="bag"/><h3>Your next great find</h3><p>Featured product details will appear here when the show starts.</p></div>}
        </section>:null}
        <section className={styles.chat} aria-label="ODD Live audience chat">
          <div className={styles.chatHeading}><div><h3>Ask the host <span>Q&A</span></h3><p>Ask now — the host answers while the show is live</p></div>{compact?<button type="button" className={styles.closeChat} onClick={onChatToggle} aria-label="Close chat">×</button>:<LiveIcon name="chat"/>}</div>
          <div role="log" aria-live="polite" className={styles.messages}>
            {messages.length===0?<div className={styles.emptyChat}><p>Curious about this find?</p><span>Ask a question and join the conversation.</span></div>:messages.slice(-8).map(msg=>
              <div key={msg.id} className={styles.message}><span className={styles.avatar} aria-hidden="true">{msg.author.slice(0,1).toUpperCase()}</span><div><p><strong>{msg.author}</strong><span>{msg.status==="sent"?"Answered":msg.status==="queued"?"Queued":""}</span></p><p>{msg.text}</p></div></div>
            )}
          </div>
          <form onSubmit={sendQuestion} className={styles.questionForm}>
            <label htmlFor="odd-tv-question" className="sr-only">Your product question</label>
            <input id="odd-tv-question" placeholder={show?"Ask about this find…":"Chat opens when the show starts"} maxLength={200} value={draft} disabled={!show||sending} onChange={event=>setDraft(event.target.value)}/>
            <button disabled={!show||sending||draft.trim().length<2} type="submit" aria-label="Send question">{sending?"…":<LiveIcon name="send"/>}</button>
          </form>
          {notice?<p role="status" className={styles.notice}>{notice}</p>:null}
        </section>
      </aside>:null}
    </div>
  );
}

function LiveIcon({name}:{name:string}) {
  const paths:Record<string,ReactNode>={
    viewers:<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    fullscreen:<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    size:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14m10-14v14"/></>,
    minimize:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M13 12h6v5h-6z"/></>,
    restore:<path d="M7 17 17 7M7 7h10v10"/>,
    arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
    send:<><path d="m3 3 18 9-18 9 4-9-4-9Z"/><path d="M7 12h14"/></>,
    chat:<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/>,
    bag:<><path d="M5 8h14l2 13H3L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
