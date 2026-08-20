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
};

export type DeliaComparisonRow = {
  catalog_product_id: number | null;
  recommendation_index: number;
  best_for: string;
  strengths: string[];
  drawbacks: string[];
};

export type DeliaResult = {
  transcript: string;
  message: string;
  resultState: "exact_matches" | "closest_alternatives" | "no_match";
  followUp: string;
  recommendations: DeliaRecommendation[];
  comparisonNotes: string[];
  comparison: DeliaComparisonRow[];
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
  comparison_notes?: string[];
  comparison?: DeliaComparisonRow[];
};

export class DeliaError extends Error {}

export async function askAssistant(
  transcript: string,
  opts: { market: string; language?: string; history?: DeliaTurn[] },
): Promise<DeliaResult> {
  const res = await fetch("/api/shopping-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: transcript,
      messages: opts.history,
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
    comparisonNotes: data.comparison_notes || [],
    comparison: data.comparison || [],
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
