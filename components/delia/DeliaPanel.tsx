"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Microphone,
  PaperPlaneRight,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import {
  askAssistant,
  checkAssistantAvailable,
  DeliaError,
  sendFeedback,
  type DeliaResult,
  type DeliaTurn,
} from "@/lib/delia";
import { useDelia } from "./DeliaContext";
import { speak, stopSpeaking, useSpeech } from "./useSpeech";

const EXAMPLES = [
  "Find me a mattress under six hundred dollars",
  "Show well rated headphones on Amazon",
  "What's today's drop?",
  "Compare the cheapest two tools you have",
];

export function DeliaPanel() {
  const { open, seed, market, closeDelia } = useDelia();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [result, setResult] = useState<DeliaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<DeliaTurn[]>([]);
  const conversationIdRef = useRef<string>("");

  const ask = useCallback(
    async (transcript: string) => {
      setLoading(true);
      setErrorMsg(null);
      setFeedbackGiven(false);
      try {
        const next = await askAssistant(transcript, {
          market,
          history: historyRef.current,
        });
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: transcript },
          { role: "assistant", content: next.message },
        ];
        setResult(next);
        speak(next.message);
      } catch (error) {
        setErrorMsg(
          error instanceof DeliaError
            ? error.message
            : "Delia could not answer that. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [market],
  );

  const { supported, listening, interim, error, start, stop } = useSpeech({
    onFinal: ask,
  });

  /* Checked once per open, so an unavailable assistant (no OPENAI_API_KEY on
     the backend) shows a clear message instead of a silent failure. */
  useEffect(() => {
    if (!open || available !== null) return;
    checkAssistantAvailable().then(setAvailable);
  }, [open, available]);

  /* A trigger elsewhere in the tree can hand Delia a question — "Is this
     Milwaukee kit a good price?" from a deal page, say. */
  const askedSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      askedSeedRef.current = null;
      return;
    }
    if (!seed || askedSeedRef.current === seed) return;
    askedSeedRef.current = seed;
    ask(seed);
  }, [open, seed, ask]);

  /* Escape closes; focus moves in on open and back out on close; a fresh
     conversation id starts each time the panel opens. */
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    conversationIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDelia();
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      stop();
      stopSpeaking();
      restoreFocusRef.current?.focus?.();
      // A closed panel starts the next conversation fresh rather than
      // continuing a stale thread from the visitor's last visit.
      historyRef.current = [];
      setResult(null);
      setErrorMsg(null);
      setFeedbackGiven(false);
    };
  }, [open, closeDelia, stop]);

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const q = typed.trim();
    if (!q) return;
    setTyped("");
    ask(q);
  }

  function giveFeedback(type: "helpful" | "not_helpful") {
    setFeedbackGiven(true);
    sendFeedback({
      feedbackType: type,
      conversationId: conversationIdRef.current,
      messageId: String(historyRef.current.length),
      market,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close Delia"
        onClick={closeDelia}
        className="absolute inset-0 cursor-pointer bg-ink/55 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delia-title"
        className={cn(
          "relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden",
          "rounded-t-3xl bg-surface shadow-lift sm:rounded-3xl",
        )}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-lime text-ink">
            <Sparkle size={20} weight="fill" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="delia-title" className="text-lg font-bold leading-tight">
              Delia
            </h2>
            <p className="truncate text-xs text-fg-muted">
              Ask for what you want — she searches and compares the checked picks.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDelia}
            aria-label="Close Delia"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {available === false && (
            <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
              Delia isn&apos;t connected right now. Try again shortly.
            </p>
          )}

          {!result && !loading && available !== false && (
            <div>
              <p className="text-sm text-fg-muted">
                {supported
                  ? "Tap the microphone and say what you are looking for, or type it."
                  : "Your browser has no speech recognition, so type your question — the answers are identical."}
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <li key={e}>
                    <button
                      type="button"
                      onClick={() => ask(e)}
                      className="cursor-pointer rounded-full border border-border px-3.5 py-2 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                    >
                      {e}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listening && (
            <p className="mt-2 text-sm text-fg-muted" aria-live="polite">
              <span className="font-semibold text-fg">Listening…</span>{" "}
              {interim || "say something like “a sofa under five hundred”"}
            </p>
          )}

          {error === "denied" && (
            <p role="alert" className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
              Microphone access was blocked. Allow it in your browser settings,
              or type your question below.
            </p>
          )}
          {error === "no-speech" && (
            <p role="alert" className="mt-3 text-sm text-fg-muted">
              I did not catch that — try again, a little closer to the mic.
            </p>
          )}

          {loading && (
            <p className="mt-2 text-sm text-fg-muted" aria-live="polite">
              <span className="font-semibold text-fg">Delia is thinking…</span>
            </p>
          )}

          {errorMsg && !loading && (
            <p role="alert" className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
              {errorMsg}
            </p>
          )}

          {result && !loading && (
            <div aria-live="polite">
              <p className="text-xs uppercase tracking-wide text-fg-subtle">
                You asked
              </p>
              <p className="mt-1 wrap-anywhere text-base font-semibold text-fg">
                “{result.transcript}”
              </p>

              <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed text-fg">
                {result.message}
              </p>

              {result.recommendations.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {result.recommendations.map((rec, i) => {
                    const href =
                      rec.source_type === "catalog" && rec.catalog_product_id
                        ? `/${market}/deal/${rec.catalog_product_id}`
                        : rec.url;
                    const external = rec.source_type !== "catalog" || !rec.catalog_product_id;
                    const price =
                      rec.price ||
                      (rec.price_value !== null
                        ? formatPrice(rec.price_value, rec.currency || "USD", market)
                        : "");

                    const card = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">
                            {rec.title}
                          </span>
                          <span className="block text-xs text-fg-muted">
                            {rec.retailer}
                            {rec.badge && ` · ${rec.badge}`}
                          </span>
                          {rec.reason && (
                            <span className="mt-0.5 block text-xs text-fg-subtle">
                              {rec.reason}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-fg tnum">
                          {price}
                          {external && (
                            <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                          )}
                        </span>
                      </>
                    );

                    const className =
                      "flex items-center gap-3 rounded-2xl border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-2";

                    return (
                      <li key={`${rec.title}-${i}`}>
                        {external ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="sponsored noopener noreferrer"
                            className={className}
                          >
                            {card}
                          </a>
                        ) : (
                          <Link href={href} onClick={closeDelia} className={className}>
                            {card}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {result.comparisonNotes.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {result.comparisonNotes.map((note, i) => (
                    <li key={i} className="text-sm text-fg-muted">
                      {note}
                    </li>
                  ))}
                </ul>
              )}

              {result.followUp && (
                <button
                  type="button"
                  onClick={() => ask(result.followUp)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                >
                  {result.followUp}
                </button>
              )}

              <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                <span className="text-xs text-fg-subtle">Was this helpful?</span>
                <button
                  type="button"
                  disabled={feedbackGiven}
                  onClick={() => giveFeedback("helpful")}
                  aria-label="This was helpful"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  <ThumbsUp size={15} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={feedbackGiven}
                  onClick={() => giveFeedback("not_helpful")}
                  aria-label="This was not helpful"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  <ThumbsDown size={15} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* input row */}
        <form
          onSubmit={submitTyped}
          className="flex items-center gap-2 border-t border-border px-5 py-4"
        >
          {supported && (
            <button
              type="button"
              onClick={listening ? stop : start}
              disabled={loading}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={cn(
                "relative isolate inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full",
                "transition-transform duration-200 active:scale-95 disabled:opacity-50",
                listening
                  ? "delia-pulse bg-lime text-ink"
                  : "bg-surface-inverse text-fg-on-inverse",
              )}
            >
              <Microphone size={22} weight="fill" aria-hidden="true" />
            </button>
          )}

          <label htmlFor="delia-input" className="sr-only">
            Ask Delia a question
          </label>
          <input
            id="delia-input"
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={supported ? "…or type it here" : "Type your question"}
            className="h-12 min-w-0 flex-1 rounded-full border border-border bg-bg px-4 text-[0.95rem] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-border-strong"
          />

          <button
            type="submit"
            disabled={!typed.trim() || loading}
            aria-label="Send question"
            className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-lime text-ink transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            <PaperPlaneRight size={20} weight="fill" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
