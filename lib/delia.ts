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
    }),
  });

  const data = (await res.json().catch(() => ({}))) as AssistantResponse & {
    error?: string;
  };

  if (!res.ok) {
    throw new DeliaError(data.error || "Delia could not answer that. Try again.");
  }

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
    shoppingMission: data.shopping_mission ?? null,
  };
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
