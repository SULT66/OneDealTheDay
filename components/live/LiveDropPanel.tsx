"use client";

import Image from "next/image";
import { Eye } from "@phosphor-icons/react";
import DailyIframe from "@daily-co/daily-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { analyticsSessionId, recordLiveDropEvent } from "@/lib/analyticsSession";

/**
 * The Live Drop, as a shopper sees it.
 *
 * Everything that decides what may be shown is decided on the server: the
 * state, the countdown, whether the price has been revealed. This component
 * renders what it is given and never works any of it out for itself, because a
 * browser clock minutes out of true would open the drop early for one person
 * and late for another, and for a ten minute event that is the event.
 *
 * The seconds tick locally between polls so the number moves every second
 * without a request every second, and every poll re-syncs them. Drift can only
 * accumulate for as long as one polling interval.
 */

export type LiveDropView = {
  drop_key: string;
  title: string;
  brand: string;
  retailer_name: string;
  image_url: string;
  /* The product in use, beside the product itself. */
  secondary_image_url: string;
  currency: string;
  retail_price: number | null;
  drop_price: number | null;
  saving: { amount: number; percent: number } | null;
  quantity_total: number;
  quantity_remaining: number;
  state: "upcoming" | "waiting" | "live" | "sold_out" | "ended";
  start_at: string;
  end_at: string;
  seconds_until_start: number | null;
  seconds_until_end: number | null;
  member_early_access_seconds: number;
  affiliate_url: string;
  video_url: string;
  stream_embed_url: string;
  /* The line the AI host is handed when the price opens. Empty until then. */
  host_reveal_line: string;
  tavus_available: boolean;
  /* Pages open right now, counted rather than decorated. */
  watching: number;
  terms: string;
  server_now: string;
};

/* Often while the clock is about to move the page from one state to the next,
   rarely while nothing is going to happen for hours. A drop that opens without
   the page noticing is the one failure this whole design exists to avoid. */
const pollInterval = (state: LiveDropView["state"], secondsUntilStart: number | null) => {
  if (state === "live") return 5000;
  if (state === "waiting") return 5000;
  if (state === "upcoming") return (secondsUntilStart ?? 0) < 120 ? 5000 : 30000;
  return 60000;
};

const clock = (totalSeconds: number | null) => {
  if (totalSeconds == null) return "";
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
};

export function LiveDropPanel({
  market,
  /* Fetched on the server so the page arrives with the drop in it. Without
     this the first thing anybody received — a crawler included — was "Checking
     for a drop..." and no heading. */
  initialDrop = null,
  /* Whether the server got an answer at all. A drop of null with this true is
     "nothing scheduled"; with it false it is "we could not ask", and those
     must not look the same — announcing "No drop scheduled" during an outage,
     on the day of a drop, is the worst thing this page could say. */
  serverChecked = false,
}: {
  market: string;
  initialDrop?: LiveDropView | null;
  serverChecked?: boolean;
}) {
  const [drop, setDrop] = useState<LiveDropView | null>(initialDrop);
  const [loaded, setLoaded] = useState(serverChecked);
  const [untilStart, setUntilStart] = useState<number | null>(
    initialDrop?.seconds_until_start ?? null,
  );
  const [untilEnd, setUntilEnd] = useState<number | null>(initialDrop?.seconds_until_end ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/live/current?market=${encodeURIComponent(market)}`).catch(
      () => null,
    );
    if (!response || !response.ok) {
      setLoaded(true);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { drop?: LiveDropView | null };
    setDrop(body.drop || null);
    setUntilStart(body.drop?.seconds_until_start ?? null);
    setUntilEnd(body.drop?.seconds_until_end ?? null);
    setLoaded(true);
  }, [market]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, pollInterval(drop?.state ?? "upcoming", untilStart));
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    /* Intentionally keyed on the market alone: the loop reschedules itself and
       re-reads state through the closure on each pass. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  /*
   * The funnel, one line per stage.
   *
   * Reported from here rather than from each button because the panel is the
   * only thing that knows the state changed. The server keeps one row per
   * session per stage, so a tab left open through the whole drop counts once.
   */
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!drop) return;
    const stage =
      drop.state === "waiting" ? "waiting_room" : drop.state === "live" ? "reveal" : "";
    if (!stage) return;
    const seen = `${drop.drop_key}:${stage}`;
    if (reported.current.has(seen)) return;
    reported.current.add(seen);
    recordLiveDropEvent(drop.drop_key, stage);
  }, [drop]);

  /*
   * The heartbeat behind "watching now".
   *
   * Only while the drop is actually on: a tab left open overnight on a drop
   * that ended is not an audience. The server counts rows touched in the last
   * ninety seconds, so stopping this is all it takes to leave the count, and
   * closing the tab stops it without anybody having to say goodbye.
   */
  const dropKey = drop?.drop_key;
  const onAir = drop?.state === "waiting" || drop?.state === "live";
  useEffect(() => {
    if (!dropKey || !onAir) return;
    const beat = () => {
      void fetch("/api/live/watching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_key: dropKey, session_id: analyticsSessionId() }),
        keepalive: true,
      }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 30000);
    return () => clearInterval(timer);
  }, [dropKey, onAir]);

  /* The local second hand between polls. */
  useEffect(() => {
    const ticking = setInterval(() => {
      setUntilStart((value) => (value == null ? value : Math.max(0, value - 1)));
      setUntilEnd((value) => (value == null ? value : Math.max(0, value - 1)));
    }, 1000);
    return () => clearInterval(ticking);
  }, []);

  if (!loaded) {
    return (
      <Frame>
        <p className="text-sm text-fg-subtle">Checking for a drop...</p>
      </Frame>
    );
  }

  if (!drop) {
    return (
      <Frame>
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">No drop scheduled</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">
          A Live Drop is one product, at one price, for ten minutes. There is not one
          on the calendar right now. The daily drop is still worth a look while you
          wait.
        </p>
      </Frame>
    );
  }

  const price = drop.drop_price != null ? formatPrice(drop.drop_price, drop.currency, market) : "";
  const retail =
    drop.retail_price != null ? formatPrice(drop.retail_price, drop.currency, market) : "";
  const isLive = drop.state === "live";
  const finished = drop.state === "sold_out" || drop.state === "ended";

  return (
    <Frame>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-lg font-black tracking-tight text-fg sm:text-xl">
            OneDailyDrop <span className="text-accent">LIVE</span>
          </p>
          <StateBadge state={drop.state} />
          {/* Only while the drop is on, and only once there is somebody to
              count. "1 watching" on an empty page says the quiet part out
              loud, and a number nobody is behind would be the other kind of
              lie. */}
          {onAir && drop.watching > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted tnum">
              <Eye size={15} weight="fill" aria-hidden="true" />
              {drop.watching.toLocaleString()}
              <span className="font-normal text-fg-subtle">watching</span>
            </span>
          )}
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          AI host
        </span>
      </div>

      <BroadcastStage market={market} drop={drop} />

      {/* No product photograph in here any more: the stage above shows the
          product twice, and a third copy pushed the price and the button
          further down a phone screen than either should ever be. */}
      <div className="mt-5 rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
        <div className="min-w-0">
          {drop.brand && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              {drop.brand}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold leading-tight text-fg sm:text-3xl">
            {drop.title}
          </h1>
          {drop.retailer_name && (
            <p className="mt-1 text-sm text-fg-muted">Sold and shipped by {drop.retailer_name}</p>
          )}

          {/* Before it opens the price is not merely hidden on screen: the
              server has not sent it. There is nothing here to find. */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {price ? (
              <span className="text-3xl font-black text-fg tnum">{price}</span>
            ) : (
              <span className="text-lg font-semibold text-fg-muted">
                Price revealed when it opens
              </span>
            )}
            {retail && (
              <span className={cn("text-sm text-fg-subtle tnum", price && "line-through")}>
                {retail}
              </span>
            )}
            {drop.saving && (
              <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-ink">
                Save {formatPrice(drop.saving.amount, drop.currency, market)} ({drop.saving.percent}%)
              </span>
            )}
          </div>

          {/* The clock and the way out, on one line with the price. These were
              stacked, so on a phone the button sat below the fold during the
              ten minutes it exists for. */}
          <div className="mt-4 flex flex-wrap items-stretch gap-3">
            <Countdown state={drop.state} untilStart={untilStart} untilEnd={untilEnd} />
            {drop.quantity_total > 0 && (
              <Metric label="Stock">
                <span className="tnum">{isLive ? drop.quantity_remaining : drop.quantity_total}</span>{" "}
                {isLive ? "left" : "available"}
              </Metric>
            )}
            {isLive && drop.affiliate_url && (
              <a
                /* Through the server, so the drop's state is read at the moment
                   of the click rather than when this page was drawn, and so the
                   visit is counted even where analytics is blocked. */
                href={`/live/go/${encodeURIComponent(drop.drop_key)}?sid=${encodeURIComponent(analyticsSessionId())}`}
                target="_blank"
                rel="sponsored noopener noreferrer"
                onClick={() => recordLiveDropEvent(drop.drop_key, "buy_click")}
                className="ml-auto inline-flex min-w-[9rem] flex-1 items-center justify-center rounded-xl bg-accent px-6 text-base font-bold text-white transition-opacity hover:opacity-88 sm:flex-none"
              >
                Buy now
              </a>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <DeliaTrigger
              variant="header"
              label="Ask a live question"
              /* Before the reveal there is no price to judge, and asking about
                 "the drop price" only had her ask the shopper what it was — a
                 round trip about a number the page is deliberately withholding.
                 So beforehand she is asked what the thing is worth, which she
                 can answer, and afterwards whether this price is good. */
              seed={
                price
                  ? `I am watching OneDailyDrop Live. Is the ${drop.title} a good deal at ${price}?`
                  : `I am watching OneDailyDrop Live. The ${drop.title} is about to drop. What is it usually worth, and what price would make it a good buy?`
              }
              className="h-12 flex-1 justify-center rounded-xl px-5 sm:flex-none"
            />
            {!finished && drop.state !== "live" && <RemindMe dropKey={drop.drop_key} />}
          </div>

          {drop.terms && <p className="mt-5 text-xs leading-relaxed text-fg-subtle">{drop.terms}</p>}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-6">{children}</div>
    </section>
  );
}

function StateBadge({ state }: { state: LiveDropView["state"] }) {
  const label: Record<LiveDropView["state"], string> = {
    upcoming: "Next live drop",
    waiting: "Starting soon",
    live: "Live now",
    sold_out: "Sold out",
    ended: "Drop ended",
  };
  const live = state === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]",
        live ? "bg-danger/10 text-danger" : "bg-surface-2 text-fg-muted",
      )}
    >
      {live && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />}
      {label[state]}
    </span>
  );
}

function Countdown({
  state,
  untilStart,
  untilEnd,
}: {
  state: LiveDropView["state"];
  untilStart: number | null;
  untilEnd: number | null;
}) {
  if (state === "sold_out" || state === "ended") return null;
  const live = state === "live";
  const seconds = live ? untilEnd : untilStart;
  if (seconds == null) return null;

  return <Metric label={live ? "Closes in" : "Opens in"}>{clock(seconds)}</Metric>;
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 sm:min-w-32">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{label}</p>
      <p className="mt-0.5 truncate text-lg font-black text-fg tnum" aria-live="off">
        {children}
      </p>
    </div>
  );
}

/**
 * Ask to be told when it opens.
 *
 * An email address rather than an account, because the reminder is what brings
 * somebody back and asking them to register first loses the half-interested.
 */
function RemindMe({ dropKey }: { dropKey: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (message) return <p className="text-sm font-medium text-fg">{message}</p>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center rounded-full border border-border px-5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
      >
        Remind me
      </button>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        const response = await fetch("/api/live/remind", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, drop_key: dropKey }),
        }).catch(() => null);
        const body = await response?.json().catch(() => ({}));
        setBusy(false);
        if (response?.ok) recordLiveDropEvent(dropKey, "remind");
        setMessage(
          response?.ok
            ? body?.message || "We will email you when it opens."
            : body?.error || "That did not go through. Try again.",
        );
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        aria-label="Email for the reminder"
        className="h-12 w-56 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg outline-none focus:border-border-strong"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-12 items-center rounded-full bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-88 disabled:opacity-60"
      >
        Remind me
      </button>
    </form>
  );
}

/**
 * Where a broadcast goes, when there is one.
 *
 * A drop does not need video to work: the event is the price, the clock and the
 * limit. So the slot renders nothing at all when no media is attached, rather
 * than a black rectangle apologising for itself. When a drop does carry a
 * recorded file it plays inline, and when it carries an embed the stream is
 * hosted by somebody who already solved streaming, which is what the roadmap
 * says to do instead of building it.
 */
/*
 * What the audience watches.
 *
 * The order matters and used to be wrong. A recorded presentation sat in a
 * side panel labelled "Product demo" while the main stage went to a private
 * video call — so the one thing everybody could watch together was the small
 * box, and the big one was a different conversation for each viewer. With
 * twenty people that is twenty shows; with a thousand it is neither
 * affordable nor a broadcast.
 *
 * So: a live stream first, then the recorded presentation, and the private
 * host only where it has been deliberately switched on. The demo keeps its
 * side panel only when something else is already holding the stage.
 */
function BroadcastStage({ market, drop }: { market: string; drop: LiveDropView }) {
  /*
   * The presenter arrives with the waiting room; the product is on show from
   * the moment the drop is announced.
   *
   * These were one condition, and taking the photograph out of the card left
   * the page with no picture of the product at all until five minutes before
   * the start — a countdown to a thing nobody could see. Only the price is a
   * secret here, and it is kept one by the server.
   */
  const hasPresenter = drop.state === "waiting" || drop.state === "live";
  if (drop.state !== "upcoming" && !hasPresenter) return null;

  const hasStream = Boolean(drop.stream_embed_url);
  const hasPresentation = Boolean(drop.video_url);
  /*
   * Two panels when there are two things to show, one when there is one.
   *
   * A presenter cannot hold up a monitor. An AI host talking to camera is a
   * voice and a face, and on its own it is somebody describing a product
   * nobody can see — which is not a shopping show. The second panel is where
   * the product actually appears: the manufacturer's own footage, a gallery,
   * a close-up.
   *
   * So the host slot takes whichever presenter exists, a live stream first and
   * the recording otherwise, and the product footage keeps its own panel
   * beside it whenever both are supplied. Either runs alone if that is all
   * there is.
   */
  const hasHost = hasStream || hasPresentation;
  const hasDemo = hasPresentation && hasStream;
  /* The product panel earns its place whenever there is anything to put in it,
     which is nearly always: a drop without a photograph is a drop nobody would
     publish. */
  const showsProduct = hasDemo || Boolean(drop.image_url);

  return (
    <div
      className={cn(
        "mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-[#061224] shadow-2xl",
        /* Side by side at every width, phone included: the presenter and the
           product are the two halves of a shopping channel, and stacking them
           on a phone would push the product below the fold. Before the waiting
           room there is no presenter yet, so the product has the whole width
           to itself. */
        showsProduct && hasPresenter && "grid-cols-[1.05fr_0.95fr] sm:grid-cols-[1.2fr_0.8fr]",
      )}
    >
      {hasPresenter && (
      <div className="relative min-w-0 overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#123b69_0%,#07172b_48%,#030914_100%)]">
        <StageLabel>AI host</StageLabel>
        {hasHost ? (
          <div className="relative aspect-[4/3] w-full">
            <iframe
              src={drop.stream_embed_url}
              title={`${drop.title} AI host stream`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        ) : hasPresentation ? (
          /* The same recording for everybody, which is what makes it a
             broadcast: no ceiling, no per-viewer cost, one message. */
          <div className="relative aspect-[4/3] w-full">
            <video
              src={drop.video_url}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : drop.tavus_available ? (
          <TavusHost market={market} drop={drop} />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center px-8 text-center">
            {drop.image_url ? (
              <div className="relative mb-5 h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-white/95 p-3 shadow-2xl">
                <Image src={drop.image_url} alt="" fill sizes="128px" className="object-contain p-3" unoptimized />
              </div>
            ) : null}
            <p className="text-xl font-black text-white">OneDailyDrop Live</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {drop.state === "waiting"
                ? "The AI host joins when the show begins."
                : "The offer is live. Product details and checkout remain available below."}
            </p>
          </div>
        )}
        {!drop.tavus_available ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Now presenting</p>
            <p className="mt-1 line-clamp-2 text-lg font-bold text-white">{drop.title}</p>
          </div>
        ) : null}
      </div>
      )}

      {showsProduct && (
        <div className="grid grid-rows-2 border-l border-white/10 bg-black">
          {hasDemo ? (
            <video
              src={drop.video_url}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="row-span-2 h-full w-full object-cover"
            />
          ) : (
            <>
              {/* The product on its own, then the product being used. A
                  presenter who cannot pick anything up makes this the only
                  place a shopper actually sees the thing, and one still beside
                  a talking head is thin. */}
              <ProductStill src={drop.image_url} alt={drop.title} />
              {drop.secondary_image_url ? (
                <ProductStill src={drop.secondary_image_url} alt="" inUse />
              ) : (
                <ProductStillMissing inUse />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/*
 * Contain rather than cover: a product photograph cropped to fill its box is a
 * product with its plug or its handle cut off.
 *
 * A URL that does not resolve falls back to the empty slot rather than the
 * browser's broken-image icon. One wrong address in the admin form put that
 * icon on the stage of a running drop, which looks like a broken site rather
 * than a missing photograph — and the drop cannot be edited while it runs.
 */
function ProductStill({ src, alt, inUse = false }: { src: string; alt: string; inUse?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ProductStillMissing inUse={inUse} />;
  return (
    <div className={cn("relative overflow-hidden bg-[#0b1524]", inUse && "border-t border-white/10")}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 45vw, 380px"
        className="object-contain p-2"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ProductStillMissing({ inUse }: { inUse?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center px-4 text-center", inUse && "border-t border-white/10")}>
      <p className="text-xs leading-relaxed text-white/40">
        {inUse ? "A photograph of the product in use goes here." : "A photograph of the product goes here."}
      </p>
    </div>
  );
}

type TavusConversation = {
  conversation_id: string;
  conversation_url: string;
};

type HostChatMessage = {
  id: string;
  role: "viewer" | "chloe";
  text: string;
};

function TavusHost({ market, drop }: { market: string; drop: LiveDropView }) {
  const [conversation, setConversation] = useState<TavusConversation | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<HostChatMessage[]>([]);
  const conversationRef = useRef<TavusConversation | null>(null);
  const callRef = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seenEventsRef = useRef(new Set<string>());
  const messageCounterRef = useRef(0);

  const end = useCallback(async () => {
    const active = conversationRef.current;
    if (!active) return;
    conversationRef.current = null;
    setConversation(null);
    await fetch(`/api/integrations/tavus/conversations/${encodeURIComponent(active.conversation_id)}/end`, {
      method:"POST",
      keepalive:true,
    }).catch(() => null);
  }, []);

  useEffect(() => () => {
    const active = conversationRef.current;
    if (!active) return;
    conversationRef.current = null;
    fetch(`/api/integrations/tavus/conversations/${encodeURIComponent(active.conversation_id)}/end`, {
      method:"POST",
      keepalive:true,
    }).catch(() => null);
  }, []);

  /*
   * Receive-only CVI: the viewer never publishes a camera or microphone track.
   * Typed questions go over Daily's data channel as Tavus
   * conversation.respond interactions, while Chloe's remote audio/video is the
   * only media rendered. This is the live-shopping shape: watch and type, not
   * a two-way video call.
   */
  useEffect(() => {
    if (!conversation) return;

    setJoined(false);
    setNeedsPlay(false);
    seenEventsRef.current.clear();
    const call = DailyIframe.createCallObject({
      audioSource:false,
      videoSource:false,
    });
    callRef.current = call;

    const syncRemoteMedia = () => {
      const remote = Object.values(call.participants()).find((participant) => !participant.local);
      const videoTrack = remote?.tracks.video?.persistentTrack;
      const audioTrack = remote?.tracks.audio?.persistentTrack;
      const tracks = [videoTrack, audioTrack].filter(
        (track): track is MediaStreamTrack => Boolean(track),
      );
      const element = videoRef.current;
      if (!element || !tracks.length) return;
      const currentIds = new Set(
        element.srcObject instanceof MediaStream
          ? element.srcObject.getTracks().map((track) => track.id)
          : [],
      );
      if (tracks.every((track) => currentIds.has(track.id))) return;
      element.srcObject = new MediaStream(tracks);
      void element.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
    };

    const receiveMessage = (event: { data?: unknown }) => {
      const payload = event.data as {
        event_type?: string;
        seq?: number | string;
        properties?: { role?: string; speech?: string; text?: string };
      } | null;
      if (!payload || payload.event_type !== "conversation.utterance") return;
      const role = String(payload.properties?.role || "").toLowerCase();
      const text = String(payload.properties?.speech || payload.properties?.text || "").trim();
      if (!text || !["pal", "replica"].includes(role)) return;
      const id = String(payload.seq ?? `${role}:${text}`);
      if (seenEventsRef.current.has(id)) return;
      seenEventsRef.current.add(id);
      setMessages((current) => [...current.slice(-7), {id, role:"chloe", text}]);
    };

    call.on("joined-meeting", () => {
      setJoined(true);
      syncRemoteMedia();
    });
    call.on("participant-joined", syncRemoteMedia);
    call.on("participant-updated", syncRemoteMedia);
    call.on("app-message", receiveMessage);
    call.on("error", () => setError("Chloe's video connection was interrupted."));
    void call.join({
      url:conversation.conversation_url,
      startAudioOff:true,
      startVideoOff:true,
      userName:"OneDailyDrop viewer",
    }).catch(() => setError("Chloe's video connection was interrupted."));

    return () => {
      callRef.current = null;
      void call.leave().catch(() => undefined).finally(() => call.destroy());
    };
  }, [conversation]);

  const start = async () => {
    if (starting || conversationRef.current) return;
    setStarting(true);
    setError("");
    const response = await fetch("/api/integrations/tavus/conversations", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({market, drop_key:drop.drop_key}),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setStarting(false);
    if (!response?.ok || !body?.conversation_url) {
      setError(body?.error || "Chloe could not join. Please try again.");
      return;
    }
    const next = body as TavusConversation;
    conversationRef.current = next;
    setConversation(next);
    recordLiveDropEvent(drop.drop_key, "host_started");
  };

  const tell = (text: string) => {
    const call = callRef.current;
    const active = conversationRef.current;
    if (!text || !call || !active || !joined) return false;
    call.sendAppMessage({
      message_type:"conversation",
      event_type:"conversation.respond",
      conversation_id:active.conversation_id,
      properties:{text},
    }, "*");
    return true;
  };

  /*
   * The moment the price opens, said out loud.
   *
   * A greeting is fixed when the conversation is created, so somebody who
   * started chatting in the waiting room and stayed through the reveal heard
   * "the price opens in a moment" while the price was already on the screen
   * beside her. The opening is the one moment of a Live Drop a host cannot
   * miss.
   *
   * Sent as the same conversation.respond the typed questions use, because
   * that is the one interaction this code has watched work. Once per
   * conversation: a poll every five seconds would otherwise have her announce
   * the same reveal for the rest of the drop.
   */
  const revealLine = drop.host_reveal_line;
  const announced = useRef("");
  useEffect(() => {
    if (!revealLine || !joined) return;
    const active = conversationRef.current;
    if (!active || announced.current === active.conversation_id) return;
    announced.current = active.conversation_id;
    tell(revealLine);
    /* tell reads refs and `joined`; re-running on the line and the join is
       what this needs and nothing more. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealLine, joined]);

  const sendQuestion = (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim().slice(0, 500);
    if (!tell(text)) return;
    const id = `viewer-${++messageCounterRef.current}`;
    setMessages((current) => [...current.slice(-7), {id, role:"viewer", text}]);
    setQuestion("");
  };

  if (conversation) {
    return (
      <div className="relative flex w-full min-w-0 flex-col bg-[#07172b]">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
            aria-label="Chloe, OneDailyDrop AI shopping host"
          />
          {!joined ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#07172b] text-sm font-bold text-white/75">
              Connecting Chloe...
            </div>
          ) : null}
          {needsPlay ? (
            <button
              type="button"
              onClick={() => {
                void videoRef.current?.play().then(() => setNeedsPlay(false));
              }}
              className="absolute inset-0 z-10 m-auto h-12 w-fit rounded-full bg-accent px-6 text-sm font-black text-white"
            >
              Play Chloe
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Now presenting</p>
            <p className="mt-1 line-clamp-2 text-lg font-bold text-white">{drop.title}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={end}
          className="absolute right-3 top-3 z-20 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-black"
        >
          End
        </button>
        <div className="relative z-20 border-t border-white/10 bg-[#07101e]/95 p-3 backdrop-blur">
          <div className="mb-2 max-h-24 space-y-1.5 overflow-y-auto" aria-live="polite">
            {messages.length ? messages.map((message) => (
              <p key={message.id} className="text-xs leading-relaxed text-white/80">
                <span className="font-black text-white">{message.role === "chloe" ? "Chloe" : "You"}:</span>{" "}
                {message.text}
              </p>
            )) : (
              <p className="text-xs text-white/50">Type a question about today's live deal.</p>
            )}
          </div>
          <form onSubmit={sendQuestion} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              disabled={!joined}
              placeholder={joined ? "Ask Chloe about this deal..." : "Connecting..."}
              aria-label="Question for Chloe"
              className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/35 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!joined || !question.trim()}
              className="h-10 rounded-full bg-accent px-4 text-xs font-black text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <p className="mt-1.5 text-[10px] text-white/40">Text chat only · Your camera and microphone stay off</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center px-8 text-center">
      {drop.image_url ? (
        <div className="relative mb-5 h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-white/95 p-3 shadow-2xl">
          <Image src={drop.image_url} alt="" fill sizes="128px" className="object-contain p-3" unoptimized />
        </div>
      ) : null}
      <p className="text-xl font-black text-white">Chloe is ready</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">
        Watch the OneDailyDrop AI host and ask questions by text chat.
      </p>
      <button
        type="button"
        onClick={start}
        disabled={starting}
        className="relative z-20 mt-5 rounded-full bg-accent px-6 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        {starting ? "Connecting Chloe..." : "Watch & chat with Chloe"}
      </button>
      {error ? <p className="relative z-20 mt-3 text-xs font-semibold text-red-300">{error}</p> : null}
      <p className="mt-3 text-[11px] text-white/45">Text chat only · No camera or microphone access</p>
    </div>
  );
}

function StageLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute left-3 top-3 z-10 rounded-full border border-white/15 bg-black/65 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
      {children}
    </span>
  );
}
