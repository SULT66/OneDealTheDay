"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";

/*
 * The host console: the one place that talks to Chloe during a drop.
 *
 * Every viewer watches the same Chloe and asks in the shared chat. Tavus only
 * takes text from somebody inside the call, and a viewer's browser must not be
 * that somebody (see src/liveHost.js), so this page joins the call too, with
 * no camera or microphone, and passes questions on.
 *
 * On autopilot it does what a producer would: tells her when the price opens,
 * hands her the next few questions whenever she has finished speaking, and
 * gives her something to say when the chat goes quiet. Keep this tab open for
 * the whole drop; closing it leaves her presenting but deaf to the chat.
 */

type HostState = {
  state: string;
  conversation_url: string;
  conversation_id: string;
  reveal_cue: string;
  idle_cue: string;
  queued: number;
  messages: { id: number; author: string; text: string; status: string }[];
};

const IDLE_SECONDS = 75;
const FALLBACK_TURN_SECONDS = 25;

export function LiveHostConsole({ adminKey, dropKey }: { adminKey: string; dropKey: string }) {
  const [host, setHost] = useState<HostState | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [autopilot, setAutopilot] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const callRef = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSentRef = useRef(0);
  const lastStoppedRef = useRef(0);
  const sawSpeakingEventsRef = useRef(false);
  const revealSentRef = useRef(false);
  const busyRef = useRef(false);

  const headers = useCallback(() => ({ "X-Admin-Key": adminKey }), [adminKey]);
  const note = (line: string) =>
    setLog((current) => [`${new Date().toLocaleTimeString()} · ${line}`, ...current].slice(0, 12));

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}`, { headers: headers() }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setError(body?.error || "The host console could not load.");
      return;
    }
    setError("");
    setHost(body);
  }, [dropKey, headers]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  /* Join the shared call once there is one. No media of our own. */
  const url = host?.conversation_url || "";
  useEffect(() => {
    if (!url) return;
    const call = DailyIframe.createCallObject({ audioSource: false, videoSource: false });
    callRef.current = call;
    const sync = () => {
      const presenter = Object.values(call.participants()).find(
        (participant) => !participant.local && participant.tracks.video?.persistentTrack,
      );
      const track = presenter?.tracks.video?.persistentTrack;
      const element = videoRef.current;
      if (element && track && !(element.srcObject instanceof MediaStream && element.srcObject.getTracks().some((t) => t.id === track.id))) {
        element.srcObject = new MediaStream([track]);
        void element.play().catch(() => undefined);
      }
    };
    call.on("joined-meeting", () => {
      setJoined(true);
      sync();
      note("Joined Chloe's broadcast");
    });
    call.on("participant-joined", sync);
    call.on("participant-updated", sync);
    call.on("app-message", (event: { data?: unknown }) => {
      const type = (event.data as { event_type?: string } | null)?.event_type || "";
      if (type === "conversation.replica.started_speaking") {
        sawSpeakingEventsRef.current = true;
        setSpeaking(true);
      }
      if (type === "conversation.replica.stopped_speaking") {
        sawSpeakingEventsRef.current = true;
        setSpeaking(false);
        lastStoppedRef.current = Date.now();
      }
    });
    call.on("error", () => setError("The connection to Chloe dropped. Reload this page."));
    void call
      .join({ url, startAudioOff: true, startVideoOff: true, userName: "OneDailyDrop host console" })
      .catch(() => setError("Could not join Chloe's broadcast. Reload this page."));
    return () => {
      callRef.current = null;
      setJoined(false);
      void call.leave().catch(() => undefined).finally(() => call.destroy());
    };
  }, [url]);

  const send = useCallback(
    (text: string, label: string) => {
      const call = callRef.current;
      if (!call || !host?.conversation_id || !text) return false;
      call.sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.respond",
          conversation_id: host.conversation_id,
          properties: { text },
        },
        "*",
      );
      lastSentRef.current = Date.now();
      note(label);
      return true;
    },
    [host?.conversation_id],
  );

  const sendNextQuestions = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}/next`, {
        method: "POST",
        headers: headers(),
      }).catch(() => null);
      const body = await response?.json().catch(() => ({}));
      if (response?.ok && body?.cue) {
        send(body.cue, `Handed Chloe ${body.questions.length} question${body.questions.length === 1 ? "" : "s"}`);
        void load();
      }
    } finally {
      busyRef.current = false;
    }
  }, [dropKey, headers, send, load]);

  /* Autopilot: the reveal, then questions between her answers, then a nudge
     when the chat is quiet. */
  useEffect(() => {
    if (!autopilot || !joined || !host) return;
    const tick = setInterval(() => {
      const now = Date.now();
      if (host.reveal_cue && !revealSentRef.current) {
        revealSentRef.current = true;
        send(host.reveal_cue, "Told Chloe the price is open");
        return;
      }
      const finishedTurn = sawSpeakingEventsRef.current
        ? !speaking && now - lastStoppedRef.current > 3000 && lastStoppedRef.current >= lastSentRef.current
        : now - lastSentRef.current > FALLBACK_TURN_SECONDS * 1000;
      if (!finishedTurn && lastSentRef.current) return;
      if (host.queued > 0) {
        void sendNextQuestions();
        return;
      }
      if (["waiting", "live"].includes(host.state) && now - lastSentRef.current > IDLE_SECONDS * 1000 && host.idle_cue) {
        send(host.idle_cue, "Chat is quiet: asked Chloe to share a fact");
      }
    }, 2000);
    return () => clearInterval(tick);
  }, [autopilot, joined, host, speaking, send, sendNextQuestions]);

  const hide = async (id: number) => {
    await fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}/hide/${id}`, { method: "POST", headers: headers() }).catch(() => null);
    void load();
  };

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-fg">Host console</p>
        <span className="text-xs text-fg-muted">
          {error
            ? error
            : !host
              ? "Loading…"
              : !host.conversation_url
                ? host.state === "upcoming"
                  ? "Chloe goes on air when the waiting room opens (5 minutes before). Keep this open."
                  : "Chloe is not on air."
                : joined
                  ? speaking
                    ? "Chloe is speaking"
                    : "Connected to Chloe"
                  : "Connecting…"}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-fg">
          <input type="checkbox" checked={autopilot} onChange={(event) => setAutopilot(event.target.checked)} />
          Autopilot
        </label>
        <button
          type="button"
          disabled={!joined}
          onClick={() => void sendNextQuestions()}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg hover:bg-surface disabled:opacity-50"
        >
          Send next questions now
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr_1fr]">
        <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-contain" />
        <div>
          <p className="text-xs font-semibold text-fg-muted">
            Chat · {host?.queued ?? 0} waiting for Chloe
          </p>
          <ul className="mt-1 max-h-44 space-y-1 overflow-y-auto text-xs">
            {(host?.messages || []).map((message) => (
              <li key={message.id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-fg">
                  <span className="font-semibold">{message.author}:</span> {message.text}
                  <span className="ml-1 text-fg-subtle">· {message.status === "sent" ? "asked" : "waiting"}</span>
                </span>
                <button type="button" onClick={() => void hide(message.id)} className="shrink-0 cursor-pointer text-fg-subtle underline">
                  hide
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-fg-muted">What was sent to Chloe</p>
          <ul className="mt-1 max-h-44 space-y-1 overflow-y-auto text-xs text-fg-subtle">
            {log.length ? log.map((line) => <li key={line}>{line}</li>) : <li>Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
