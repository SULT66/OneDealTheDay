"use client";

import {useEffect,useRef,useState} from "react";
import {ODDLiveTvExperience} from "./ODDLiveTvExperience";
import styles from "./ODDLiveChannel.module.css";

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
      className={[styles.channel, compact&&!fullscreen ? styles.mini : "", fullscreen ? styles.fullscreen : "", expanded ? styles.expanded : ""].join(" ")}
    >
      <div className={styles.shell}>
        {!compact&&!fullscreen?<header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.brandMark} aria-hidden="true">ODD<span>▶</span></span>
            <div>
              <p className={styles.eyebrow}>ONEDAILYDROP</p>
              <h2>Live Drop</h2>
            </div>
          </div>
          <p className={styles.headerNote}>Discover it. Ask about it. Make it yours.</p>
        </header>:null}
        <ODDLiveTvExperience
          market={market}
          compact={compact&&!fullscreen}
          chatOpen={chatOpen}
          onChatToggle={()=>setChatOpen(value=>!value)}
          onFullscreen={()=>void toggleFullscreen()}
          onSizeToggle={()=>setExpanded(value=>!value)}
          onCompactToggle={toggleCompact}
          expanded={expanded}
        >
          <iframe
            src={playerUrl}
            title="ODD Live shopping television stream"
            loading="eager"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className={styles.player}
          />
        </ODDLiveTvExperience>
      </div>
    </section>
  );
}
