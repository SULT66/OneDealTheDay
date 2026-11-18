"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import styles from "./ODDLiveChannel.module.css";

/** Own the video element so landscape framing and audio controls stay usable. */
export function ODDLiveVideo({ embedUrl }: { embedUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fallback, setFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || fallback) return;
    const base = new URL(embedUrl);
    base.pathname = base.pathname.replace(/\/?$/, "/");
    const endpoint = new URL("index.m3u8", base);
    endpoint.search = base.search;
    let disposed = false;
    let hls: Hls | null = null;
    const useFallback = () => { if (!disposed) setFallback(true); };
    const timeout = window.setTimeout(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) useFallback();
    }, 15000);
    const ready = () => { window.clearTimeout(timeout); setPlaying(true); };
    video.addEventListener("playing", ready);
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.addEventListener("error", useFallback);
      video.src = endpoint.toString();
      void video.play().catch(() => {});
    } else {
      void import("hls.js").then(({ default: HlsPlayer }) => {
        if (disposed) return;
        if (!HlsPlayer.isSupported()) { useFallback(); return; }
        hls = new HlsPlayer({
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.2,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
          backBufferLength: 5,
        });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) useFallback();
        });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => { /* Native play controls remain available. */ });
        });
        hls.loadSource(endpoint.toString());
        hls.attachMedia(video);
      }).catch(useFallback);
    }
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      video.removeEventListener("playing", ready);
      video.removeEventListener("error", useFallback);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [embedUrl, fallback]);

  function enableAudio() {
    const video=videoRef.current;
    if(!video)return;
    video.muted=false;
    video.volume=1;
    setAudioEnabled(true);
    void video.play().catch(()=>{});
  }

  if (fallback) return <iframe
    src={embedUrl}
    title="ODD Live shopping television stream"
    allow="autoplay; fullscreen; picture-in-picture"
    allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin"
    className={styles.fallbackPlayer}
  />;
  return <>
    <video ref={videoRef} className={styles.player} autoPlay muted playsInline controls
      aria-label="ODD Live shopping television stream" />
    {!audioEnabled?<button type="button" className={styles.audioButton} onClick={enableAudio}>Turn on live sound</button>:null}
    {!playing?<p className={styles.connecting} role="status">Connecting to the live show…</p>:null}
  </>;
}
