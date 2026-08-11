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
  "Live web result",
]) {
  assert(panel.includes(required), `Delia panel is missing ${required}`);
}

for (const required of [
  "odd_delia_chats_v1",
  "MAX_CHATS = 20",
  "titleFromQuestion",
  "renderRecommendations",
  "renderComparison",
  "renderClarifyingQuestions",
  "renderFollowUpActions",
  "setProductContext",
  "toggleSaved",
  "sendFeedback",
  "AbortController",
  "thinkingSearch",
  "liveWeb",
  "otherOffers",
]) {
  assert(client.includes(required), `Delia client is missing ${required}`);
}

for (const required of [
  ".assistant-sidebar",
  ".assistant-recommendation-media",
  ".assistant-recommendation.is-web",
  ".assistant-other-offers",
  ".assistant-comparison",
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
]) {
  assert(styles.includes(required), `Delia responsive workspace is missing ${required}`);
}

assert(
  !styles.includes("width: min(940px, 100%)"),
  "Delia must not be capped at the old 940px desktop width",
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
