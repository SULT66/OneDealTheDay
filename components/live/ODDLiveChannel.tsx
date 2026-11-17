"use client";

import {useEffect,useRef,useState} from "react";
import {ODDLiveTvExperience} from "./ODDLiveTvExperience";

/**
 * Public ODD Live TV stage. The iframe keeps MediaMTX's HLS/WebRTC playback
 * and its built-in browser-compatible stream handling; the storefront adds the
 * social-live controls around it without exposing a publishing endpoint.
 */
export function ODDLiveChannel({embedUrl,market}:{embedUrl?:string;market:string}) {
  const [compact,setCompact]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const stageRef=useRef<HTMLElement|null>(null);

  useEffect(()=>{
    const changed=()=>setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange",changed);
    return()=>document.removeEventListener("fullscreenchange",changed);
  },[]);

  if(!embedUrl)return null;
  let playerUrl:string;
  try{
    const parsed=new URL(embedUrl);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password)return null;
    playerUrl=parsed.toString();
  }catch{return null;}

  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    }catch{}
  }

  function toggleCompact(){
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
    setCompact(value=>!value);
    setChatOpen(false);
  }

  return (
    <section
      ref={stageRef}
      aria-label="ODD Live TV"
      className={fullscreen
        ?"fixed inset-0 z-[100] h-screen w-screen overflow-auto bg-black p-0 text-white"
        :compact
          ?"fixed bottom-4 right-4 z-[80] w-[min(92vw,360px)] overflow-hidden rounded-xl border border-white/20 bg-[#061224] text-white shadow-2xl"
          :"mx-auto w-full px-3 pt-5 sm:px-6 "+(expanded?"max-w-7xl":"max-w-5xl")}
    >
      <div className={"relative overflow-hidden bg-[#061224] text-white "+(compact||fullscreen?"":"rounded-2xl border border-white/10 shadow-xl")}>
        {!compact&&!fullscreen?<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-lg font-black tracking-tight sm:text-xl">ODD Live TV</h2>
            <p className="text-xs text-white/65">AI shopping television — watch products as they are presented</p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold">Shopping TV</span>
        </div>:null}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={playerUrl}
            title="ODD Live shopping television stream"
            loading="eager"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        <ODDLiveTvExperience
          market={market}
          compact={compact||fullscreen}
          chatOpen={chatOpen}
          onChatToggle={()=>setChatOpen(value=>!value)}
          onFullscreen={()=>void toggleFullscreen()}
          onSizeToggle={()=>setExpanded(value=>!value)}
          onCompactToggle={toggleCompact}
          expanded={expanded}
        />
      </div>
    </section>
  );
}
