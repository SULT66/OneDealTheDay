"use client";

import Link from "next/link";
import { AffiliateNotice } from "@/components/site/AffiliateNotice";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Heart,
  MagnifyingGlass,
  NotePencil,
  SidebarSimple,
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
  shortlistFromTurns,
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
const TRANSCRIPT_KEY = "odd-delia-transcript";

/*
 * Whether a stored turn can still be drawn.
 *
 * The transcript is written by whichever version of this file the visitor had
 * when they opened the tab, and read by whichever one they have now. A deploy
 * that adds a field to DeliaResult would otherwise leave old rows in a tab
 * that crash the panel on every reopen — not "Delia forgot", but "Delia is
 * broken until you notice the tab is the problem".
 *
 * So the arrays the renderer walks are required to be arrays. Trusting the
 * shape of anything that survived a deploy is how that class of bug gets in.
 */
function isRenderableTurn(value: unknown): value is DeliaResult {
  const turn = value as Partial<DeliaResult> | null;
  return Boolean(
    turn &&
    typeof turn.transcript === "string" &&
    typeof turn.message === "string" &&
    Array.isArray(turn.recommendations) &&
    Array.isArray(turn.partialOffers) &&
    Array.isArray(turn.comparison) &&
    Array.isArray(turn.comparisonNotes) &&
    Array.isArray(turn.clarifyingQuestions) &&
    Array.isArray(turn.clarificationPrompts),
  );
}

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

/* A fresh conversation. Nothing is lost: the one being left has already been
   written on the server, and is a tap away in the list. */
const newConversationKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now());

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
  /*
   * A web result leaves through our own redirect when the server signed one.
   *
   * These used to link straight out, which cost the click — nobody could tell
   * whether Delia's suggestions were followed — and cost the commission, since
   * a link we do not send cannot be affiliated. `rec.url` stays as the
   * fallback for an older response that carries no signed path.
   */
  const href = inCatalog
    ? `/${market}/deal/${rec.catalog_product_id}`
    : rec.click_url || rec.url;
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
        {/* Two lines before it gives up. On a phone one line cut every name to
            "PlayStation 5 Digit…", which is the part that told them apart. */}
        <span className="line-clamp-2 text-sm font-medium leading-snug text-fg">
          {rec.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {/* The shop icon, ahead of its name. A list of six shops is read
              by logo long before it is read by word. */}
          <RetailerIcon retailer={rec.retailer} url={rec.url} />
          <span className="truncate text-xs text-fg-muted">{rec.retailer}</span>
          {/* Which group a card is in is its heading now (see OfferGroups).
              What stays on the card is what the heading cannot say: that her
              pick is also the cheapest, and that it is not new. */}
          {rec.position_role === "best_overall" && rec.lowest_price && (
            <span className="shrink-0 rounded-full bg-bg px-1.5 py-px text-[0.65rem] font-semibold text-fg-muted">
              {rec.lowest_new ? "Lowest new price" : "Lowest price"}
            </span>
          )}
          {rec.condition && CONDITION_LABEL[rec.condition] && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[0.65rem] font-semibold text-fg-muted">
              {CONDITION_LABEL[rec.condition]}
            </span>
          )}
        </span>
        {/* Her reason on her pick, and anything about a card worth knowing
            before the click: a different edition, a bundle, a size the page
            does not state. */}
        {(rec.pick_reason || rec.note) && (
          <span className="mt-1 block text-xs leading-snug text-fg-muted">
            {rec.pick_reason || rec.note}
            {rec.pick_reason && rec.note ? ` · ${rec.note}` : ""}
          </span>
        )}
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
  /*
   * The same product at other shops, on this card instead of as more cards.
   *
   * The duplicate check folded these in all along and nothing showed them, so
   * the same Sony headphones appeared twice a few rows apart when the check
   * missed, and vanished without trace when it caught them. Each is its own
   * link, beside the main one rather than inside it.
   */
  const otherOffers = (rec.other_offers || []).filter((offer) => offer?.url && offer?.retailer);

  return (
    <div className="rounded-2xl border border-border bg-surface py-3 pl-3.5 pr-2 transition-colors hover:border-border-strong hover:bg-bg">
      <div className="flex items-start gap-2">
        {inCatalog ? (
          <Link href={href} onClick={onClose} className={linkClass}>
            {body}
          </Link>
        ) : (
          <a href={href} target="_blank" rel="sponsored noopener" className={linkClass}>
            {body}
          </a>
        )}
        <SaveOfferButton rec={rec} price={price} />
      </div>
      {otherOffers.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-xs text-fg-muted">
          <span>Also at</span>
          {otherOffers.map((offer) => {
            const otherPrice =
              offer.price_value != null
                ? formatPrice(offer.price_value, offer.currency || rec.currency || "USD", market)
                : offer.price || "";
            return (
              <a
                key={offer.url}
                href={offer.click_url || offer.url}
                target="_blank"
                rel="sponsored noopener"
                className="font-medium text-fg underline-offset-4 hover:underline"
              >
                {offer.retailer}
                {otherPrice && <span className="tnum text-fg-muted"> · {otherPrice}</span>}
              </a>
            );
          })}
        </p>
      )}
    </div>
  );
}

/*
 * The shortlist in groups: Delia's pick, a cheaper option, the lowest price,
 * then everything else — and only the first three until more are asked for.
 *
 * The backend decides the groups and the order (arrangeRecommendations); this
 * only draws a heading wherever the group changes. Six rows, a paragraph,
 * questions and a follow-up at once was a wall on a phone, and the three that
 * answer "which one" are what most people need.
 */
const CONDITION_LABEL: Record<string, string> = {
  refurbished: "Refurbished",
  pre_owned: "Pre-owned",
  open_box: "Open box",
};

/* "Lowest price" is only said where it is true: over a list that also holds
   something cheaper and second-hand, it is the lowest new price, and the
   second-hand one gets a group named for what it is. */
function groupHeading(rec: DeliaRecommendation): string {
  switch (rec.position_role) {
    case "best_overall":
      return "Delia’s pick";
    case "cheaper_option":
      return "Cheaper option";
    case "lowest_price":
      return rec.lowest_new ? "Lowest new price" : "Lowest price";
    case "lowest_used_price":
      return `Lowest ${(CONDITION_LABEL[rec.condition || ""] || "used").toLowerCase()} price`;
    default:
      return "Other options";
  }
}
const FIRST_SHOWN = 3;

function OfferGroups({
  recs,
  market,
  onClose,
}: {
  recs: DeliaRecommendation[];
  market: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? recs : recs.slice(0, FIRST_SHOWN);
  const hiddenCount = recs.length - FIRST_SHOWN;
  let previousHeading = "";

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {shown.map((rec, i) => {
          const heading = groupHeading(rec);
          const startsGroup = heading !== previousHeading;
          previousHeading = heading;
          return (
            <li key={`rec-${rec.url}-${i}`}>
              {startsGroup && (
                <p className={cn("px-0.5 pb-1.5 text-xs font-semibold text-fg-subtle", i > 0 && "pt-2")}>
                  {heading}
                </p>
              )}
              <OfferRow rec={rec} market={market} onClose={onClose} position={i + 1} />
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="cursor-pointer rounded-full px-1 text-sm font-semibold text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          {expanded ? "Show fewer" : `Show ${hiddenCount} more ${hiddenCount === 1 ? "option" : "options"}`}
        </button>
      )}
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

/*
 * The two voices, drawn the way people now expect a conversation with an
 * assistant to look.
 *
 * The shopper's words sit in a soft grey bubble on the right. Delia's answer is
 * not a bubble at all: it is plain text across the column, beside her mark,
 * with the products under it. A black bubble for the shopper and a grey one for
 * her made every exchange look like two blocks of equal weight, when the
 * answer is the thing being read and the question is a one-line reminder of
 * what was asked.
 */
function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] whitespace-pre-wrap wrap-anywhere rounded-3xl bg-bg px-4 py-2.5 text-[0.95rem] leading-relaxed text-fg">
        {children}
      </p>
    </div>
  );
}

function DeliaMark() {
  return (
    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
      <Sparkle size={14} weight="fill" aria-hidden="true" />
    </span>
  );
}

/** One question-and-answer exchange. */
function DeliaExchange({
  result,
  market,
  onFollowUp,
  onAnswerFollowUp,
  onSkipClarification,
  onClose,
  feedbackGiven,
  onFeedback,
  disabled,
}: {
  result: DeliaResult;
  market: string;
  onFollowUp: (text: string) => void;
  /* Puts the cursor in the composer so the shopper answers Delia's question,
     rather than sending it back to her as their own. */
  onAnswerFollowUp: () => void;
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

  /* A question is only worth a second card when it is a different question. */
  const asQuestion = (text: string) => text.toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]+/g, " ").trim();
  const askedAbove = new Set([
    ...result.clarificationPrompts.map((prompt) => asQuestion(prompt.question)),
    ...result.clarifyingQuestions.map(asQuestion),
  ]);
  const followUpIsNew = Boolean(result.followUp) && !askedAbove.has(asQuestion(result.followUp));

  function pickOption(promptIndex: number, option: string) {
    if (!multiQuestion) {
      onFollowUp(option);
      return;
    }
    setSelections((prev) => ({ ...prev, [promptIndex]: option }));
  }

  return (
    <div className="space-y-5">
      <UserBubble>{result.transcript}</UserBubble>

      <div className="flex items-start gap-3">
        <DeliaMark />
        <div className="min-w-0 flex-1 space-y-4">
        <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-fg">{result.message}</p>

        {/* Delia already works out whether these are what was asked for, and
            said so in result_state, but the shopper was never told. Somebody
            who asked for 32oz maple syrup and got a 33.8oz bottle deserves to
            know that before they click, not after it arrives.

            Only under her own words. The plain template already opens with
            "Nothing matched exactly", and the shopper was reading it twice. */}
        {result.resultState === "closest_alternatives" &&
          result.messageSource === "delia" &&
          result.recommendations.length > 0 && (
            <p className="text-xs font-medium text-fg-muted">
              Nothing matched exactly, so these are the closest I found.
            </p>
          )}

        {result.recommendations.length > 0 && (
          <OfferGroups recs={result.recommendations} market={market} onClose={onClose} />
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

        {/*
          * Questions come after the results, never before them.
          *
          * They used to sit between Delia's sentence and her shortlist, so the
          * shopper met "What will you mainly use them for?" before seeing that
          * anything had been found, and could not tell whether they had to
          * answer first. The results are ready; these only narrow them.
          */}
        {(result.clarificationPrompts.length > 0 || result.clarifyingQuestions.length > 0) && (
          <div className="space-y-3">
            {result.recommendations.length > 0 && (
              <p className="px-0.5 text-xs font-semibold text-fg-subtle">Narrow it down</p>
            )}

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
                              : "border-border text-fg-muted hover:border-border-strong hover:bg-bg hover:text-fg disabled:hover:border-border disabled:hover:bg-transparent",
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
                className="block text-sm font-semibold text-fg-muted underline underline-offset-4 transition-colors hover:text-fg disabled:cursor-default disabled:opacity-40"
              >
                Just show me options
              </button>
            )}

            {result.clarificationPrompts.length === 0 && (
              <ul className="space-y-1.5">
                {result.clarifyingQuestions.map((question, i) => (
                  <li key={i} className="text-sm text-fg">
                    {question}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/*
          * Delia's question to the shopper, shown as hers.
          *
          * This was a chip that sent its own text as the shopper's message, and
          * the backend writes follow_up as the question she is asking them —
          * "One short useful follow-up question" in the schema, "ask about it
          * the way a person would" in the prompt. Pressing it therefore made
          * the shopper appear to ask "What price is OneDailyDrop showing you?",
          * which is nonsense in that direction, and she answered her own
          * question.
          *
          * Pressing it now puts the cursor in the box to answer, which is what
          * a control under a question was always going to be taken to mean.
          *
          * Not when it repeats a question already asked above with options:
          * "Is this for a desktop, laptop, or PS5?" was shown twice, once as
          * chips and once again here.
          */}
        {followUpIsNew && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAnswerFollowUp}
            className="flex w-full items-start rounded-2xl border border-border bg-bg px-4 py-3 text-left transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">{result.followUp}</span>
              <span className="mt-0.5 block text-xs text-fg-subtle">Answer to narrow it down</span>
            </span>
          </button>
        )}

        {/* Quiet actions under the answer, as icons rather than a labelled row
            with a rule above it: they are there for the few who want them. */}
        <div className="-ml-1.5 flex items-center gap-0.5">
          <button
            type="button"
            disabled={feedbackGiven}
            onClick={() => onFeedback("helpful")}
            aria-label="This was helpful"
            title={feedbackGiven ? "Thanks for the feedback" : "Helpful"}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-bg hover:text-fg disabled:cursor-default disabled:opacity-40"
          >
            <ThumbsUp size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={feedbackGiven}
            onClick={() => onFeedback("not_helpful")}
            aria-label="This was not helpful"
            title={feedbackGiven ? "Thanks for the feedback" : "Not helpful"}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-bg hover:text-fg disabled:cursor-default disabled:opacity-40"
          >
            <ThumbsDown size={16} aria-hidden="true" />
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

/*
 * Groups a list the way it is scanned: by how long ago, not by date string.
 * Nobody looks for "9/11/2026"; they look for "the one from yesterday".
 */
function groupByRecency(conversations: DeliaConversationSummary[], now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const groups: { label: string; items: DeliaConversationSummary[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const conversation of conversations) {
    const at = new Date(conversation.updated_at).getTime();
    const index = Number.isNaN(at)
      ? 3
      : at >= startOfToday
        ? 0
        : at >= startOfToday - day
          ? 1
          : at >= startOfToday - 7 * day
            ? 2
            : 3;
    groups[index].items.push(conversation);
  }
  return groups.filter((group) => group.items.length > 0);
}

/**
 * Past conversations, beside the chat on a wide screen and over it on a phone.
 *
 * The list used to replace the conversation inside the panel, with the question
 * box still showing underneath it. Typing there sent a real question into a
 * conversation nobody could see — the answer arrived behind the list — so what
 * you typed appeared to vanish. On a wide screen the list now sits alongside
 * and nothing is hidden; on a phone it covers the whole chat, question box
 * included, so there is nothing to type into that you cannot see.
 *
 * The box at the top searches what was said, not only the titles. A title is
 * written from the first question, and "hi, can you help me" hides a whole
 * conversation about a PS5.
 */
function ConversationSidebar({
  conversations,
  activeKey,
  query,
  onQuery,
  searching,
  onOpen,
  onDelete,
  onNew,
  onClose,
}: {
  conversations: DeliaConversationSummary[];
  activeKey: string;
  query: string;
  onQuery: (value: string) => void;
  searching: boolean;
  onOpen: (id: number) => void;
  onDelete: (id: number, key: string) => void;
  onNew: () => void;
  /* Present when the sidebar is an overlay that can be dismissed. */
  onClose?: () => void;
}) {
  const groups = groupByRecency(conversations);
  const hasQuery = query.trim().length > 0;

  return (
    <aside className="flex h-full w-full flex-col bg-bg md:w-72 md:shrink-0 md:border-r md:border-border">
      <div className="flex items-center gap-2 px-3 pt-3">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg transition-colors hover:bg-surface"
        >
          <NotePencil size={18} aria-hidden="true" />
          New chat
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversations"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-3 pb-2 pt-2">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 transition-colors focus-within:border-fg-subtle">
          <MagnifyingGlass size={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search chats"
            autoComplete="off"
            spellCheck={false}
            className="focus-self h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      </div>

      <nav aria-label="Past conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 pt-3 text-sm leading-relaxed text-fg-muted">
            {hasQuery
              ? searching
                ? "Searching…"
                : `No conversations mention “${query.trim()}”.`
              : "Your conversations will appear here."}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold text-fg-subtle">{group.label}</p>
              <ul>
                {group.items.map((conversation) => {
                  const active = conversation.conversation_key === activeKey;
                  return (
                    <li key={conversation.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onOpen(conversation.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "block w-full cursor-pointer rounded-lg py-2 pl-3 pr-9 text-left transition-colors",
                          active ? "bg-surface" : "hover:bg-surface",
                        )}
                      >
                        <span className="block truncate text-sm text-fg">
                          {conversation.title || "Untitled conversation"}
                        </span>
                        {conversation.snippet && (
                          <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                            {conversation.snippet}
                          </span>
                        )}
                      </button>
                      {/* Out of the way until wanted on a mouse; always there on
                          touch, where there is no hover to reveal it. */}
                      <button
                        type="button"
                        onClick={() => onDelete(conversation.id, conversation.conversation_key)}
                        aria-label={`Delete ${conversation.title || "this conversation"}`}
                        title="Delete"
                        className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-fg-subtle transition-opacity hover:bg-bg hover:text-fg focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Trash size={15} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

export function DeliaPanel() {
  const { open, seed, seedProductId, market, language, closeDelia } = useDelia();

  const [available, setAvailable] = useState<boolean | null>(null);
  // The whole conversation, in order — not just the latest exchange, so
  // asking a follow-up no longer erases what Delia already said.
  /*
   * The transcript outlives the panel being closed.
   *
   * sessionStorage rather than state alone: closing the panel to move an
   * overlay out of the way, or to look at a product, used to lose the whole
   * conversation with no warning and no undo. This lasts exactly as long as
   * the tab does, which is the lifetime a shopping session actually has.
   *
   * Every read and write is guarded — a private window, or a browser set to
   * block site data, throws on access rather than returning empty, and a
   * shopping assistant that cannot open is worse than one that forgets.
   */
  const [turns, setTurns] = useState<DeliaResult[]>([]);

  /*
   * Read after mounting, not in the state initialiser.
   *
   * The initialiser was the obvious place and it silently did nothing: this
   * renders on the server too, where there is no sessionStorage, so the
   * initialiser returned an empty list and hydration then overwrote whatever
   * the browser had worked out. The transcript came back into storage and
   * never onto the screen.
   */
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(TRANSCRIPT_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      const restored = Array.isArray(parsed) ? parsed.filter(isRenderableTurn) : [];
      if (restored.length) setTurns(restored);
      /* Anything unreadable goes, rather than sitting in the tab poisoning
         every reopen until the visitor thinks to close it. */
      else window.sessionStorage.removeItem(TRANSCRIPT_KEY);
    } catch {
      /* A private window throws on access. The panel works without it. */
    }
  }, []);

  /*
   * And what Delia herself remembers, rebuilt from the same transcript.
   *
   * Restoring only the visible messages would put four questions back on the
   * screen while she answered the fifth as though it were the first — the
   * conversation would look continuous and stop behaving like one, which is
   * worse than losing it honestly.
   */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !turns.length) return;
    restoredRef.current = true;
    historyRef.current = turns.flatMap((turn) => [
      { role: "user" as const, content: turn.transcript },
      { role: "assistant" as const, content: turn.message },
    ]);
    missionRef.current = turns[turns.length - 1]?.shoppingMission ?? null;
  }, [turns]);

  useEffect(() => {
    try {
      if (turns.length) window.sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(turns));
      else window.sessionStorage.removeItem(TRANSCRIPT_KEY);
    } catch {
      /* Nothing to do and nothing worth saying: the panel works either way. */
    }
  }, [turns]);
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
  /* On a phone the conversation list covers the chat; on a wide screen it is
     always beside it and this only matters below that width. */
  const [historyOpen, setHistoryOpen] = useState(false);
  /* Which stored conversation is on screen, so the list can mark it. State
     rather than the ref alone, because the list has to re-render when it moves. */
  const [activeKey, setActiveKey] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [searchingConversations, setSearchingConversations] = useState(false);
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
  /* A textarea, not an input: a question can run to two lines, and Chrome keeps
     a history dropdown of everything ever typed into an input with this id —
     it opened over the conversation list the moment the box was clicked. */
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef<DeliaTurn[]>([]);
  /* The answers on screen, readable from inside `ask` without making it change
     on every turn. "Which one is better?" has to be sent with the list it is
     about. */
  const turnsRef = useRef<DeliaResult[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  /* The backend's structured read of what this thread is shopping for. It
     returns one with every reply and accepts it back on the next request, so
     carrying it keeps the subject of the conversation explicit rather than
     leaving it to be inferred from the raw words again each turn. */
  const missionRef = useRef<unknown>(null);
  const conversationIdRef = useRef<string>("");
  /*
   * Which question the panel is still waiting on.
   *
   * An answer takes long enough that people move on while it comes — press New
   * chat, or open an old conversation. Nothing used to notice. The loading flag
   * stayed on while the pending question was cleared, so the chat drew nothing
   * at all: no greeting, no messages, an empty white panel. Then the answer
   * arrived and was appended to whatever was now on screen, which was a
   * different conversation.
   *
   * Every question takes a number, anything that leaves the conversation takes
   * the next one, and an answer whose number is no longer current is dropped.
   */
  const requestSeqRef = useRef(0);

  const ask = useCallback(
    async (transcript: string, skipClarification = false) => {
      const requestId = ++requestSeqRef.current;
      const stillCurrent = () => requestId === requestSeqRef.current;
      setLoading(true);
      setErrorMsg(null);
      setPendingQuestion(transcript);
      /* The answer is on its way to the chat, so the chat is what has to be on
         screen. Leaving the list open is how a question used to seem to vanish. */
      setHistoryOpen(false);
      if (!conversationIdRef.current) conversationIdRef.current = newConversationKey();
      setActiveKey(conversationIdRef.current);
      try {
        const next = await askAssistant(
          transcript,
          {
            market,
            history: historyRef.current,
            shoppingMission: missionRef.current,
            skipClarification,
            conversationId: conversationIdRef.current,
            /* Stays for the whole conversation: "does it charge wirelessly?"
               is still about the product the shopper opened Delia from. */
            productId: seedProductId ?? undefined,
            shortlist: shortlistFromTurns(turnsRef.current),
          },
          (event) => {
            if (stillCurrent()) setProgress(event);
          },
        );
        /* The shopper has moved on. The exchange is saved on the server and
           will be in the list; it just does not belong on this screen. */
        if (!stillCurrent()) return;
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
        /* A failure nobody is waiting for any more is not worth showing. */
        if (!stillCurrent()) return;
        setErrorMsg(
          error instanceof DeliaError
            ? error.message
            : "Delia could not answer that. Check your connection and try again.",
        );
      } finally {
        /* Only the question still being waited on may end the wait. A stale one
           finishing would switch the spinner off under a newer question. */
        if (stillCurrent()) {
          setLoading(false);
          setPendingQuestion(null);
          /* The backend has just written this exchange, so the sidebar is one
             request behind until it is asked again. A search in progress is
             cleared rather than re-run: the conversation just asked is the one
             the shopper is looking at, and it should be visible in the list.
             Not for an abandoned question — that would wipe a search somebody
             is typing into right now; it shows up on the next refresh. */
          if (signedIn) {
            setConversationQuery("");
            listConversations().then(setConversations);
          }
        }
      }
    },
    [market, signedIn],
  );

  /* Leaving the current conversation, for any reason, stops waiting on it. */
  const abandonPendingQuestion = () => {
    requestSeqRef.current += 1;
    setLoading(false);
    setPendingQuestion(null);
    setProgress(null);
  };

  const startNewConversation = useCallback(() => {
    abandonPendingQuestion();
    conversationIdRef.current = newConversationKey();
    historyRef.current = [];
    missionRef.current = null;
    setTurns([]);
    setErrorMsg(null);
    setPendingQuestion(null);
    setHistoryOpen(false);
    setActiveKey("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
    abandonPendingQuestion();
    if (loaded.key) conversationIdRef.current = loaded.key;
    historyRef.current = loaded.turns.flatMap((turn) => [
      { role: "user" as const, content: turn.transcript },
      { role: "assistant" as const, content: turn.message },
    ]);
    missionRef.current = loaded.turns[loaded.turns.length - 1]?.shoppingMission ?? null;
    setTurns(loaded.turns);
    setErrorMsg(null);
    setHistoryOpen(false);
    setActiveKey(loaded.key || "");
  }, []);

  const removeConversation = useCallback(
    async (id: number, key: string) => {
      /* Off the list first, so it disappears under the finger. It is one row in
         a sidebar; putting it back on failure would be more startling than
         letting it go. */
      setConversations((current) => current.filter((item) => item.id !== id));
      /* Deleting the conversation on screen leaves nothing to show beside the
         list, so it becomes a new one rather than a transcript of something
         that no longer exists. */
      if (key && key === conversationIdRef.current) startNewConversation();
      await deleteConversation(id);
    },
    [startNewConversation],
  );

  /* Searching the list, a moment after the typing stops, so each keystroke is
     not its own request. An empty box is the plain list again. */
  useEffect(() => {
    if (!signedIn) return;
    const term = conversationQuery.trim();
    setSearchingConversations(Boolean(term));
    const timer = window.setTimeout(() => {
      listConversations(term).then((found) => {
        setConversations(found);
        setSearchingConversations(false);
      });
    }, term ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [conversationQuery, signedIn]);

  /* The question box grows with what is typed, up to a limit, then scrolls. */
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 200)}px`;
  }, [typed]);

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
      /*
       * Closing the panel no longer throws the conversation away.
       *
       * It used to, on the reasoning that a new visit should start fresh —
       * true, and it could not tell a new visit from the thing that actually
       * happens: somebody closes the panel to get an overlay out of the way,
       * or to look at a product, and comes back to find four questions of work
       * gone. There is no undo for that and no sign it was about to happen.
       *
       * Kept in sessionStorage instead, which is exactly the lifetime the old
       * comment was reaching for: it survives closing and reopening the panel
       * and moving between pages, and it is gone when the tab is.
       */
      setErrorMsg(null);
    };
  }, [open, closeDelia]);

  function submitTyped(e?: React.FormEvent) {
    e?.preventDefault();
    const q = typed.trim();
    if (!q || loading) return;
    setTyped("");
    ask(q);
    /* The box moves from the middle of an empty chat to the bottom when the
       first question goes, which remounts it — put the cursor back. */
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  /* Enter sends and Shift+Enter starts a new line, as in every chat. Not while
     an input method is composing — Enter there confirms a word, and sending on
     it would post half a sentence typed with a Japanese or Chinese keyboard. */
  function onComposerKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitTyped();
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

  /*
   * The question box, drawn in one of two places: centred under the greeting on
   * an empty chat, and pinned to the bottom once there is a conversation — the
   * way a new chat opens in the assistants people already use. What has been
   * typed lives in state, so it survives the move.
   *
   * Focus is shown on the whole box rather than as a ring around the field
   * inside it; see .focus-self in globals.css for why that needed saying.
   */
  const composer = (
    <form onSubmit={submitTyped} className="w-full">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex cursor-text items-end gap-2 rounded-[28px] border border-border bg-surface py-2 pl-5 pr-2 shadow-card transition-colors focus-within:border-fg-subtle"
      >
        <label htmlFor="delia-input" className="sr-only">
          Ask Delia
        </label>
        <textarea
          id="delia-input"
          ref={inputRef}
          rows={1}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onComposerKey}
          placeholder="Ask Delia anything"
          autoComplete="off"
          className="focus-self max-h-[200px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-6 text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          disabled={!typed.trim() || loading}
          aria-label="Send question"
          className="mb-0.5 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-lime text-ink transition-colors hover:bg-lime-deep disabled:cursor-default disabled:bg-border disabled:text-fg-subtle"
        >
          <ArrowUp size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </form>
  );

  /* Under the box and always on screen, however far the conversation scrolls:
     the disclosure has to be findable next to the links it describes. */
  const footnote = (
    <div className="mt-2 px-2 text-center">
      <AffiliateNotice market={market} language={language} compact />
    </div>
  );

  const showEmpty = turns.length === 0 && !loading && available !== false;
  const hasSidebar = signedIn === true;

  const sidebar = (onClose?: () => void) => (
    <ConversationSidebar
      conversations={conversations}
      activeKey={activeKey}
      query={conversationQuery}
      onQuery={setConversationQuery}
      searching={searchingConversations}
      onOpen={openConversation}
      onDelete={removeConversation}
      onNew={startNewConversation}
      onClose={onClose}
    />
  );

  const iconButton =
    "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-bg hover:text-fg";

  return (
    <SavedOffersProvider market={market}>
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4">
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
          /* The whole screen on a phone, where a sheet with a strip of page
             above it only takes room from the answer; a large window on a
             desktop, wide enough for the list beside the chat. */
          "rise-in relative flex w-full overflow-hidden bg-surface shadow-lift",
          "h-dvh sm:h-[min(880px,92dvh)] sm:rounded-3xl",
          hasSidebar ? "sm:max-w-6xl" : "sm:max-w-4xl",
        )}
      >
        {hasSidebar && <div className="hidden md:flex">{sidebar()}</div>}
        {hasSidebar && historyOpen && (
          <div className="absolute inset-0 z-20 flex md:hidden">
            {sidebar(() => setHistoryOpen(false))}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* A plain bar, not a dark block: the conversation is what the eye
              should land on, and a heavy header was the loudest thing here. */}
          <div className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
            {hasSidebar && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Past conversations"
                title="Past conversations"
                className={cn(iconButton, "md:hidden")}
              >
                <SidebarSimple size={20} aria-hidden="true" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
              <DeliaMark />
              <h2 id="delia-title" className="truncate text-base font-bold text-fg">
                Delia
              </h2>
            </div>
            {hasSidebar && (
              <button
                type="button"
                onClick={startNewConversation}
                aria-label="New chat"
                title="New chat"
                className={cn(iconButton, "md:hidden")}
              >
                <NotePencil size={20} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={closeDelia} aria-label="Close Delia" className={iconButton}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {showEmpty ? (
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 pb-10 pt-2 sm:px-6">
                <h3 className="text-balance text-center text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                  What are you shopping for?
                </h3>
                <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-fg-muted">
                  Tell Delia what you need and your budget.
                </p>

                <div className="mt-7 w-full">{composer}</div>

                <ul className="mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  {examples.map((e) => (
                    <li key={e}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => ask(e)}
                        className="w-full cursor-pointer rounded-2xl border border-border px-4 py-3 text-left text-sm text-fg-muted transition-colors hover:bg-bg hover:text-fg disabled:cursor-default disabled:opacity-40"
                      >
                        {e}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-4">{footnote}</div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                {available === false && (
                  <p role="alert" className="rounded-2xl bg-bg p-4 text-sm text-fg-muted">
                    Delia isn&apos;t connected right now. Try again shortly.
                  </p>
                )}

                {turns.length > 0 && (
                  <div className="space-y-8" aria-live="polite">
                    {turns.map((result, i) => (
                      <DeliaExchange
                        key={i}
                        result={result}
                        market={market}
                        onFollowUp={ask}
                        onAnswerFollowUp={() => inputRef.current?.focus()}
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
                  <div className={cn("space-y-5", turns.length > 0 && "mt-8")} aria-live="polite">
                    <UserBubble>{pendingQuestion}</UserBubble>
                    <div className="flex items-start gap-3">
                      <DeliaMark />
                      <span className="inline-flex items-center gap-2.5 pt-1.5">
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
                  <p role="alert" className="mt-4 rounded-2xl bg-bg p-4 text-sm text-fg-muted">
                    {errorMsg}
                  </p>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {!showEmpty && (
            <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                {composer}
                {footnote}
              </div>
            </div>
          )}
        </div>
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
  const { closeDelia } = useDelia();
  if (!saved?.promptToSignIn) return null;

  return (
    <div
      role="status"
      /*
        * Above the composer, not on top of it.
        *
        * At bottom-4 it covered the box you type in, so the only obvious way
        * to get back to typing was the panel's X — which closed the panel and,
        * until the change above, threw the conversation away. An invitation to
        * make an account should not be standing in the doorway.
        */
      className="fade-in absolute inset-x-4 bottom-44 z-10 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-card sm:inset-x-auto"
    >
      <p className="text-sm font-semibold text-fg">Sign in to keep this</p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        Saved products stay with your account, so they are still here on your phone
        tomorrow.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/${saved.market}/account`}
          /*
           * Closes the panel on the way.
           *
           * The panel lives in the layout, so it stays mounted across a
           * client-side navigation: tapping this took you to the account page
           * and left Delia sitting on top of it, so nothing appeared to
           * happen and the button read as broken. It was working; it was just
           * standing in front of its own result.
           */
          onClick={() => {
            saved.dismissPrompt();
            closeDelia();
          }}
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
