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
]) {
  assert(client.includes(required), `Delia client is missing ${required}`);
}

for (const required of [
  ".assistant-sidebar",
  ".assistant-recommendation-media",
  ".assistant-comparison",
  ".assistant-feedback",
  ".assistant-stop",
  ".ask-delia-button",
]) {
  assert(styles.includes(required), `Delia styles are missing ${required}`);
}

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
