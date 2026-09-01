"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ClockCounterClockwise,
  Heart,
  NotePencil,
  PaperPlaneRight,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  Trash,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { RetailerIcon } from "@/components/ui/RetailerIcon";
import {
  askAssistant,
  checkAssistantAvailable,
  DeliaError,
  deleteConversation,
  listConversations,
  loadConversation,
  sendFeedback,
  type DeliaConversationSummary,
  type DeliaRecommendation,
  type DeliaResult,
  type DeliaProgress,
  type DeliaTurn,
} from "@/lib/delia";
import {
  SavedOffersProvider,
  useSavedOffers,
} from "@/components/account/SavedOffers";
import { useDelia } from "./DeliaContext";

/**
 * The four openers on the empty panel, grouped by the kind of question rather
 * than kept in one flat list.
 *
 * One is drawn from each group, so the four on screen are always four
 * different shapes of ask: a budget, a comparison, a hunt for the best price,
 * and something about this site or about buying in general. Drawing four at
 * random from a single pool would regularly show four budget questions, which
 * teaches a first-time visitor that budgets are all Delia does.
 *
 * They change on every open, and again on every new conversation. Somebody who
 * did not recognise themselves in the first four gets a different four next
 * time, and the set as a whole is the plainest statement of what she can be
 * asked for.
 */
const EXAMPLE_GROUPS = [
  [
    "Find me a mattress under six hundred dollars",
    "A coffee machine under two hundred, worth the money",
    "Headphones under a hundred that are actually good",
    "A washing machine under eight hundred that lasts",
    "An air fryer for a small kitchen, under eighty",
  ],
  [
    "Compare the two cheapest robot vacuums",
    "Air fryer or mini oven, which is better value?",
    "Compare prices for a PlayStation 5 across shops",
    "Is the expensive electric toothbrush worth it?",
    "Compare two 65 inch TVs around a thousand",
  ],
  [
    "Where is the cheapest 65 inch TV right now?",
    "Who has AirPods Pro cheapest today?",
    "Find maple syrup, 32 oz, at the best price",
    "Cheapest place for a decent office chair",
    "Find a 1TB SSD, cheapest shop that ships",
  ],
  [
    "What is today's drop?",
    "What should I look for in a laptop?",
    "A birthday gift for someone who cooks, under fifty",
    "Is now a good time to buy a TV?",
    "Something useful for a new flat, under eighty",
  ],
];

/* The first paint has to be identical on the server and in the browser, so it
   takes the first of each group; the shuffle happens once the panel is up. */
const FIRST_EXAMPLES = EXAMPLE_GROUPS.map((group) => group[0]);
const pickExamples = () =>
  EXAMPLE_GROUPS.map((group) => group[Math.floor(Math.random() * group.length)]);

/**
 * What Delia is doing, while she does it.
 *
 * This used to run on a clock alone: "Searching the shops" at four seconds and
 * "Comparing the best of them" at twenty six, whether or not anything had been
 * searched or found. It filled the wait, which was the point, but it was
 * decoration, and it said the same confident thing whether the search was
 * flying or stuck.
 *
 * The server now reports each milestone as it reaches it, so the line says
 * what is true: what it understood, and how many offers came back to check.
 * The clock stays underneath as the fallback, for the stretch between
 * milestones and for a browser that could not read the stream.
 */
function SearchProgress({ progress }: { progress: DeliaProgress | null }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const fromClock =
    seconds < 4
      ? "Working out what you need"
      : seconds < 14
        ? "Searching the shops"
        : seconds < 26
          ? "Checking prices and stock"
          : "Comparing the best of them";

  const label = (() => {
    if (!progress) return fromClock;
    if (progress.stage === "understood") {
      const product = progress.product?.trim();
      /* Repeating the request back is the strongest signal that anything is
         happening at all, and it catches a misread early: somebody who asked
         for a monitor and reads "looking for a mirror" can stop right there. */
      if (product) {
        return progress.budget_max
          ? `Looking for a ${product} under ${progress.budget_max}`
          : `Looking for a ${product}`;
      }
      return "Working out what you need";
    }
    if (progress.stage === "catalog") {
      return progress.found ? `Found ${progress.found} of our own picks` : "Searching the shops";
    }
    /* A plan with no named shops is an open search, and "looking in 0 shops"
       would be worse than saying nothing about the number. */
    if (progress.stage === "searching") {
      return progress.shops ? `Searching ${progress.shops} shops` : "Searching the shops";
    }
    if (progress.stage === "checking") {
      return progress.found
        ? `Found ${progress.found}, checking prices and stock`
        : "Checking prices and stock";
    }
    return fromClock;
  })();

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
  /* Our own formatting wins whenever there is a number to format. The model
     writes the price as prose and is not consistent about it: one live answer
     listed the same vacuum twice, once as "$199.99" and once as "USD 199.99".
     The model's string is kept only for offers that arrived without a number. */
  const price =
    rec.price_value !== null
      ? formatPrice(rec.price_value, rec.currency || "USD", market)
      : rec.price || "";

  const body = (
    <>
      <span className="w-4 shrink-0 pt-0.5 text-xs font-bold text-fg-subtle tnum">
        {position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug text-fg">
          {rec.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {/* The shop icon, ahead of its name. A list of six shops is read
              by logo long before it is read by word. */}
          <RetailerIcon retailer={rec.retailer} url={rec.url} />
          <span className="truncate text-xs text-fg-muted">{rec.retailer}</span>
          {/* The list is in price order, so "cheapest" mostly confirms what the
              eye already sees. The pick is the one worth pointing at: it is not
              always the cheapest, and without this the shopper has to read the
              summary to find out which row Delia meant. */}
          {rec.position_role === "best_overall" && (
            <span className="shrink-0 rounded-full bg-lime px-1.5 py-px text-[0.65rem] font-semibold text-ink">
              Delia&rsquo;s pick
            </span>
          )}
          {rec.position_role === "lowest_price" && (
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[0.65rem] font-semibold text-fg-muted">
              Cheapest
            </span>
          )}
        </span>
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

  const linkClass = "flex min-w-0 flex-1 items-start gap-3";

  /* The heart is a sibling of the link, not inside it. A button nested in an
     anchor is invalid, and worse, tapping it would follow the link to the shop
     as well as saving. */
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border py-2.5 pl-3 pr-2 transition-colors hover:border-border-strong hover:bg-surface-2">
      {inCatalog ? (
        <Link href={href} onClick={onClose} className={linkClass}>
          {body}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="sponsored noopener noreferrer" className={linkClass}>
          {body}
        </a>
      )}
      <SaveOfferButton rec={rec} price={price} />
    </div>
  );
}

/**
 * Put this one aside.
 *
 * Rendered for everyone, including visitors with no account: the tap is what
 * makes signing up worth doing, so hiding it until they have signed up gets
 * the order backwards. An unsigned tap raises the prompt instead.
 */
function SaveOfferButton({ rec, price }: { rec: DeliaRecommendation; price: string }) {
  const saved = useSavedOffers();
  if (!saved) return null;
  const isSaved = saved.isSaved(rec.url);

  return (
    <button
      type="button"
      onClick={() =>
        saved.toggle({
          url: rec.url,
          title: rec.title,
          retailer: rec.retailer,
          price_value: rec.price_value ?? null,
          currency: rec.currency || "",
          image_url: rec.image_url || "",
          catalog_product_id: rec.catalog_product_id ?? 0,
        })
      }
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove ${rec.title} from saved` : `Save ${rec.title}`}
      title={isSaved ? "Saved" : "Save for later"}
      className={cn(
        "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
        isSaved ? "text-lime-deep" : "text-fg-subtle hover:bg-surface hover:text-fg",
      )}
    >
      <Heart size={16} weight={isSaved ? "fill" : "regular"} aria-hidden="true" />
      {/* Screen readers get the price alongside the product name, so the
          button is not just "save" repeated down the list. */}
      <span className="sr-only">{price}</span>
    </button>
  );
}

/** One question-and-answer exchange, rendered as a pair of chat bubbles. */
function DeliaExchange({
  result,
  market,
  onFollowUp,
  onSkipClarification,
  onClose,
  feedbackGiven,
  onFeedback,
  disabled,
}: {
  result: DeliaResult;
  market: string;
  onFollowUp: (text: string) => void;
  onSkipClarification: () => void;
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

            {/* A way past the question.
              *
              * Asking before searching is right when the request is broad
              * enough that the answer would otherwise span a $42 novelty
              * camera and an $800 Canon. It is wrong to make it compulsory:
              * somebody in a hurry, or somebody who does not know the answer
              * yet, has to be able to see something. */}
            {result.canSkipClarification && (
              <button
                type="button"
                disabled={disabled}
                onClick={onSkipClarification}
                className="text-sm font-semibold text-fg-muted underline underline-offset-4 transition-colors hover:text-fg disabled:cursor-default disabled:opacity-40"
              >
                Just show me options
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

        {/* Delia already works out whether these are what was asked for, and
            said so in result_state, but the shopper was never told. Somebody
            who asked for 32oz maple syrup and got a 33.8oz bottle deserves to
            know that before they click, not after it arrives. */}
        {result.resultState === "closest_alternatives" && result.recommendations.length > 0 && (
          <p className="text-xs font-medium text-fg-muted">
            Nothing matched exactly, so these are the closest I found.
          </p>
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
  /* Null until /api/me answers. Guessing either way flashes the wrong header
     at somebody for half a second, and guessing "signed out" tells a signed-in
     shopper they have been logged out. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<DeliaConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /* What the search has actually reached, as it reaches it. */
  const [progress, setProgress] = useState<DeliaProgress | null>(null);
  const [examples, setExamples] = useState<string[]>(FIRST_EXAMPLES);

  /* Shuffled once the panel exists rather than during render, so the server
     and the browser agree on the first paint. */
  useEffect(() => setExamples(pickExamples()), []);
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
    async (transcript: string, skipClarification = false) => {
      setLoading(true);
      setErrorMsg(null);
      setPendingQuestion(transcript);
      try {
        const next = await askAssistant(
          transcript,
          {
            market,
            history: historyRef.current,
            shoppingMission: missionRef.current,
            skipClarification,
            conversationId: conversationIdRef.current,
          },
          setProgress,
        );
        setProgress(null);
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
        /* The backend has just written this exchange, so the sidebar is one
           request behind until it is asked again. */
        if (signedIn) listConversations().then(setConversations);
      }
    },
    [market, signedIn],
  );

  /* A fresh conversation. Nothing is lost: the one being left has already been
     written on the server, and is a tap away in the list. */
  const newConversationKey = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  const startNewConversation = useCallback(() => {
    conversationIdRef.current = newConversationKey();
    historyRef.current = [];
    missionRef.current = null;
    setTurns([]);
    setErrorMsg(null);
    setPendingQuestion(null);
    setHistoryOpen(false);
    /* A fresh conversation gets fresh openers: the four that were ignored last
       time are the four least worth showing again. */
    setExamples(pickExamples());
  }, []);

  /**
   * Reopens a stored conversation as though it had just happened.
   *
   * The transcript is rebuilt into the history the model sees, so a follow-up
   * on a week-old conversation carries its context the way a follow-up on a
   * live one does. Without that, reopening would be reading, not continuing.
   */
  const openConversation = useCallback(async (id: number) => {
    const loaded = await loadConversation(id);
    if (!loaded) return;
    if (loaded.key) conversationIdRef.current = loaded.key;
    historyRef.current = loaded.turns.flatMap((turn) => [
      { role: "user" as const, content: turn.transcript },
      { role: "assistant" as const, content: turn.message },
    ]);
    missionRef.current = loaded.turns[loaded.turns.length - 1]?.shoppingMission ?? null;
    setTurns(loaded.turns);
    setErrorMsg(null);
    setHistoryOpen(false);
  }, []);

  const removeConversation = useCallback(async (id: number) => {
    /* Off the list first, so it disappears under the finger. It is one row in
       a sidebar; putting it back on failure would be more startling than
       letting it go. */
    setConversations((current) => current.filter((item) => item.id !== id));
    await deleteConversation(id);
  }, []);

  /* Who is here, and what they have asked before. A visitor with no account
     gets neither button, because there is nowhere to keep a conversation that
     belongs to nobody. */
  useEffect(() => {
    if (!open) return;
    fetch("/api/me")
      .then((response) => response.json())
      .then((body) => {
        const isSignedIn = Boolean(body?.user);
        setSignedIn(isSignedIn);
        if (isSignedIn) return listConversations().then(setConversations);
        return undefined;
      })
      .catch(() => setSignedIn(false));
  }, [open]);

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
    <SavedOffersProvider market={market}>
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
            {/* History and a fresh start. Shown only to somebody signed in,
                because there is nowhere to keep a conversation that belongs to
                no account, and an empty list with no explanation reads as
                broken. */}
            {signedIn && (
              <>
                <button
                  type="button"
                  onClick={startNewConversation}
                  aria-label="New conversation"
                  title="New conversation"
                  className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <NotePencil size={19} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-pressed={historyOpen}
                  aria-label="Past conversations"
                  title="Past conversations"
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
                    historyOpen
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <ClockCounterClockwise size={19} weight="bold" aria-hidden="true" />
                </button>
              </>
            )}
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
          {/* Past conversations take over the panel rather than squeezing in
              beside it. At this width a permanent rail would leave the offers
              in a column too narrow to read a product name in, and the list is
              somewhere you pass through, not somewhere you sit. */}
          {historyOpen ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg">Your conversations</p>
              {conversations.length === 0 ? (
                <p className="pt-2 text-sm leading-relaxed text-fg-muted">
                  Nothing here yet. Anything you ask from now on is kept with your
                  account, so you can pick it up again later.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {conversations.map((conversation) => (
                    <li key={conversation.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openConversation(conversation.id)}
                        className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                      >
                        <span className="block truncate text-sm font-medium text-fg">
                          {conversation.title || "Untitled conversation"}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {new Date(conversation.updated_at).toLocaleDateString()}
                          {conversation.questions > 1 && ` · ${conversation.questions} questions`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeConversation(conversation.id)}
                        aria-label={`Delete ${conversation.title || "this conversation"}`}
                        title="Delete"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        <Trash size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
          <>
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
                {examples.map((e) => (
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
                  onSkipClarification={() => ask(result.transcript, true)}
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
                  <SearchProgress progress={progress} />
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
          </>
          )}
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

      <SaveNeedsAccount />
    </div>
    </SavedOffersProvider>
  );
}

/**
 * The moment somebody wants to keep something is the moment an account is
 * worth having, so this is where the asking happens rather than at the door.
 *
 * Deliberately not a wall: the shopper keeps their results and their
 * conversation, and can dismiss this and carry on. Nothing they have done is
 * taken away for not signing up.
 */
function SaveNeedsAccount() {
  const saved = useSavedOffers();
  if (!saved?.promptToSignIn) return null;

  return (
    <div
      role="status"
      className="fade-in absolute inset-x-4 bottom-4 z-10 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-card sm:inset-x-auto"
    >
      <p className="text-sm font-semibold text-fg">Sign in to keep this</p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        Saved products stay with your account, so they are still here on your phone
        tomorrow.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/${saved.market}/account`}
          className="inline-flex h-10 items-center rounded-full bg-lime px-4 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
        >
          Create a free account
        </Link>
        <button
          type="button"
          onClick={saved.dismissPrompt}
          className="inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
