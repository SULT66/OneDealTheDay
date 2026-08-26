"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
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
  type DeliaRecommendation,
  type DeliaResult,
  type DeliaTurn,
} from "@/lib/delia";
import { useDelia } from "./DeliaContext";

const EXAMPLES = [
  "Find me a mattress under six hundred dollars",
  "Show well rated headphones on Amazon",
  "What's today's drop?",
  "Compare the cheapest two tools you have",
];

/**
 * What Delia is doing, while she does it.
 *
 * A real search over several shops takes twenty to forty seconds. Three
 * bouncing dots for that long reads as a hung page, and the shopper closes the
 * panel before the answer arrives. Naming the step turns the same wait into
 * visible work. The timings match what the search actually does: classify,
 * search the shops, then read prices off the pages it found.
 */
function SearchProgress() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const label =
    seconds < 4
      ? "Working out what you need"
      : seconds < 14
        ? "Searching the shops"
        : seconds < 26
          ? "Checking prices and stock"
          : "Comparing the best of them";

  return (
    <span className="text-xs text-fg-subtle" aria-live="polite">
      {label}
    </span>
  );
}

/**
 * One place the shopper can buy the thing they asked for: product, shop, price,
 * and a link straight to it.
 *
 * Deliberately a row and not a picture card. The decision being made here is
 * "where do I buy this and what does it cost", and a photo of a television
 * says nothing about that while pushing the next offer off the screen. Rows
 * also let the shortlist run to eight without the panel becoming a gallery.
 *
 * `priceUnconfirmed` marks a real product page whose price the backend could
 * not verify in the market's currency. The row still earns its place (the
 * shopper asked where to buy this, and this is a shop that sells it), it just
 * says plainly that the price has to be read at the retailer instead of
 * inventing a figure.
 */
function OfferRow({
  rec,
  market,
  onClose,
  position,
  priceUnconfirmed = false,
}: {
  rec: DeliaRecommendation;
  market: string;
  onClose: () => void;
  /** 1-based place in the shortlist, so the shopper can refer to "the second one". */
  position: number;
  priceUnconfirmed?: boolean;
}) {
  const inCatalog = rec.source_type === "catalog" && Boolean(rec.catalog_product_id);
  const href = inCatalog ? `/${market}/deal/${rec.catalog_product_id}` : rec.url;
  const price =
    rec.price ||
    (rec.price_value !== null
      ? formatPrice(rec.price_value, rec.currency || "USD", market)
      : "");

  const body = (
    <>
      <span className="w-4 shrink-0 pt-0.5 text-xs font-bold text-fg-subtle tnum">
        {position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug text-fg">
          {rec.title}
        </span>
        <span className="block truncate text-xs text-fg-muted">{rec.retailer}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 pt-0.5 text-sm font-bold text-fg tnum">
        {price || (
          <span className="text-xs font-medium text-fg-subtle">
            {priceUnconfirmed ? "Price at the shop" : "No price"}
          </span>
        )}
        {!inCatalog && <ArrowUpRight size={13} weight="bold" aria-hidden="true" />}
      </span>
    </>
  );

  const className =
    "flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2";

  return inCatalog ? (
    <Link href={href} onClick={onClose} className={className}>
      {body}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
    >
      {body}
    </a>
  );
}

/** One question-and-answer exchange, rendered as a pair of chat bubbles. */
function DeliaExchange({
  result,
  market,
  onFollowUp,
  onClose,
  feedbackGiven,
  onFeedback,
  disabled,
}: {
  result: DeliaResult;
  market: string;
  onFollowUp: (text: string) => void;
  onClose: () => void;
  feedbackGiven: boolean;
  onFeedback: (type: "helpful" | "not_helpful") => void;
  disabled: boolean;
}) {
  // When there are two questions, answering one used to fire the request
  // immediately, taking only that answer and leaving the other question
  // unanswered. Two questions now select, and wait for both before sending
  // one combined follow-up; a single question still sends on tap, since
  // there's nothing else to wait for.
  const [selections, setSelections] = useState<Record<number, string>>({});
  const multiQuestion = result.clarificationPrompts.length > 1;
  // Only a question that actually offers options can be answered here, so only
  // those may hold Continue back. The backend is not supposed to send an
  // optionless prompt at all, but when one slipped through it left Continue
  // permanently disabled with no way for the shopper to proceed.
  const answerableIndexes = result.clarificationPrompts
    .map((prompt, i) => (prompt.options.length > 0 ? i : -1))
    .filter((i) => i >= 0);
  const allAnswered =
    multiQuestion &&
    answerableIndexes.length > 0 &&
    answerableIndexes.every((i) => Boolean(selections[i]));

  function pickOption(promptIndex: number, option: string) {
    if (!multiQuestion) {
      onFollowUp(option);
      return;
    }
    setSelections((prev) => ({ ...prev, [promptIndex]: option }));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] wrap-anywhere rounded-2xl rounded-br-md bg-surface-inverse px-4 py-2.5 text-sm font-medium text-fg-on-inverse">
          {result.transcript}
        </p>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
          <Sparkle size={15} weight="fill" aria-hidden="true" />
        </span>
        <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3 text-sm leading-relaxed text-fg">
          {result.message}
        </p>
      </div>

      <div className="space-y-4 pl-[42px]">
        {/* Structured clarifying questions — tappable options answer them in
            one tap instead of making the shopper type. */}
        {result.clarificationPrompts.length > 0 && (
          <div className="space-y-3">
            {result.clarificationPrompts.map((prompt, i) => (
              <div key={i}>
                <p className="text-sm font-semibold text-fg">{prompt.question}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {prompt.options.map((option) => {
                    const selected = selections[i] === option;
                    return (
                      <li key={option}>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-pressed={multiQuestion ? selected : undefined}
                          onClick={() => pickOption(i, option)}
                          className={cn(
                            "cursor-pointer rounded-full border px-3.5 py-2 text-sm transition-colors disabled:cursor-default disabled:opacity-40",
                            selected
                              ? "border-transparent bg-lime text-ink hover:opacity-90"
                              : "border-border text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg disabled:hover:border-border disabled:hover:bg-transparent",
                          )}
                        >
                          {option}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {multiQuestion && (
              <button
                type="button"
                disabled={disabled || !allAnswered}
                onClick={() =>
                  onFollowUp(
                    answerableIndexes
                      .map((i) => selections[i])
                      .filter(Boolean)
                      .join(", "),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-88 disabled:cursor-default disabled:opacity-40"
              >
                Continue
                <ArrowRight size={14} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {result.clarificationPrompts.length === 0 && result.clarifyingQuestions.length > 0 && (
          <ul className="space-y-1.5">
            {result.clarifyingQuestions.map((question, i) => (
              <li key={i} className="text-sm text-fg">
                {question}
              </li>
            ))}
          </ul>
        )}

        {(result.recommendations.length > 0 || result.partialOffers.length > 0) && (
          <ul className="space-y-3">
            {result.recommendations.map((rec, i) => (
              <li key={`rec-${rec.url}-${i}`}>
                <OfferRow
                  rec={rec}
                  market={market}
                  onClose={onClose}
                  position={i + 1}
                />
              </li>
            ))}
            {/* Products the backend found and stands behind but could not price
                in this market's currency. They used to be dropped on the floor
                here, which is why a search that genuinely found something could
                still come back as prose with no products under it. Numbered on
                from the priced ones so the shortlist reads as one list. */}
            {result.partialOffers.map((rec, i) => (
              <li key={`partial-${rec.url}-${i}`}>
                <OfferRow
                  rec={rec}
                  market={market}
                  onClose={onClose}
                  position={result.recommendations.length + i + 1}
                  priceUnconfirmed
                />
              </li>
            ))}
          </ul>
        )}

        {result.comparisonNotes.length > 0 && (
          <ul className="space-y-1.5">
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
            disabled={disabled}
            onClick={() => onFollowUp(result.followUp)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:border-border"
          >
            {result.followUp}
          </button>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <span className="text-xs text-fg-subtle">Was this helpful?</span>
          <button
            type="button"
            disabled={feedbackGiven}
            onClick={() => onFeedback("helpful")}
            aria-label="This was helpful"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <ThumbsUp size={15} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={feedbackGiven}
            onClick={() => onFeedback("not_helpful")}
            aria-label="This was not helpful"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <ThumbsDown size={15} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeliaPanel() {
  const { open, seed, market, closeDelia } = useDelia();

  const [available, setAvailable] = useState<boolean | null>(null);
  // The whole conversation, in order — not just the latest exchange, so
  // asking a follow-up no longer erases what Delia already said.
  const [turns, setTurns] = useState<DeliaResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Shown immediately on submit, before the response arrives — otherwise the
  // question a shopper just sent had nowhere to render until the (sometimes
  // multi-second, real web-search-backed) answer landed, and read as "the
  // message disappeared."
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // Keyed by turn index — feedback is per-answer, not global to the panel.
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, boolean>>({});

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<DeliaTurn[]>([]);
  /* The backend's structured read of what this thread is shopping for. It
     returns one with every reply and accepts it back on the next request, so
     carrying it keeps the subject of the conversation explicit rather than
     leaving it to be inferred from the raw words again each turn. */
  const missionRef = useRef<unknown>(null);
  const conversationIdRef = useRef<string>("");

  const ask = useCallback(
    async (transcript: string) => {
      setLoading(true);
      setErrorMsg(null);
      setPendingQuestion(transcript);
      try {
        const next = await askAssistant(transcript, {
          market,
          history: historyRef.current,
          shoppingMission: missionRef.current,
        });
        missionRef.current = next.shoppingMission ?? missionRef.current;
        // The backend's `message` is only the lead-in sentence for a
        // clarification turn — the actual questions live in separate fields
        // (rendered in the UI, see DeliaExchange). Leaving them out of history
        // meant the next turn's classifier saw only a content-free intro line
        // with no trace of what was actually asked, so a short answer like
        // "everyday wear" had nothing left to attach to and read as a brand
        // new, product-less request.
        const assistantContent = [
          next.message,
          ...next.clarificationPrompts.map((prompt) => prompt.question),
          ...next.clarifyingQuestions,
        ]
          .filter(Boolean)
          .join(" ");
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: transcript },
          { role: "assistant", content: assistantContent },
        ];
        setTurns((prev) => [...prev, next]);
      } catch (error) {
        setErrorMsg(
          error instanceof DeliaError
            ? error.message
            : "Delia could not answer that. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
        setPendingQuestion(null);
      }
    },
    [market],
  );

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

  /* A growing conversation should keep the newest exchange in view. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns, loading]);

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
      restoreFocusRef.current?.focus?.();
      // A closed panel starts the next conversation fresh rather than
      // continuing a stale thread from the visitor's last visit.
      historyRef.current = [];
      missionRef.current = null;
      setTurns([]);
      setErrorMsg(null);
      setFeedbackGiven({});
    };
  }, [open, closeDelia]);

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const q = typed.trim();
    if (!q) return;
    setTyped("");
    ask(q);
  }

  function giveFeedback(turnIndex: number, type: "helpful" | "not_helpful") {
    setFeedbackGiven((prev) => ({ ...prev, [turnIndex]: true }));
    sendFeedback({
      feedbackType: type,
      conversationId: conversationIdRef.current,
      messageId: String(turnIndex),
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
        className="fade-in absolute inset-0 cursor-pointer bg-ink/55 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delia-title"
        className={cn(
          /* Wider than a plain chat needs: the shortlist is the point of the
             panel, and a product card with a photo, price, evidence and a
             call to action does not read well squeezed into a message column. */
          "rise-in relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden",
          "rounded-t-3xl bg-surface shadow-lift sm:rounded-3xl",
        )}
      >
        {/* header */}
        <div className="relative shrink-0 overflow-hidden bg-graphite px-5 py-5 sm:px-6 sm:py-6">
          <div className="relative flex items-center gap-3.5">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-ink ring-4 ring-white/10">
              <Sparkle size={22} weight="fill" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="delia-title" className="text-xl font-bold leading-tight text-white">
                Delia
              </h2>
              <p className="truncate text-xs text-white/65">
                Ask for what you want. She searches and compares the checked picks.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDelia}
              aria-label="Close Delia"
              className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 sm:min-h-[420px] sm:px-6 sm:py-6">
          {available === false && (
            <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
              Delia isn&apos;t connected right now. Try again shortly.
            </p>
          )}

          {turns.length === 0 && !loading && available !== false && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-lime-deep">
                <Sparkle size={26} weight="fill" aria-hidden="true" />
              </span>
              <p className="max-w-xs text-sm leading-relaxed text-fg-muted">
                Type what you are looking for.
              </p>
              <ul className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {EXAMPLES.map((e) => (
                  <li key={e}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => ask(e)}
                      className="w-full cursor-pointer rounded-2xl border border-border px-4 py-3 text-left text-sm text-fg-muted transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:text-fg hover:shadow-card disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:shadow-none"
                    >
                      {e}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {turns.length > 0 && (
            <div className="space-y-6" aria-live="polite">
              {turns.map((result, i) => (
                <DeliaExchange
                  key={i}
                  result={result}
                  market={market}
                  onFollowUp={ask}
                  onClose={closeDelia}
                  feedbackGiven={Boolean(feedbackGiven[i])}
                  onFeedback={(type) => giveFeedback(i, type)}
                  disabled={loading}
                />
              ))}
            </div>
          )}

          {loading && pendingQuestion && (
            <div className={cn("space-y-4", turns.length > 0 && "mt-6")} aria-live="polite">
              <div className="flex justify-end">
                <p className="max-w-[85%] wrap-anywhere rounded-2xl rounded-br-md bg-surface-inverse px-4 py-2.5 text-sm font-medium text-fg-on-inverse">
                  {pendingQuestion}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
                  <Sparkle size={15} weight="fill" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle" />
                  </span>
                  <SearchProgress />
                </span>
              </div>
            </div>
          )}

          {errorMsg && !loading && (
            <p role="alert" className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">
              {errorMsg}
            </p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* input row */}
        <form
          onSubmit={submitTyped}
          className="flex items-center gap-2 border-t border-border px-5 py-4"
        >
          <label htmlFor="delia-input" className="sr-only">
            Ask Delia a question
          </label>
          <input
            id="delia-input"
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your question"
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
