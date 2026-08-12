const assert = require("assert");
const fs = require("fs");
const path = require("path");
const renderShoppingAssistantPanel = require("../src/shoppingAssistantPanel");

const root = path.join(__dirname, "..");
const client = fs.readFileSync(
  path.join(root, "public", "shopping-assistant.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(root, "public", "shopping-assistant.css"),
  "utf8",
);
const server = fs.readFileSync(path.join(root, "src", "server.js"), "utf8");
const db = fs.readFileSync(path.join(root, "src", "db.js"), "utf8");
const panel = renderShoppingAssistantPanel("us", "en");

for (const required of [
  "Delia",
  "D.E.L.I.A.",
  "data-assistant-history",
  "data-assistant-saved",
  "data-assistant-new",
  "data-assistant-clear",
  "data-assistant-stop",
  "data-assistant-product-context",
  "data-assistant-subtitle",
]) {
  assert(panel.includes(required), `Delia panel is missing ${required}`);
}

for (const required of [
  "odd_delia_chats_v1",
  "MAX_CHATS = 20",
  "titleFromQuestion",
  "renderRecommendations",
  "renderPartialOffers",
  "renderMarketContext",
  "timeoutBody",
  "renderComparison",
  "renderClarifyingQuestions",
  "renderFollowUpActions",
  "setProductContext",
  "toggleSaved",
  "sendFeedback",
  "AbortController",
  "REQUEST_TIMEOUT_MS = 33000",
  "normalizeResponseBody",
  "localGreetingResponse",
  "recoverEmbeddedAnswer",
  "responseTr",
  "responseOptionCountLabel",
  "isDirectProductPage",
  "isEditorialProductPage",
  "malformed",
  "thinkingSearch",
  "otherOffers",
  "conversation_title",
  "partial_offers",
  "shopping_context",
  "resolved_request",
  "updateConversationLocale",
  "position_role",
  "showLocalComparison",
  "cheaperRequest",
  "requestQuestion",
  "trigger_action",
  "localizeRetailerFact",
  "totalDelivered",
  "noNewStores",
]) {
  assert(client.includes(required), `Delia client is missing ${required}`);
}

assert(
  client.includes("Привет! 👋 Как дела?") &&
    client.includes("Здорово! 😄 Как ты?"),
  "Delia does not answer a Russian greeting naturally",
);
assert(
  client.includes("Привет! Всё хорошо 😄 А у тебя как?") &&
    !client.includes("Что хочешь купить?"),
  "Delia does not answer a short Russian check-in naturally",
);
assert(
  client.includes('topOne: "Лучший вариант ·"') &&
    client.includes('if (finalDigit === 1) return "вариант"'),
  "Delia still renders the Russian one-result label with incorrect plural grammar",
);
assert(
  client.includes("bro|dude|man|there"),
  "A friendly 'hi bro' still falls through to the shopping-scope refusal",
);
assert(
  client.includes("(?:дела|делишки)") && client.includes("здарова"),
  "Russian greeting follow-ups still fall through to the shopping-scope refusal",
);
assert(
  client.includes("item.in_catalog || item.verified_retailer"),
  "Verified retailer API results are rejected by the browser trust gate",
);
const greetingBranch = client.indexOf("const greeting = localGreetingResponse(question)");
const networkBranch = client.indexOf('fetch("/api/shopping-assistant"', greetingBranch);
assert(
  greetingBranch >= 0 && networkBranch > greetingBranch &&
    client.slice(greetingBranch, networkBranch).includes("return;"),
  "A simple greeting is not resolved locally before the shopping request",
);
assert(
  client.includes("image.addEventListener(\"error\", () => {") &&
    client.includes("card.remove();") &&
    client.includes("if (!section.children.length) section.remove();"),
  "A failed product image can still leave a photo-less offer card visible",
);
assert(
  client.includes("item.image_url &&") &&
    client.includes("data-assistant-disclaimer"),
  "Visible offer cards can still render without a product photo or localized composer",
);
assert(
  client.includes('["stores", "actionStores", "Check other stores"]') &&
    client.includes('["similar", "actionSimilar", "Show similar models"]') &&
    client.includes('["retry", "actionRetry", "Search again"]'),
  "A no-match answer no longer offers useful recovery actions",
);
assert(
  client.includes("if (!greeting) return \"\""),
  "Shopping requests that merely begin with a greeting may be intercepted",
);

for (const required of [
  ".assistant-sidebar",
  ".assistant-recommendation-media",
  ".assistant-market-context",
  ".assistant-recommendation.is-web",
  ".assistant-other-offers",
  ".assistant-partial-offers",
  ".assistant-partial-offer",
  ".assistant-comparison",
  ".assistant-comparison-grid",
  ".assistant-comparison-item",
  ".assistant-source-links",
  ".assistant-feedback",
  ".assistant-stop",
  ".ask-delia-button",
]) {
  assert(styles.includes(required), `Delia styles are missing ${required}`);
}

for (const required of [
  "inset: clamp(10px, 1.25vw, 24px)",
  "grid-template-columns: clamp(280px, 19vw, 320px) minmax(0, 1fr)",
  "grid-template-columns: repeat(3, minmax(0, 1fr))",
  '"conversation"',
  '"composer"',
  "font-size: 16px",
  "height: 100dvh",
  "env(safe-area-inset-bottom)",
  "width: clamp(112px, 9vw, 148px)",
  "object-fit: contain",
  "max-height: 100%",
  "repeat(auto-fit, minmax(220px, 1fr))",
  "-webkit-line-clamp: 2",
]) {
  assert(styles.includes(required), `Delia responsive workspace is missing ${required}`);
}

assert(
  !styles.includes("width: min(940px, 100%)"),
  "Delia must not be capped at the old 940px desktop width",
);
assert(
  !client.includes("/product-placeholder.svg"),
  "Delia still renders editorial placeholders as product images",
);
assert(
  !/[—–]/u.test(client),
  "Delia client copy still contains long dashes",
);
assert(
  styles.includes("overflow-x: hidden") &&
    styles.includes("overflow-wrap: anywhere") &&
    styles.includes("max-width: 100%"),
  "Delia workspace is not protected against horizontal overflow",
);
assert(
  client.includes("const responseTr = (_body, key, fallback)") &&
    !client.includes("input.placeholder = responseTr("),
  "A shopper message can still overwrite the site interface language",
);
assert(
  client.includes('az: ["Salam!') && client.includes('return "az";'),
  "The browser chat does not preserve Azerbaijani conversation language",
);
assert(
  !client.includes('createElement("table")'),
  "Delia still renders the clipped desktop comparison table on mobile",
);
assert(
  !panel.includes("Live web result — not yet verified"),
  "Delia still exposes the old alarming web-result label",
);

assert(
  server.includes('app.post("/api/shopping-assistant/feedback"'),
  "Assistant feedback endpoint is missing",
);
assert(
  server.includes("requestController.signal"),
  "Client disconnects are not propagated to the OpenAI request",
);
assert(
  db.includes("shopping_assistant_feedback"),
  "Assistant feedback storage is missing",
);

console.log("Delia history, product tools, feedback, and stop controls passed.");
