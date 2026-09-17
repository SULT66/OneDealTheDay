"use client";

import Image from "next/image";
import { Eye } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { LiveDropSignup } from "@/components/site/LiveDropSignup";
import { analyticsSessionId, recordLiveDropEvent } from "@/lib/analyticsSession";
import { BroadcastVideo, MusicToggle, SwapStage, useLiveBroadcast } from "./LiveBroadcast";
import { PriceBoard } from "./PriceBoard";
import { useCopy } from "@/components/site/CopyProvider";

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
  /* True only while the shop itself has confirmed the count in the last two
     minutes. Everything that presents a countdown is gated on it. */
  stock_is_live: boolean;
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
  const tr = useCopy();
  const [drop, setDrop] = useState<LiveDropView | null>(initialDrop);
  const [loaded, setLoaded] = useState(serverChecked);
  const [untilStart, setUntilStart] = useState<number | null>(
    initialDrop?.seconds_until_start ?? null,
  );
  const [untilEnd, setUntilEnd] = useState<number | null>(initialDrop?.seconds_until_end ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Buying in a drop takes a free account. Null until /api/me answers, so a
     signed-in shopper never sees the sign-up button flash in place of Buy. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
      .then((body) => setSignedIn(Boolean(body?.user)))
      .catch(() => setSignedIn(false));
  }, []);

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
    /*
     * Somebody who opens the page days early counts too.
     *
     * Only the waiting room and the reveal were reported, so every visit before
     * the last five minutes was invisible: a drop advertised on Monday and
     * opened on Friday showed nobody arriving all week, and the only people in
     * "arrived" were those who happened to press the reminder. That is the
     * number the funnel starts from, so it made the whole ladder unreadable —
     * an ad could bring twenty people and the console would say none came.
     *
     * "ended" and "sold_out" stay unreported: arriving after the fact is a
     * different thing from arriving for it, and counting them would inflate a
     * drop's audience for as long as the page exists.
     */
    const stage =
      drop.state === "upcoming"
        ? "arrived"
        : drop.state === "waiting"
          ? "waiting_room"
          : drop.state === "live"
            ? "reveal"
            : "";
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
  /* Somebody watching Chloe keeps being counted by the broadcast itself when
     they leave this page for a category, so this page must not say goodbye
     for them. */
  const broadcast = useLiveBroadcast();
  const broadcastDropRef = useRef("");
  broadcastDropRef.current = broadcast.session?.dropKey || "";
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
    const timer = setInterval(beat, 20000);
    /* Leaving says so. A closed tab used to stay counted until its last
       heartbeat aged out, so somebody who shut the page still showed as
       watching for a minute and a half. sendBeacon, because it is the one
       request a closing page reliably finishes. */
    const leave = () => {
      const body = JSON.stringify({ drop_key: dropKey, session_id: analyticsSessionId(), leaving: true });
      if (!navigator.sendBeacon?.("/api/live/watching", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/live/watching", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      if (broadcastDropRef.current !== dropKey) leave();
    };
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
        <p className="text-sm text-fg-subtle">{tr("app.live.checking")}</p>
      </Frame>
    );
  }

  if (!drop) {
    return (
      <Frame>
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{tr("app.live.noneTitle")}</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">{tr("app.live.noneText")}</p>
        {/* Somebody who followed a link here between drops is the person most
            likely to want the next one, and this page used to let them leave
            with nothing. */}
        <div className="mt-6 max-w-2xl">
          <LiveDropSignup market={market} variant="inline" source="live-page" />
        </div>
      </Frame>
    );
  }

  const price = drop.drop_price != null ? formatPrice(drop.drop_price, drop.currency, market) : "";
  const retail =
    drop.retail_price != null ? formatPrice(drop.retail_price, drop.currency, market) : "";
  const isLive = drop.state === "live";
  const finished = drop.state === "sold_out" || drop.state === "ended";

  return (
    /*
     * The backdrop belongs to an event in progress, not to the page.
     *
     * It is a fixed band behind the top of the card, which reads as a lit stage
     * while the card is tall enough to sit on it — with the broadcast panel in
     * it, that is most of the drop. On a short card, an ended drop or one still
     * hours away, the band sticks out past the card as a black rectangle with
     * nothing in it, which is what it looked like: a stray shape, not a
     * background.
     */
    <Frame>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* The show's name, sized like one. LIVE sits on lime rather than
              being lime: lime type on a white card all but disappears. */}
          <p className="flex items-center gap-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">
            OneDailyDrop
            <span className="rounded-lg bg-lime px-2.5 py-0.5 text-xl font-black tracking-wide text-ink sm:text-2xl">
              LIVE
            </span>
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
              <span className="font-normal text-fg-subtle">{tr("app.live.watching")}</span>
            </span>
          )}
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          {tr("app.live.aiHost")}
        </span>
      </div>

      <BroadcastStage market={market} drop={drop} untilStart={untilStart} untilEnd={untilEnd} />

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
            <p className="mt-1 text-sm text-fg-muted">{tr("app.live.availableOn", { store: drop.retailer_name })}</p>
          )}

          {/* Before it opens the price is not merely hidden on screen: the
              server has not sent it. There is nothing here to find.
              While the drop is on air the price band on the stage shows the
              price, the clock and the units, so this card keeps only what the
              band cannot: the buttons. */}
          {!onAir && (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {price ? (
              <span className="text-3xl font-black text-fg tnum">{price}</span>
            ) : (
              <span className="text-lg font-semibold text-fg-muted">
                {tr("app.live.priceRevealed")}
              </span>
            )}
            {retail && (
              <span className={cn("text-sm text-fg-subtle tnum", price && "line-through")}>
                {retail}
              </span>
            )}
            {drop.saving && (
              <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-ink">
                {tr("app.live.save", { amount: formatPrice(drop.saving.amount, drop.currency, market), percent: drop.saving.percent })}
              </span>
            )}
          </div>
          )}

          {/* The clock and the way out, on one line with the price. These were
              stacked, so on a phone the button sat below the fold during the
              ten minutes it exists for. */}
          <div className="mt-4 flex flex-wrap items-stretch gap-3">
            {!onAir && <Countdown state={drop.state} untilStart={untilStart} untilEnd={untilEnd} />}
            {/* How many are offered at this price. The number the host set,
                corrected with Set stock while the drop runs, or the shop's own
                count when it reports one; a real cap, never decoration. */}
            {drop.quantity_total > 0 && !finished && !onAir && (
              <Metric label={isLive ? tr("app.live.left") : tr("app.live.units")}>
                <span className="tnum">{isLive ? drop.quantity_remaining : drop.quantity_total}</span>
                {isLive ? tr("app.live.ofTotal", { total: drop.quantity_total }) : tr("app.live.atThisPrice")}
              </Metric>
            )}
            {isLive && drop.affiliate_url && signedIn === false && (
              <a
                href={`/${market}/account?next=${encodeURIComponent(`/${market}/live`)}`}
                className="inline-flex min-h-14 w-full flex-col items-center justify-center rounded-xl bg-lime px-6 py-2 text-center text-ink transition-opacity hover:opacity-88"
              >
                <span className="text-base font-bold">{tr("app.live.signUpToBuy")}</span>
                <span className="text-[11px] font-medium opacity-85">{tr("app.live.signUpHint")}</span>
              </a>
            )}
            {isLive && drop.affiliate_url && signedIn === true && (
              <a
                /* Through the server, so the drop's state is read at the moment
                   of the click rather than when this page was drawn, and so the
                   visit is counted even where analytics is blocked. */
                href={`/live/go/${encodeURIComponent(drop.drop_key)}?sid=${encodeURIComponent(analyticsSessionId())}`}
                target="_blank"
                rel="sponsored noopener"
                onClick={() => recordLiveDropEvent(drop.drop_key, "buy_click")}
                className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-lime px-6 text-lg font-black text-ink transition-opacity hover:opacity-88"
              >
                {drop.drop_price != null ? tr("app.live.buyNowAt", { price: formatPrice(drop.drop_price, drop.currency, market) }) : tr("app.live.buyNow")}
              </a>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <DeliaTrigger
              variant="header"
              label={tr("app.live.askLive")}
              seed={`I am watching OneDailyDrop Live. Is the ${drop.title} a good deal at ${price || "the drop price"}?`}
              className="h-12 flex-1 justify-center rounded-xl px-5 sm:flex-none"
            />
            {!finished && drop.state !== "live" && <RemindMe dropKey={drop.drop_key} />}
          </div>

          {drop.terms && <p className="mt-5 text-xs leading-relaxed text-fg-subtle">{drop.terms}</p>}

          {/* Arrived after it closed: the next one is the only thing left to
              offer, and it is worth offering. */}
          {finished && (
            <div className="mt-6">
              <LiveDropSignup market={market} variant="inline" source="live-page" />
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    /*
     * A stage, but only while something is on it.
     *
     * The page was one white card on white and read like a form, so the card
     * got the site's own graphite behind it — the surface the homepage hero
     * uses — to be lit against something instead of floating on nothing.
     *
     * The band is a fixed height, which works while the card is tall enough to
     * cover it: during the drop, with the broadcast panel inside. On a short
     * card — an ended drop, or one still hours away — it stuck out past the
     * card as a black rectangle containing nothing, and read as a stray shape
     * rather than a background. So it appears while the drop is on, and the
     * rest of the time the page is plain.
     *
     * Decoration only: aria-hidden, no pointer events, nothing that moves or
     * carries meaning. The countdown and the stock are the page; this is the
     * room they stand in, and an empty room needs no lighting.
     */
    <section className="relative mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
      <div className="rounded-3xl border border-border bg-surface p-4 shadow-lg sm:p-6">{children}</div>
    </section>
  );
}

function StateBadge({ state }: { state: LiveDropView["state"] }) {
  const tr = useCopy();
  const label: Record<LiveDropView["state"], string> = {
    upcoming: tr("app.live.stateUpcoming"),
    waiting: tr("app.live.stateWaiting"),
    live: tr("app.live.stateLive"),
    sold_out: tr("app.live.stateSoldOut"),
    ended: tr("app.live.stateEnded"),
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
  const tr = useCopy();
  if (state === "sold_out" || state === "ended") return null;
  const live = state === "live";
  const seconds = live ? untilEnd : untilStart;
  if (seconds == null) return null;

  return <Metric label={live ? tr("app.live.closesIn") : tr("app.live.opensIn")}>{clock(seconds)}</Metric>;
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
  const tr = useCopy();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (message) return <p className="text-sm font-medium text-fg">{message}</p>;

  if (!open) {
    return (
      /*
       * The one thing to do on this page before the drop opens, and it looked
       * like the least important: an outlined button beside a filled one, so
       * the eye went to "Ask a live question" and the reminder read as a
       * secondary option. It is the opposite — a question is a nice extra, and
       * the reminder is the whole reason to arrive early.
       */
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center rounded-full bg-lime px-6 text-sm font-bold text-ink transition-opacity hover:opacity-88"
      >
        {tr("app.live.remindWhenOpens")}
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
            ? body?.message || tr("app.live.remindDone")
            : body?.error || tr("app.live.tryAgain"),
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
        aria-label={tr("app.live.remindEmail")}
        className="h-12 w-56 rounded-full border border-border bg-surface-2 px-4 text-sm text-fg outline-none focus:border-border-strong"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-12 items-center rounded-full bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-88 disabled:opacity-60"
      >
        {tr("app.live.remindMe")}
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
const isVideoFile = (value: string) => /\.(?:mp4|mov|webm)(?:[?#].*)?$/i.test(value || "");

function BroadcastStage({
  market,
  drop,
  untilStart,
  untilEnd,
}: {
  market: string;
  drop: LiveDropView;
  untilStart: number | null;
  untilEnd: number | null;
}) {
  const tr = useCopy();
  const showable = drop.state === "waiting" || drop.state === "live";
  if (!showable) return null;
  /* The price band under the picture, whichever presenter holds the stage. */
  const board = <PriceBoard drop={drop} market={market} untilStart={untilStart} untilEnd={untilEnd} />;

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
  /*
   * Chloe is a presenter, and she was treated as the last resort.
   *
   * The host slot took a stream or a recording, and she appeared only when
   * there was neither — so supplying product footage silently removed her, and
   * the two things this format is built on could never be on screen together.
   * That is exactly backwards: a live host who cannot hold anything up is the
   * case the second panel exists for.
   *
   * So she counts as a host, and any recorded footage then belongs in the
   * product panel beside her rather than on the stage instead of her.
   */
  /* Whether anything at all holds the stage. Not used to pick what — each
     branch below tests its own source, which is what went wrong when this was
     doing both jobs. */
  const hasDemo = hasPresentation && hasStream;
  /* The product panel earns its place whenever there is anything to put in it,
     which is nearly always: a drop without a photograph is a drop nobody would
     publish. */
  const showsProduct = hasDemo || Boolean(drop.image_url);

  /* A live stream outranks Chloe; with none, she has the whole stage and
     shares it with the product herself — see SwapStage. */
  if (!hasStream && drop.tavus_available) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#061224] shadow-2xl">
        <TavusHost market={market} drop={drop} board={board} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-4 grid overflow-hidden rounded-2xl border border-white/10 bg-[#061224] shadow-2xl",
        /* Side by side at every width, phone included: the presenter and the
           product are the two halves of a shopping channel, and stacking them
           on a phone would push the product below the fold. */
        showsProduct && "grid-cols-1 sm:grid-cols-[1.3fr_0.7fr]",
      )}
    >
      <div className="relative min-w-0 overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#123b69_0%,#07172b_48%,#030914_100%)]">
        <StageLabel>{tr("app.live.aiHost")}</StageLabel>
        {/*
          * hasStream, not hasHost.
          *
          * This branch draws the stream iframe, and it was keyed on hasHost —
          * which was fine while hasHost meant "a stream or a recording", and
          * became a bug the moment Chloe was added to it: she made hasHost true,
          * fell into the iframe, and the page rendered an <iframe> with no src.
          * A black rectangle where the host should be, on a live drop, and she
          * never got the chance to load at all.
          */}
        {hasStream && isVideoFile(drop.stream_embed_url) ? (
          /* Chloe's recording uploaded as a file rather than a link to a
             player. An iframe pointed at an .mp4 shows a bare browser player,
             or nothing; a video element is what a file needs. Muted so the
             browser will start it, with controls to turn the sound on. */
          <div className="relative aspect-video w-full">
            <video
              src={drop.stream_embed_url}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : hasStream ? (
          <div className="relative aspect-video w-full">
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
             broadcast: no ceiling, no per-viewer cost, one message. Looping,
             because a drop runs for ten minutes and a clip that ends leaves a
             black rectangle for the rest of them. Muted so the browser will
             actually start it — an autoplaying video with sound is blocked. */
          <div className="relative aspect-video w-full">
            <video
              src={drop.video_url}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center px-8 text-center">
            {drop.image_url ? (
              <div className="relative mb-5 h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-white/95 p-3 shadow-2xl">
                <Image src={drop.image_url} alt="" fill sizes="128px" className="object-contain p-3" unoptimized />
              </div>
            ) : null}
            <p className="text-xl font-black text-white">OneDailyDrop Live</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">
              {drop.state === "waiting"
                ? tr("app.live.hostJoinsSoon")
                : tr("app.live.offerLiveBelow")}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{tr("app.live.nowPresenting")}</p>
          <p className="mt-1 line-clamp-2 text-lg font-bold text-white">{drop.title}</p>
        </div>
      </div>

      {showsProduct && (
        /* On a phone the footage gets a whole 16:9 frame under Chloe and is
           shown uncropped: squeezed into a strip and cropped to fill it, it
           was a grey close-up of nothing. Stills keep a shorter two-up row. */
        <div
          className={cn(
            "grid border-t border-white/10 bg-black sm:h-auto sm:grid-cols-1 sm:grid-rows-2 sm:border-l sm:border-t-0",
            hasDemo ? "aspect-video grid-cols-1 sm:aspect-auto" : "h-40 grid-cols-2",
          )}
        >
          {hasDemo ? (
            <video
              src={drop.video_url}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full bg-black object-contain sm:row-span-2 sm:object-cover"
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
      <div className="col-span-full">{board}</div>
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
  const tr = useCopy();
  return (
    <div className={cn("flex items-center justify-center px-4 text-center", inUse && "border-t border-white/10")}>
      <p className="text-xs leading-relaxed text-white/40">
        {inUse ? tr("app.live.photoInUseMissing") : tr("app.live.photoMissing")}
      </p>
    </div>
  );
}

type SharedChatMessage = {
  id: string;
  kind: "viewer" | "chloe" | "note";
  author: string;
  text: string;
  at: number;
  sent?: boolean;
  mine?: boolean;
};

type ServerChatMessage = { id: number; author: string; text: string; status: string; created_at: string };

/* What the host console says Chloe is doing: reading the script, or taking
   questions. Empty when no console has said anything yet. */
type HostPhase = "presenting" | "answering" | "";

/*
 * Chloe, shared by everybody watching, and the chat they share.
 *
 * Every viewer joins the same conversation to watch, with no camera or
 * microphone, and questions go into one chat on this site that everybody
 * sees. They reach Chloe through the host console, never from a viewer's
 * browser: see src/liveHost.js.
 *
 * The call itself is held by LiveBroadcastProvider in the layout, so leaving
 * this page for a category does not hang up on her; she moves to a small
 * player in the corner instead.
 *
 * Questions wait while she presents. A chat where nothing is answered looks
 * dead and people leave, so the wait is said out loud: the chat shows what
 * she is doing and how many questions are in line, a question posted during
 * the presentation gets its place in the line straight back, and the console
 * has her acknowledge the questions between script lines.
 */
function TavusHost({ market, drop, board }: { market: string; drop: LiveDropView; board?: React.ReactNode }) {
  const tr = useCopy();
  const live = useLiveBroadcast();
  const watching = live.session?.dropKey === drop.drop_key;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [needsPlay, setNeedsPlay] = useState(false);
  const [question, setQuestion] = useState("");
  const [postError, setPostError] = useState("");
  const [posting, setPosting] = useState(false);
  const [chat, setChat] = useState<SharedChatMessage[]>([]);
  const [phase, setPhase] = useState<HostPhase>("");
  const [queued, setQueued] = useState(0);
  const lastIdRef = useRef(0);
  const mineRef = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement | null>(null);

  /* Everybody's questions, every few seconds, for as long as the drop is on. */
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(
        `/api/live/chat?drop_key=${encodeURIComponent(drop.drop_key)}&after=${lastIdRef.current}`,
      ).catch(() => null);
      if (cancelled || !response?.ok) return;
      const body = (await response.json().catch(() => ({}))) as {
        messages?: ServerChatMessage[];
        phase?: HostPhase;
        queued?: number;
        sent_ids?: number[];
      };
      setPhase(body.phase === "presenting" || body.phase === "answering" ? body.phase : "");
      setQueued(Math.max(0, Number(body.queued) || 0));
      const sentIds = new Set((body.sent_ids || []).map((id) => `m${id}`));
      const rows = body.messages || [];
      if (rows.length) lastIdRef.current = Math.max(lastIdRef.current, ...rows.map((row) => row.id));
      setChat((current) => {
        const known = new Set(current.map((message) => message.id));
        const updated = current.map((message) => (sentIds.has(message.id) ? { ...message, sent: true } : message));
        const incoming = rows
          .map((row) => ({
            id: `m${row.id}`,
            kind: "viewer" as const,
            author: mineRef.current.has(`m${row.id}`) ? tr("app.live.you") : row.author,
            text: row.text,
            at: Date.parse(row.created_at),
            sent: row.status === "sent",
            mine: mineRef.current.has(`m${row.id}`),
          }))
          .filter((message) => !known.has(message.id));
        return [...updated, ...incoming].slice(-80);
      });
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [drop.drop_key]);

  /* The chat and Chloe's captions, in the order they happened. */
  const lines = [
    ...chat,
    ...(watching
      ? live.captions.map((caption) => ({ id: caption.id, kind: "chloe" as const, author: "Chloe", text: caption.text, at: caption.at }))
      : []),
  ]
    .sort((left, right) => left.at - right.at)
    .slice(-60);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines.length]);

  const start = async () => {
    if (starting || watching) return;
    setStarting(true);
    setError("");
    const response = await fetch(`/api/live/host?market=${encodeURIComponent(market)}`).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setStarting(false);
    if (!response?.ok || !body?.conversation_url) {
      setError(body?.error || tr("app.live.couldNotJoin"));
      return;
    }
    live.join({
      conversationUrl: body.conversation_url,
      dropKey: drop.drop_key,
      title: drop.title,
      market,
      productVideo: drop.video_url,
      productImage: drop.image_url,
    });
    recordLiveDropEvent(drop.drop_key, "host_started");
  };

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || posting) return;
    setPosting(true);
    setPostError("");
    const response = await fetch("/api/live/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_key: drop.drop_key, session_id: analyticsSessionId(), text }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    setPosting(false);
    if (!response?.ok) {
      setPostError(body?.error || tr("app.live.didntSend"));
      return;
    }
    setQuestion("");
    const id = `m${body.id}`;
    mineRef.current.add(id);
    const position = Number(body.position) || 0;
    const presenting = body.phase === "presenting";
    /* Straight back, so nobody sits wondering whether anybody saw it. */
    setChat((current) => [
      ...current.map((message) => (message.id === id ? { ...message, author: tr("app.live.you"), mine: true } : message)),
      {
        id: `note-${body.id}`,
        kind: "note" as const,
        author: "",
        text: presenting
          ? tr("app.live.gotItPresenting", { position: position || 1 })
          : tr("app.live.gotIt", { position: position || 1 }),
        at: new Date().getTime() + 1,
      },
    ].slice(-80));
  };

  const inLineText = queued === 1 ? tr("app.live.questionsOne") : tr("app.live.questionsMany", { count: queued });
  const status =
    phase === "presenting"
      ? { tone: "bg-white/10 text-white", dot: "bg-lime", text: `${tr("app.live.statusPresenting")}${queued ? ` · ${inLineText}` : ""}` }
      : phase === "answering"
        ? { tone: "bg-lime text-ink", dot: "bg-ink", text: queued ? `${tr("app.live.qaOpen")} · ${inLineText}` : tr("app.live.qaAskAnything") }
        : null;

  /*
   * The chat, on the picture, the way a phone live stream shows it.
   *
   * It was a dark panel under the video, which read as a comments box on a
   * web page rather than an audience in the room. Now the last few lines sit
   * over the lower left of the stage with no background at all (white text
   * with a shadow to stay readable on any frame), fading out as they rise, and
   * the question box is a clear pill along the bottom edge.
   */
  const shadow = "[text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_10px_rgba(0,0,0,0.55)]";
  const recent = lines.slice(-6);
  const chatOverlay = (onPhone: boolean) => (
    <>
      <div
        ref={listRef}
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute bottom-14 left-3 z-30 max-h-[52%] w-[62%] flex-col justify-end gap-1 overflow-hidden sm:bottom-16 sm:left-4 sm:w-[48%]",
          onPhone ? "flex" : "hidden sm:flex",
          shadow,
        )}
        style={{ maskImage: "linear-gradient(to top, black 70%, transparent)", WebkitMaskImage: "linear-gradient(to top, black 70%, transparent)" }}
      >
        {status ? (
          <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold text-white">
            <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", phase === "answering" ? "bg-lime" : "bg-white")} aria-hidden="true" />
            {status.text}
          </p>
        ) : null}
        {recent.length ? (
          recent.map((message) =>
            message.kind === "note" ? (
              <p key={message.id} className="text-xs font-semibold leading-snug text-lime sm:text-sm">
                {message.text}
              </p>
            ) : (
              <p key={message.id} className="text-xs leading-snug text-white sm:text-sm">
                <span className={message.kind === "chloe" ? "font-black text-lime" : "font-bold text-white/90"}>
                  {message.author}
                </span>{" "}
                {message.text}
                {"sent" in message && message.sent ? (
                  <span className="ml-1 text-[10px] font-semibold text-lime">{tr("app.live.chloeHasIt")}</span>
                ) : "mine" in message && message.mine ? (
                  <span className="ml-1 text-[10px] text-white/70">{tr("app.live.inLine")}</span>
                ) : null}
              </p>
            ),
          )
        ) : (
          <p className="text-xs text-white/90 sm:text-sm">{tr("app.live.askAnything")}</p>
        )}
      </div>
      <form onSubmit={ask} className="absolute inset-x-3 bottom-3 z-30 flex gap-2 sm:inset-x-4">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={200}
          placeholder={postError || tr("app.live.askPlaceholder")}
          aria-label={tr("app.live.questionLabel")}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-full border bg-black/10 px-4 text-sm text-white outline-none placeholder:text-white/80 focus:border-white/80 sm:h-10",
            postError ? "border-[#ff7a68]" : "border-white/45",
            shadow,
          )}
        />
        <button
          type="submit"
          disabled={!question.trim() || posting}
          className="h-9 rounded-full bg-lime px-4 text-xs font-black text-ink shadow-lg disabled:opacity-50 sm:h-10"
        >
          {tr("app.live.send")}
        </button>
      </form>
    </>
  );

  if (watching) {
    return (
      <div className="relative flex w-full min-w-0 flex-col bg-[#07172b]">
        <div className="relative">
          <SwapStage
            talking={live.talking}
            productVideo={drop.video_url}
            productImage={drop.image_url}
            productAlt={drop.title}
            host={
              <>
                <BroadcastVideo
                  stream={live.stream}
                  className="h-full w-full object-cover"
                  label={tr("app.live.chloeLabel")}
                  onNeedsPlay={setNeedsPlay}
                />
                {!live.joined ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#07172b] text-sm font-bold text-white/75">
                    {tr("app.live.connectingChloe")}
                  </div>
                ) : null}
              </>
            }
          />
          {needsPlay ? (
            <button
              type="button"
              onClick={(event) => {
                const video = event.currentTarget.parentElement?.querySelector("video[aria-label^='Chloe']") as HTMLVideoElement | null;
                void video?.play().then(() => setNeedsPlay(false));
              }}
              className="absolute inset-0 z-40 m-auto h-12 w-fit rounded-full bg-accent px-6 text-sm font-black text-white"
            >
              {tr("app.live.playChloe")}
            </button>
          ) : null}
          <StageLabel>{tr("app.live.aiHost")}</StageLabel>
          <div className="absolute right-3 top-3 z-30 flex gap-1.5">
            <MusicToggle on={live.musicOn} onChange={live.setMusicOn} />
            <button
              type="button"
              onClick={live.leave}
              className="rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-black"
            >
              {tr("app.live.leave")}
            </button>
          </div>
          {chatOverlay(true)}
        </div>
        {error || live.error ? <p className="px-3 pt-2 text-xs font-semibold text-red-300">{error || live.error}</p> : null}
        {board}
      </div>
    );
  }

  return (
    <div className="relative flex w-full min-w-0 flex-col">
      <div className="relative">
        <SwapStage
          talking
          productVideo={drop.video_url}
          productImage={drop.image_url}
          productAlt={drop.title}
          host={
            <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_20%,#123b69_0%,#07172b_48%,#030914_100%)] px-4 pb-10 text-center">
              <p className="hidden text-base font-black text-white sm:block sm:text-xl">{tr("app.live.presentingLive")}</p>
              <p className="mt-1.5 hidden max-w-xs text-xs leading-relaxed text-white/65 sm:block sm:text-sm">
                {tr("app.live.watchWithEveryone")}
              </p>
              <button
                type="button"
                onClick={start}
                disabled={starting}
                className="relative z-40 mt-3 rounded-full bg-accent px-5 py-2 text-xs font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 sm:mt-4 sm:px-6 sm:py-2.5 sm:text-sm"
              >
                {starting ? tr("app.live.connectingChloe") : tr("app.live.watchChloe")}
              </button>
              {error ? <p className="relative z-20 mt-2 text-xs font-semibold text-red-300">{error}</p> : null}
            </div>
          }
        />
        <StageLabel>{tr("app.live.aiHost")}</StageLabel>
        {/* Before joining, the join button needs the middle of a small phone
            stage, so the lines show from tablet width up; the box is always there. */}
        {chatOverlay(false)}
      </div>
      {board}
    </div>
  );
}

function StageLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute left-3 top-3 z-30 rounded-full border border-white/15 bg-black/65 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
      {children}
    </span>
  );
}
