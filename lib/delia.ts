/**
 * Thin client for the backend's real AI shopping assistant.
 *
 * Delia used to be a local rule-based keyword filter over a static index.
 * She now asks the actual OpenAI-backed assistant (via the same-origin
 * `/api/shopping-assistant` proxy — see app/api/shopping-assistant/route.ts
 * for why a proxy is needed) and renders whatever it comes back with. All the
 * understanding — parsing a budget, a category, "well rated", a comparison —
 * happens server-side now; this file just types the contract and calls it.
 */

export type DeliaRecommendation = {
  title: string;
  retailer: string;
  /** Backend-formatted price string — often empty; fall back to `price_value`. */
  price: string;
  price_value: number | null;
  currency: string;
  badge: string;
  reason: string;
  url: string;
  action_label: string;
  source_type: "catalog" | "web";
  image_url: string;
  catalog_product_id: number | null;
  /* The backend sends the same evidence it shows on a deal page with every
     recommendation. None of it was declared here, so the card could not show
     any of it and a shopper had to open the retailer to learn anything beyond
     a price. Optional because a live web result carries far less of it than a
     verified catalog product: score, rating and the delivery terms are only
     ever populated for the latter. */
  score?: number | null;
  rating?: number | null;
  reviews?: number;
  delivery?: string;
  returns?: string;
  availability?: string;
  total_price?: number | null;
  in_catalog?: boolean;
  /* Which offer this is within the shortlist. The backend has worked this out
     all along and nothing was reading it, so a shopper scanning six shops had
     no idea which one Delia would take or which one was simply cheapest. */
  position_role?: "best_overall" | "lowest_price" | "alternative";
};

export type DeliaComparisonRow = {
  catalog_product_id: number | null;
  recommendation_index: number;
  best_for: string;
  strengths: string[];
  drawbacks: string[];
};

export type DeliaClarificationPrompt = {
  question: string;
  options: string[];
};

export type DeliaResult = {
  transcript: string;
  message: string;
  resultState: "exact_matches" | "closest_alternatives" | "no_match";
  followUp: string;
  recommendations: DeliaRecommendation[];
  /**
   * Real product pages the backend found and vouched for, but whose price it
   * could not confirm in the retailer's own currency. They carry a title, a
   * retailer, a direct link and a photo, so they are worth showing — flagged
   * as "check the price at the retailer" rather than hidden, which is what
   * used to happen and read as "she found nothing".
   */
  partialOffers: DeliaRecommendation[];
  comparisonNotes: string[];
  comparison: DeliaComparisonRow[];
  /** True when Delia asked something before searching, so the panel can offer
   *  a way past it. */
  canSkipClarification?: boolean;
  /** Set when the backend needs more detail before it can search — the
   * `message` is only the lead-in sentence ("Let me clarify two things:"),
   * the actual questions live here. `clarificationPrompts` carries tappable
   * answer options when the backend has them; `clarifyingQuestions` is the
   * plain-text fallback. */
  clarifyingQuestions: string[];
  clarificationPrompts: DeliaClarificationPrompt[];
  /**
   * The backend's structured read of what this conversation is shopping for:
   * product type, brand, budget, size, audience. It hands this back on every
   * reply and accepts it again on the next request, so the thread keeps its
   * subject instead of being re-guessed from raw text each turn. Treated as
   * opaque here on purpose — it is the backend's shape, and the client only
   * has to carry it faithfully.
   */
  shoppingMission: unknown;
};

export type DeliaTurn = { role: "user" | "assistant"; content: string };

/**
 * The reply text field is `message`, not `answer` — confirmed against the
 * live backend rather than assumed from source, since the two disagreed.
 */
type AssistantResponse = {
  message?: string;
  result_state?: DeliaResult["resultState"];
  follow_up?: string;
  recommendations?: DeliaRecommendation[];
  partial_offers?: DeliaRecommendation[];
  comparison_notes?: string[];
  comparison?: DeliaComparisonRow[];
  clarifying_questions?: string[];
  clarification_prompts?: DeliaClarificationPrompt[];
  can_skip_clarification?: boolean;
  shopping_mission?: unknown;
};

export class DeliaError extends Error {}

export async function askAssistant(
  transcript: string,
  opts: {
    market: string;
    language?: string;
    history?: DeliaTurn[];
    /** Carried over from the previous reply. See `DeliaResult.shoppingMission`. */
    shoppingMission?: unknown;
    /** Sent by the "just show me options" button, so a broad request can be
     *  searched without answering anything first. */
    skipClarification?: boolean;
    /**
     * Which conversation this question belongs to.
     *
     * Without it the backend has nothing to append the exchange to and drops
     * it, which is exactly what happened: conversations were stored, listed
     * and reopenable, and not one was ever written, because the id stayed in
     * the panel and never reached the request.
     */
    conversationId?: string;
  },
): Promise<DeliaResult> {
  const res = await fetch("/api/shopping-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: transcript,
      messages: opts.history,
      shopping_mission: opts.shoppingMission ?? undefined,
      market: opts.market,
      language: opts.language,
      skip_clarification: opts.skipClarification || undefined,
      conversation_id: opts.conversationId || undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as AssistantResponse & {
    error?: string;
  };

  if (!res.ok) {
    throw new DeliaError(data.error || "Delia could not answer that. Try again.");
  }

  return toResult(transcript, data);
}

/**
 * One backend answer, in the shape the panel renders.
 *
 * Shared with the history loader on purpose: a conversation reopened from the
 * sidebar has to look and behave exactly like one that has just happened,
 * offers and clarification chips included. Two mappings would drift, and the
 * one nobody looks at would be the stored one.
 */
function toResult(transcript: string, data: AssistantResponse): DeliaResult {
  return {
    transcript,
    message: data.message || "",
    resultState: data.result_state || "no_match",
    followUp: data.follow_up || "",
    recommendations: data.recommendations || [],
    partialOffers: data.partial_offers || [],
    comparisonNotes: data.comparison_notes || [],
    comparison: data.comparison || [],
    clarifyingQuestions: data.clarifying_questions || [],
    clarificationPrompts: data.clarification_prompts || [],
    /* Set when Delia asked before searching. The panel turns this into a way
       past the question, so a broad request is never a wall. */
    canSkipClarification: Boolean(data.can_skip_clarification),
    shoppingMission: data.shopping_mission ?? null,
  };
}

/** One past conversation, as the sidebar lists it. */
export type DeliaConversationSummary = {
  id: number;
  conversation_key: string;
  title: string;
  market: string;
  updated_at: string;
  questions: number;
};

/**
 * The shopper's past conversations, newest first.
 *
 * Returns nothing for a visitor with no account rather than throwing: not
 * being signed in is the ordinary case, not a failure, and the sidebar simply
 * has nothing to show.
 */
export async function listConversations(): Promise<DeliaConversationSummary[]> {
  const res = await fetch("/api/delia/conversations").catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    conversations?: DeliaConversationSummary[];
  };
  return data.conversations || [];
}

/**
 * Reopens a conversation as a list of turns.
 *
 * Messages are stored one per row, alternating question and answer. They are
 * paired back up here: a question with no answer after it is dropped, since a
 * turn the shopper cannot see the reply to is worse than a shorter history.
 */
export async function loadConversation(
  id: number,
): Promise<{ key: string; turns: DeliaResult[] } | null> {
  const res = await fetch(`/api/delia/conversations/${id}`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    conversation?: { conversation_key?: string };
    messages?: { role: string; content: string; answer: AssistantResponse | null }[];
  };
  const messages = data.messages || [];
  const turns: DeliaResult[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const reply = messages[index + 1];
    if (!reply || reply.role !== "assistant") continue;
    turns.push(
      reply.answer
        ? toResult(message.content, reply.answer)
        : /* The answer was too large to keep whole. Its prose survived, so the
             conversation still reads; the offers in it did not. */
          toResult(message.content, { message: reply.content }),
    );
  }
  return { key: data.conversation?.conversation_key || "", turns };
}

export async function deleteConversation(id: number): Promise<boolean> {
  const res = await fetch(`/api/delia/conversations/${id}`, { method: "DELETE" }).catch(() => null);
  return Boolean(res && res.ok);
}

export async function checkAssistantAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/shopping-assistant/status");
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: boolean };
    return Boolean(data.available);
  } catch {
    return false;
  }
}

export type DeliaFeedbackType = "helpful" | "not_helpful" | "wrong_price";

export async function sendFeedback(opts: {
  feedbackType: DeliaFeedbackType;
  conversationId: string;
  messageId: string;
  market: string;
}): Promise<void> {
  try {
    await fetch("/api/shopping-assistant/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback_type: opts.feedbackType,
        conversation_id: opts.conversationId,
        message_id: opts.messageId,
        market: opts.market,
      }),
    });
  } catch {
    // Feedback is a nicety; a failed beacon shouldn't surface as an error.
  }
}
