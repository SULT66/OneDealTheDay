"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import { HOST_CLOSING_SCRIPT, hostClockInstruction, hostTurnFinished, presenterSpeakingEvent } from "@/lib/liveHostProtocol";

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
  phase?: string;
  seconds_until_start?: number | null;
  seconds_until_end?: number | null;
  conversation_url: string;
  conversation_id: string;
  reveal_cue: string;
  idle_cue: string;
  intro_script?: string;
  reveal_script?: string;
  queued: number;
  messages: { id: number; author: string; text: string; status: string }[];
};

/* A script in pieces short enough to read in one breath: paragraphs, and any
   long paragraph cut at sentence ends. A pause between pieces is where the
   console checks she has finished before handing her the next. */
function splitScript(script: string): string[] {
  const pieces: string[] = [];
  for (const paragraph of script.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    let current = "";
    for (const sentence of paragraph.match(/[^.!?]+[.!?]*\s*/g) || [paragraph]) {
      if (current && (current + sentence).length > 350) {
        pieces.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) pieces.push(current.trim());
  }
  return pieces;
}

const IDLE_SECONDS = 75;

export function LiveHostConsole({ adminKey, dropKey }: { adminKey: string; dropKey: string }) {
  const [host, setHost] = useState<HostState | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [presenterReady, setPresenterReady] = useState(false);
  const [monitorMuted, setMonitorMuted] = useState(true);
  const [autopilot, setAutopilot] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const callRef = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);
  const readyRef = useRef(false);
  const clockRef = useRef<Parameters<typeof hostClockInstruction>[0]>(null);
  const speakingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSentRef = useRef(0);
  const lastStoppedRef = useRef(0);
  const sawSpeakingEventsRef = useRef(false);
  const revealSentRef = useRef(false);
  const closingSentRef = useRef(false);
  const busyRef = useRef(false);
  const lastKindRef = useRef<"script" | "other">("other");
  const phaseRef = useRef("");

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
    clockRef.current = {state: body.state, secondsUntilStart: body.seconds_until_start ?? null,
      secondsUntilEnd: body.seconds_until_end ?? null, receivedAt: Date.now()};
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
    readyRef.current = false;
    speakingRef.current = false;
    setPresenterReady(false);
    setSpeaking(false);
    lastSentRef.current = 0;
    lastStoppedRef.current = 0;
    sawSpeakingEventsRef.current = false;
    revealSentRef.current = false;
    closingSentRef.current = false;
    introQueuedRef.current = false;
    scriptLinesRef.current = [];
    lastKindRef.current = "other";
    const call = DailyIframe.createCallObject({ audioSource: false, videoSource: false });
    callRef.current = call;
    const sync = () => {
      const presenter = Object.values(call.participants()).find(
        (participant) => !participant.local && participant.tracks.video?.persistentTrack,
      );
      const tracks = [presenter?.tracks.video?.persistentTrack, presenter?.tracks.audio?.persistentTrack]
        .filter((track): track is MediaStreamTrack => Boolean(track));
      readyRef.current = Boolean(presenter);
      setPresenterReady(readyRef.current);
      const element = videoRef.current;
      if (element && tracks.length && !(element.srcObject instanceof MediaStream &&
          tracks.every((track) => (element.srcObject as MediaStream).getTracks().some((t) => t.id === track.id)))) {
        element.srcObject = new MediaStream(tracks);
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
    call.on("participant-left", sync);
    call.on("app-message", (event: { data?: unknown }) => {
      const change = presenterSpeakingEvent(event.data);
      if (change === "started") {
        sawSpeakingEventsRef.current = true;
        speakingRef.current = true;
        setSpeaking(true);
      }
      if (change === "stopped") {
        sawSpeakingEventsRef.current = true;
        speakingRef.current = false;
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
      if (!call || !readyRef.current || !host?.conversation_id || !text) return false;
      call.sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.respond",
          conversation_id: host.conversation_id,
          properties: { text: `${text}\n${hostClockInstruction(clockRef.current, Date.now())}` },
        },
        "*",
      );
      lastSentRef.current = Date.now();
      note(label);
      return true;
    },
    [host?.conversation_id],
  );

  /* Tells the chat what she is doing, only when it changes. */
  const reportPhase = useCallback(
    (phase: "presenting" | "answering" | "closing" | "closed") => {
      if (phaseRef.current === phase) return;
      phaseRef.current = phase;
      void fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}/phase`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      }).catch(() => {
        phaseRef.current = "";
      });
    },
    [dropKey, headers],
  );

  const sendNextQuestions = useCallback(async () => {
    if (busyRef.current || !readyRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}/next`, {
        method: "POST",
        headers: headers(),
      }).catch(() => null);
      const body = await response?.json().catch(() => ({}));
      if (response?.ok && body?.cue) {
        if (send(body.cue, `Handed Chloe ${body.questions.length} question${body.questions.length === 1 ? "" : "s"}`)) {
          lastKindRef.current = "other";
          reportPhase("answering");
        }
        void load();
      }
    } finally {
      busyRef.current = false;
    }
  }, [dropKey, headers, send, load, reportPhase]);

  /* Word for word: Tavus's echo, no model in between. */
  const echo = useCallback(
    (text: string, label: string) => {
      const call = callRef.current;
      if (!call || !readyRef.current || !host?.conversation_id || !text.trim()) return false;
      call.sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.echo",
          conversation_id: host.conversation_id,
          properties: { modality: "text", text: text.trim(), done: true },
        },
        "*",
      );
      lastSentRef.current = Date.now();
      note(label);
      return true;
    },
    [host?.conversation_id],
  );

  /* The host's script, a paragraph at a time, each after she finishes the last. */
  const scriptLinesRef = useRef<string[]>([]);
  const introQueuedRef = useRef(false);
  const queueScript = (script: string, replace = false) => {
    const lines = splitScript(script);
    scriptLinesRef.current = replace ? lines : [...scriptLinesRef.current, ...lines];
  };

  /* Autopilot: the opening script, the reveal, then questions between her
     answers, then a nudge when the chat is quiet. */
  useEffect(() => {
    if (!joined || !host) return;
    const tick = setInterval(() => {
      if (!readyRef.current) return;
      if (["ended", "sold_out"].includes(host.state)) {
        if (host.phase === "closed" || phaseRef.current === "closed") return;
        reportPhase("closing");
        scriptLinesRef.current = [];
        if (!hostTurnFinished({now:Date.now(), sentAt:lastSentRef.current, stoppedAt:lastStoppedRef.current,
          speaking:speakingRef.current, sawEvents:sawSpeakingEventsRef.current})) return;
        if (!closingSentRef.current) {
          closingSentRef.current = echo(HOST_CLOSING_SCRIPT, "Chloe is saying goodbye");
        } else {
          reportPhase("closed");
          note("Broadcast closing completed");
        }
        return;
      }
      if (!autopilot || host.state !== "live") return;
      const now = Date.now();
      const openingJustQueued = !introQueuedRef.current && Boolean(host.intro_script);
      if (!introQueuedRef.current && host.intro_script && ["waiting", "live"].includes(host.state)) {
        introQueuedRef.current = true;
        queueScript(host.intro_script);
      }
      const finishedTurn = hostTurnFinished({ now, sentAt: lastSentRef.current,
        stoppedAt: lastStoppedRef.current, speaking: speakingRef.current,
        sawEvents: sawSpeakingEventsRef.current });
      if (!finishedTurn || busyRef.current) return;
      if (host.state === "live" && !openingJustQueued && !revealSentRef.current && (host.reveal_script || host.reveal_cue)) {
        revealSentRef.current = true;
        if (host.reveal_script) {
          /* Announce the reveal next, then resume the remaining presentation. */
          scriptLinesRef.current = [...splitScript(host.reveal_script), ...scriptLinesRef.current];
        } else if (host.reveal_cue) {
          send(host.reveal_cue, "Told Chloe the price is open");
          return;
        }
      }
      const presenting =
        scriptLinesRef.current.length > 0 || (lastKindRef.current === "script" && !finishedTurn && Boolean(lastSentRef.current));
      reportPhase(presenting ? "presenting" : "answering");
      /* Answer a batch between script paragraphs, then resume the script.
         A full chat cannot starve the presentation, or vice versa. */
      if (host.queued > 0 && lastKindRef.current === "script") {
        void sendNextQuestions();
        return;
      }
      if (scriptLinesRef.current.length) {
        lastKindRef.current = "script";
        const line = scriptLinesRef.current[0];
        if (echo(line, `Script: ${line.slice(0, 60)}`)) scriptLinesRef.current.shift();
        return;
      }
      lastKindRef.current = "other";
      if (host.queued > 0) {
        void sendNextQuestions();
        return;
      }
      if (["waiting", "live"].includes(host.state) && now - lastSentRef.current > IDLE_SECONDS * 1000 && host.idle_cue) {
        send(host.idle_cue, "Chat is quiet: asked Chloe to share a fact");
      }
    }, 2000);
    return () => clearInterval(tick);
    // queueScript only writes a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, joined, host, speaking, send, echo, sendNextQuestions, reportPhase]);

  /*
   * Talking to Chloe yourself.
   *
   * "Say exactly" is Tavus's echo: she speaks the text word for word, with no
   * model in between, which is the one to use for anything that must be said
   * precisely. "Tell her" is an instruction she carries out in her own words,
   * wrapped in the drop's marker on the server so she acts on it.
   */
  const [ownText, setOwnText] = useState("");
  const say = (text: string) => echo(text, `Said: ${text.trim().slice(0, 60)}`);
  const instruct = async (text: string) => {
    if (!text.trim()) return;
    const response = await fetch(`/api/admin/live-host/${encodeURIComponent(dropKey)}/instruction`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok || !body?.cue) {
      setError(body?.error || "That instruction did not go through.");
      return;
    }
    send(body.cue, `Told her: ${text.trim().slice(0, 60)}`);
  };
  const QUICK = [
    "Welcome everyone who just joined and say what today's drop is.",
    "Remind viewers to press Remind me and ask their questions in the chat.",
    "Say how many minutes are left and that the price ends when the clock does.",
    "Thank everyone for watching and say the next drop is next Thursday at 8 PM Eastern.",
  ];

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
                  ? "The five-minute pre-show plays before the start. Chloe presents at the scheduled start. Keep this open."
                  : "Chloe is not on air."
                : joined
                  ? speaking
                    ? "Chloe is speaking"
                    : presenterReady ? "Connected to Chloe" : "Waiting for Chloe to be ready…"
                  : "Connecting…"}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-fg">
          <input type="checkbox" checked={autopilot} onChange={(event) => setAutopilot(event.target.checked)} />
          Autopilot
        </label>
        {host?.intro_script ? (
          <button
            type="button"
            disabled={!joined || !presenterReady}
            onClick={() => {
              introQueuedRef.current = true;
              setAutopilot(true);
              queueScript(host.intro_script || "", true);
              note("Reading the opening script again");
            }}
            className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg hover:bg-surface disabled:opacity-50"
          >
            Read opening script
          </button>
        ) : null}
        <button
          type="button"
          disabled={!joined || !presenterReady}
          onClick={() => void sendNextQuestions()}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg hover:bg-surface disabled:opacity-50"
        >
          Send next questions now
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-semibold text-fg">Talk to Chloe</p>
        <textarea
          rows={2}
          value={ownText}
          onChange={(event) => setOwnText(event.target.value)}
          maxLength={1000}
          placeholder="Type what Chloe should say or do…"
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-border-strong"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!joined || !presenterReady || !ownText.trim()}
            onClick={() => {
              say(ownText);
              setOwnText("");
            }}
            className="inline-flex h-8 cursor-pointer items-center rounded-full bg-surface-inverse px-3 text-xs font-semibold text-fg-on-inverse disabled:opacity-50"
          >
            Say exactly
          </button>
          <button
            type="button"
            disabled={!joined || !presenterReady || !ownText.trim()}
            onClick={() => {
              void instruct(ownText);
              setOwnText("");
            }}
            className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg disabled:opacity-50"
          >
            Tell her (she says it her way)
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((line) => (
            <button
              key={line}
              type="button"
              disabled={!joined}
              onClick={() => void instruct(line)}
              className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[0.7rem] text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
            >
              {line}
            </button>
          ))}
        </div>
        {!joined && (
          <p className="mt-2 text-xs text-fg-subtle">Available once Chloe is on air (5 minutes before the drop).</p>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr_1fr]">
        <div>
          <video ref={videoRef} muted={monitorMuted} playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-contain" />
          <button type="button" disabled={!joined || !presenterReady}
            onClick={() => {
              const muted = !monitorMuted;
              setMonitorMuted(muted);
              if (videoRef.current) {
                videoRef.current.muted = muted;
                void videoRef.current.play().catch(() => setError("Press Listen to Chloe again to enable the preview audio."));
              }
            }}
            className="mt-2 cursor-pointer text-xs font-semibold text-fg underline disabled:opacity-50">
            {monitorMuted ? "Listen to Chloe" : "Mute preview"}
          </button>
          <p className="mt-1 text-xs text-fg-subtle">Keep this console open for the script and chat. Preview sound affects only you.</p>
        </div>
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
