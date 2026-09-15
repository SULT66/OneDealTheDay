"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import { analyticsSessionId } from "@/lib/analyticsSession";
import { startStageMusic, type StageMusic } from "./stageMusic";

/*
 * Chloe's broadcast, held above the pages.
 *
 * The call used to live inside the Live page, so following a link to a
 * category or a product hung up on her: the one thing a viewer came for ended
 * the moment they looked at anything else. It lives in the market layout now,
 * which survives navigation, and whenever the viewer is somewhere other than
 * the Live page she shrinks into a small player in the corner with a way back.
 *
 * One call per tab: Daily allows a single call object, and there is only ever
 * one Chloe anyway. Receive-only, as before: no camera, no microphone, and
 * nothing is ever sent to her from a viewer's browser.
 */

export type BroadcastCaption = { id: string; text: string; at: number };
type Session = {
  conversationUrl: string;
  dropKey: string;
  title: string;
  market: string;
  /* What takes the stage while she pauses. */
  productVideo?: string;
  productImage?: string;
};

type LiveBroadcastValue = {
  session: Session | null;
  stream: MediaStream | null;
  joined: boolean;
  error: string;
  captions: BroadcastCaption[];
  /* Chloe is speaking, smoothed: a breath between two words is not a pause. */
  talking: boolean;
  musicOn: boolean;
  setMusicOn: (on: boolean) => void;
  join: (session: Session) => void;
  leave: () => void;
};

const LiveBroadcastContext = createContext<LiveBroadcastValue | null>(null);

export function useLiveBroadcast() {
  const value = useContext(LiveBroadcastContext);
  if (!value) throw new Error("useLiveBroadcast must be used inside LiveBroadcastProvider");
  return value;
}

/* How long she has to be quiet before the product takes the stage, and how
   long it keeps it at least, so the end of a sentence reads as a cut rather
   than a flicker. */
const PAUSE_AFTER_MS = 900;
const PRODUCT_HOLD_MS = 1800;
const VOICE_LEVEL = 0.012;
const MUSIC_PREFERENCE = "odd_live_music";

const readMusicPreference = () => {
  try {
    return window.localStorage.getItem(MUSIC_PREFERENCE) !== "off";
  } catch {
    return true;
  }
};

/* The one presence heartbeat that follows the viewer across pages. */
const sendPresence = (dropKey: string, leaving = false) => {
  const body = JSON.stringify({ drop_key: dropKey, session_id: analyticsSessionId(), ...(leaving ? { leaving: true } : {}) });
  if (leaving && navigator.sendBeacon?.("/api/live/watching", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/live/watching", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
};

export function LiveBroadcastProvider({ market, children }: { market: string; children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<BroadcastCaption[]>([]);
  const [talking, setTalking] = useState(false);
  const [musicOn, setMusicOnState] = useState(true);
  const seenRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<StageMusic | null>(null);
  const eventSpeakingRef = useRef(false);
  const lastVoiceRef = useRef(0);
  const talkingSinceRef = useRef(0);
  const pathname = usePathname();
  const onLivePageRef = useRef(false);
  onLivePageRef.current = Boolean(pathname?.startsWith(`/${market}/live`));

  useEffect(() => setMusicOnState(readMusicPreference()), []);

  const setMusicOn = useCallback((on: boolean) => {
    setMusicOnState(on);
    musicRef.current?.setEnabled(on);
    try {
      window.localStorage.setItem(MUSIC_PREFERENCE, on ? "on" : "off");
    } catch {
      /* A private window: the choice lasts for this page only. */
    }
  }, []);

  const join = useCallback((next: Session) => {
    /* Called from the viewer's click, which is the only moment a browser lets
       sound start. */
    try {
      if (!audioRef.current) {
        const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new Context();
      }
      void audioRef.current.resume();
    } catch {
      audioRef.current = null;
    }
    setSession((current) => (current?.conversationUrl === next.conversationUrl ? current : next));
  }, []);
  const leave = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (!session) {
      setStream(null);
      setJoined(false);
      return;
    }
    setError("");
    setJoined(false);
    seenRef.current.clear();
    const call = DailyIframe.createCallObject({ audioSource: false, videoSource: false });

    const sync = () => {
      /* Chloe is the one participant publishing video; the host console and
         the other viewers publish nothing. */
      const presenter = Object.values(call.participants()).find(
        (participant) => !participant.local && participant.tracks.video?.persistentTrack,
      );
      const tracks = [presenter?.tracks.video?.persistentTrack, presenter?.tracks.audio?.persistentTrack].filter(
        (track): track is MediaStreamTrack => Boolean(track),
      );
      if (!tracks.length) return;
      setStream((current) => {
        const ids = current ? current.getTracks().map((track) => track.id) : [];
        return tracks.every((track) => ids.includes(track.id)) ? current : new MediaStream(tracks);
      });
    };

    const onMessage = (event: { data?: unknown }) => {
      const payload = event.data as {
        event_type?: string;
        seq?: number | string;
        properties?: { role?: string; speech?: string; text?: string };
      } | null;
      if (!payload) return;
      if (payload.event_type === "conversation.replica.started_speaking") {
        eventSpeakingRef.current = true;
        lastVoiceRef.current = performance.now();
        return;
      }
      if (payload.event_type === "conversation.replica.stopped_speaking") {
        eventSpeakingRef.current = false;
        return;
      }
      if (payload.event_type !== "conversation.utterance") return;
      const role = String(payload.properties?.role || "").toLowerCase();
      const text = String(payload.properties?.speech || payload.properties?.text || "").trim();
      if (!text || !["pal", "replica"].includes(role)) return;
      const id = `c${String(payload.seq ?? text)}`;
      if (seenRef.current.has(id)) return;
      seenRef.current.add(id);
      /* The arrival time only orders her captions among the chat lines;
         nothing about the drop's state is read from this clock. */
      setCaptions((current) => [...current, { id, text, at: new Date().getTime() }].slice(-40));
    };

    call.on("joined-meeting", () => {
      setJoined(true);
      sync();
    });
    call.on("participant-joined", sync);
    call.on("participant-updated", sync);
    call.on("app-message", onMessage);
    call.on("left-meeting", () => setJoined(false));
    call.on("error", () => setError("Chloe's video connection was interrupted."));
    void call
      .join({ url: session.conversationUrl, startAudioOff: true, startVideoOff: true, userName: "OneDailyDrop viewer" })
      .catch(() => setError("Chloe's video connection was interrupted."));

    return () => {
      void call.leave().catch(() => undefined).finally(() => call.destroy());
    };
  }, [session]);

  /*
   * Is she talking?
   *
   * Her own audio says so to the syllable: a level meter on the track, so the
   * end of every sentence counts, not only the end of a whole answer. Tavus's
   * started/stopped events cover a browser where the meter cannot run.
   */
  const audioTrack = stream?.getAudioTracks()[0] || null;
  useEffect(() => {
    const context = audioRef.current;
    if (!session) return;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    if (context && audioTrack) {
      try {
        source = context.createMediaStreamSource(new MediaStream([audioTrack]));
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
      } catch {
        analyser = null;
      }
    }
    const samples = new Float32Array(1024);
    const timer = setInterval(() => {
      const now = performance.now();
      if (analyser && context?.state === "running") {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        if (Math.sqrt(sum / samples.length) > VOICE_LEVEL) lastVoiceRef.current = now;
      } else if (eventSpeakingRef.current) {
        lastVoiceRef.current = now;
      }
      const voiced = now - lastVoiceRef.current < PAUSE_AFTER_MS;
      setTalking((current) => {
        if (current === voiced) return current;
        /* The product keeps the stage for a moment once it has it. */
        if (voiced && now - talkingSinceRef.current < PRODUCT_HOLD_MS) return current;
        talkingSinceRef.current = now;
        return voiced;
      });
    }, 100);
    return () => {
      clearInterval(timer);
      source?.disconnect();
    };
  }, [session, audioTrack]);

  /* The music: on for the broadcast, louder whenever she pauses. */
  useEffect(() => {
    const context = audioRef.current;
    if (!session || !context) return;
    const music = startStageMusic(context);
    music.setEnabled(readMusicPreference());
    musicRef.current = music;
    const resume = () => void context.resume();
    document.addEventListener("pointerdown", resume);
    return () => {
      document.removeEventListener("pointerdown", resume);
      music.stop();
      musicRef.current = null;
    };
  }, [session]);
  useEffect(() => {
    musicRef.current?.setTalking(talking);
  }, [talking]);

  /*
   * Watching, wherever the viewer is.
   *
   * The Live page's own heartbeat stops when the viewer opens a category, and
   * somebody still watching in the small player then vanished from the count.
   * While the broadcast is open it beats from here; closing the player, or
   * leaving the site, is what takes them out.
   */
  const presenceKey = session?.dropKey || "";
  useEffect(() => {
    if (!presenceKey) return;
    sendPresence(presenceKey);
    const timer = setInterval(() => sendPresence(presenceKey), 20000);
    const gone = () => sendPresence(presenceKey, true);
    window.addEventListener("pagehide", gone);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", gone);
      /* On the Live page the page's own heartbeat still counts them. */
      if (!onLivePageRef.current) gone();
    };
  }, [presenceKey]);

  /* Off air when the drop is over, wherever the viewer is at the time. */
  useEffect(() => {
    if (!session) return;
    const check = async () => {
      const response = await fetch(`/api/live/current?market=${encodeURIComponent(session.market)}`).catch(() => null);
      if (!response?.ok) return;
      const body = (await response.json().catch(() => ({}))) as { drop?: { drop_key?: string; state?: string } | null };
      const drop = body.drop;
      if (!drop || drop.drop_key !== session.dropKey || !["waiting", "live"].includes(String(drop.state))) {
        setSession(null);
      }
    };
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [session]);

  return (
    <LiveBroadcastContext.Provider
      value={{ session, stream, joined, error, captions, talking, musicOn, setMusicOn, join, leave }}
    >
      {children}
      <MiniPlayer market={market} />
    </LiveBroadcastContext.Provider>
  );
}

/* A video element for a MediaStream, which React cannot set as an attribute. */
export function BroadcastVideo({
  stream,
  className,
  label,
  onNeedsPlay,
}: {
  stream: MediaStream | null;
  className?: string;
  label: string;
  onNeedsPlay?: (needs: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream) {
      void element.play().then(() => onNeedsPlay?.(false)).catch(() => onNeedsPlay?.(true));
    }
  }, [stream, onNeedsPlay]);
  return <video ref={ref} autoPlay playsInline className={className} aria-label={label} />;
}

const isVideoFile = (value: string) => /\.(?:mp4|mov|webm)(?:[?#].*)?$/i.test(value || "");

/*
 * The stage: Chloe and the product, trading places.
 *
 * While she talks she has the larger half and the product plays beside her.
 * When she stops — the end of a sentence, the end of an answer — the product
 * glides onto the whole stage and she shrinks into the corner, and the music
 * comes up; the moment she speaks again it glides back. A presenter who cannot
 * hold anything up gets the cut a studio director would make.
 *
 * Positions are percentages of one 16:9 frame, so the same animation works on
 * a phone, a laptop and the small player.
 */
export function SwapStage({
  host,
  talking,
  productVideo,
  productImage,
  productAlt,
  compact = false,
}: {
  host: React.ReactNode;
  talking: boolean;
  productVideo?: string;
  productImage?: string;
  productAlt: string;
  compact?: boolean;
}) {
  const hasProduct = Boolean(productVideo || productImage);
  const productFull = hasProduct && !talking;
  const layer = "absolute overflow-hidden transition-all duration-700 ease-in-out motion-reduce:transition-none";
  const hostStyle: React.CSSProperties = !hasProduct
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : productFull
      ? { left: compact ? "3%" : "2.5%", top: compact ? "60%" : "71%", width: compact ? "37%" : "26%", height: compact ? "37%" : "26%", borderRadius: compact ? 8 : 14 }
      : { left: 0, top: 0, width: "62%", height: "100%", borderRadius: 0 };
  const productStyle: React.CSSProperties = productFull
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : { left: "62%", top: 0, width: "38%", height: "100%" };

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {hasProduct ? (
        <div className={`${layer} z-10 border-l border-white/10 bg-black`} style={productStyle}>
          {productVideo && isVideoFile(productVideo) ? (
            <video
              src={productVideo}
              autoPlay
              muted
              loop
              playsInline
              aria-label={`${productAlt}, product demo`}
              className={`h-full w-full ${productFull ? "object-contain" : "object-cover"}`}
            />
          ) : productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productImage} alt={productAlt} className="h-full w-full bg-[#0b1524] object-contain p-2" />
          ) : null}
        </div>
      ) : null}
      <div
        className={`${layer} z-20 bg-[#07172b] ${productFull ? "border border-white/25 shadow-2xl" : ""}`}
        style={hostStyle}
      >
        {host}
      </div>
    </div>
  );
}

function MiniPlayer({ market }: { market: string }) {
  const { session, stream, joined, talking, musicOn, setMusicOn, leave } = useLiveBroadcast();
  const pathname = usePathname();
  const [needsPlay, setNeedsPlay] = useState(false);
  const onLivePage = pathname?.startsWith(`/${market}/live`);
  if (!session || onLivePage) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-64 overflow-hidden rounded-2xl border border-white/15 bg-[#07172b] shadow-2xl sm:w-80"
      role="region"
      aria-label="Chloe, live"
    >
      <div className="relative">
        <SwapStage
          compact
          talking={talking}
          productVideo={session.productVideo}
          productImage={session.productImage}
          productAlt={session.title}
          host={
            <>
              <BroadcastVideo
                stream={stream}
                className="h-full w-full object-cover"
                label="Chloe, OneDailyDrop AI shopping host"
                onNeedsPlay={setNeedsPlay}
              />
              {!joined && (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/70">
                  Connecting…
                </div>
              )}
            </>
          }
        />
        {needsPlay && (
          <button
            type="button"
            onClick={(event) => {
              const video = event.currentTarget.parentElement?.querySelector("video[aria-label^='Chloe']") as HTMLVideoElement | null;
              void video?.play().then(() => setNeedsPlay(false));
            }}
            className="absolute inset-0 z-30 m-auto h-9 w-fit rounded-full bg-accent px-4 text-xs font-black text-white"
          >
            Play Chloe
          </button>
        )}
        <span className="absolute left-2 top-2 z-30 inline-flex items-center gap-1.5 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
          Live
        </span>
        <div className="absolute right-2 top-2 z-30 flex gap-1">
          <MusicToggle on={musicOn} onChange={setMusicOn} small />
          <button
            type="button"
            onClick={leave}
            aria-label="Close Chloe"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white hover:bg-black"
          >
            ×
          </button>
        </div>
      </div>
      <Link
        href={`/${market}/live`}
        className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white hover:bg-white/5"
      >
        <span className="min-w-0 truncate font-semibold">{session.title}</span>
        <span className="shrink-0 font-bold text-lime">Back to drop →</span>
      </Link>
    </div>
  );
}

export function MusicToggle({ on, onChange, small = false }: { on: boolean; onChange: (on: boolean) => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={on ? "Turn music off" : "Turn music on"}
      title={on ? "Music on" : "Music off"}
      className={`flex cursor-pointer items-center justify-center rounded-full bg-black/70 font-bold text-white backdrop-blur hover:bg-black ${
        small ? "h-6 px-2 text-[10px]" : "h-8 px-3 text-xs"
      }`}
    >
      {on ? "♪ Music" : "♪ Off"}
    </button>
  );
}
