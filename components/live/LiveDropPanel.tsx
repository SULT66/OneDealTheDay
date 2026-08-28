"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { recordLiveDropEvent } from "@/lib/analyticsSession";

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

export function LiveDropPanel({ market }: { market: string }) {
  const [drop, setDrop] = useState<LiveDropView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [untilStart, setUntilStart] = useState<number | null>(null);
  const [untilEnd, setUntilEnd] = useState<number | null>(null);
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
      <StateBadge state={drop.state} />

      <VideoSlot drop={drop} />

      <div className="mt-5 grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
        {drop.image_url ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-2 sm:w-[220px]">
            <Image
              src={drop.image_url}
              alt=""
              fill
              sizes="220px"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : null}

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
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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

          {drop.quantity_total > 0 && (
            <p className="mt-3 text-sm text-fg-muted">
              <span className="font-semibold text-fg tnum">{drop.quantity_total}</span> in total
              {isLive && (
                <>
                  {" · "}
                  <span className="font-semibold text-fg tnum">{drop.quantity_remaining}</span> left
                </>
              )}
            </p>
          )}

          <Countdown state={drop.state} untilStart={untilStart} untilEnd={untilEnd} />

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {isLive && drop.affiliate_url && (
              <a
                href={drop.affiliate_url}
                target="_blank"
                rel="sponsored noopener noreferrer"
                onClick={() => recordLiveDropEvent(drop.drop_key, "buy_click")}
                className="inline-flex h-12 items-center rounded-full bg-lime px-6 text-sm font-bold text-ink transition-opacity hover:opacity-88"
              >
                Buy now
              </a>
            )}
            <DeliaTrigger
              variant="header"
              label="Ask Delia"
              seed={`Is the ${drop.title} a good deal at ${price || "the drop price"}?`}
              className="h-12 px-5"
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
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">{children}</div>
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

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
        {live ? "Closes in" : "Opens in"}
      </p>
      <p className="mt-1 text-4xl font-black text-fg tnum" aria-live="off">
        {clock(seconds)}
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
function VideoSlot({ drop }: { drop: LiveDropView }) {
  const showable = drop.state === "waiting" || drop.state === "live";
  if (!showable) return null;

  if (drop.stream_embed_url) {
    return (
      <div className="mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-ink">
        <iframe
          src={drop.stream_embed_url}
          title={`${drop.title} live drop`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  if (drop.video_url) {
    return (
      <div className="mt-5 aspect-video w-full overflow-hidden rounded-2xl bg-ink">
        <video
          src={drop.video_url}
          controls
          autoPlay
          muted
          playsInline
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return null;
}
