"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";

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
type Session = { conversationUrl: string; dropKey: string; title: string; market: string };

type LiveBroadcastValue = {
  session: Session | null;
  stream: MediaStream | null;
  joined: boolean;
  error: string;
  captions: BroadcastCaption[];
  join: (session: Session) => void;
  leave: () => void;
};

const LiveBroadcastContext = createContext<LiveBroadcastValue | null>(null);

export function useLiveBroadcast() {
  const value = useContext(LiveBroadcastContext);
  if (!value) throw new Error("useLiveBroadcast must be used inside LiveBroadcastProvider");
  return value;
}

export function LiveBroadcastProvider({ market, children }: { market: string; children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<BroadcastCaption[]>([]);
  const seenRef = useRef(new Set<string>());

  const join = useCallback((next: Session) => {
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
      if (!payload || payload.event_type !== "conversation.utterance") return;
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
    <LiveBroadcastContext.Provider value={{ session, stream, joined, error, captions, join, leave }}>
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

function MiniPlayer({ market }: { market: string }) {
  const { session, stream, joined, leave } = useLiveBroadcast();
  const pathname = usePathname();
  const [needsPlay, setNeedsPlay] = useState(false);
  const onLivePage = pathname?.startsWith(`/${market}/live`);
  if (!session || onLivePage) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-56 overflow-hidden rounded-2xl border border-white/15 bg-[#07172b] shadow-2xl sm:w-72"
      role="region"
      aria-label="Chloe, live"
    >
      <div className="relative aspect-video w-full bg-black">
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
        {needsPlay && (
          <button
            type="button"
            onClick={(event) => {
              const video = (event.currentTarget.parentElement?.querySelector("video") as HTMLVideoElement | null);
              void video?.play().then(() => setNeedsPlay(false));
            }}
            className="absolute inset-0 m-auto h-9 w-fit rounded-full bg-accent px-4 text-xs font-black text-white"
          >
            Play Chloe
          </button>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
          Live
        </span>
        <button
          type="button"
          onClick={leave}
          aria-label="Close Chloe"
          className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-sm leading-none text-white hover:bg-black"
        >
          ×
        </button>
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
