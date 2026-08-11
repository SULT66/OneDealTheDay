const { t } = require("./i18n");

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

const CLIENT_COPY_KEYS = [
  "assistant.you",
  "assistant.thinkingSearch",
  "assistant.thinkingPrices",
  "assistant.thinkingCompare",
  "assistant.failed",
  "assistant.timeout",
  "assistant.malformed",
  "assistant.sources",
  "assistant.stop",
  "assistant.stopped",
  "assistant.newChatTitle",
  "assistant.renamePrompt",
  "assistant.deleteConfirm",
  "assistant.clearConfirm",
  "assistant.rename",
  "assistant.delete",
  "assistant.noChats",
  "assistant.noSaved",
  "assistant.actionCompare",
  "assistant.actionCheaper",
  "assistant.actionPremium",
  "assistant.actionNew",
  "assistant.actionStores",
  "assistant.askProduct",
  "assistant.productFit",
  "assistant.productCompare",
  "assistant.productAlternative",
  "assistant.explainScore",
  "assistant.save",
  "assistant.savedLabel",
  "assistant.removeSaved",
  "assistant.checked",
  "assistant.inCatalog",
  "assistant.otherOffers",
  "assistant.feedbackQuestion",
  "assistant.helpful",
  "assistant.notHelpful",
  "assistant.wrongPrice",
  "assistant.feedbackThanks",
  "assistant.comparisonTitle",
  "assistant.bestFor",
  "assistant.strengths",
  "assistant.drawbacks",
  "assistant.delivery",
  "assistant.returns",
  "assistant.score",
  "assistant.rating",
  "assistant.compareSaved",
];

function renderShoppingAssistantPanel(code, language) {
  const prompts = [
    "assistant.promptOne",
    "assistant.promptTwo",
    "assistant.promptThree",
  ]
    .map(
      (key) =>
        `<button type="button" data-assistant-prompt="${esc(t(language, key))}">${esc(t(language, key))}</button>`,
    )
    .join("");
  const clientCopy = Object.fromEntries(
    CLIENT_COPY_KEYS.map((key) => [key.replace("assistant.", ""), t(language, key)]),
  );
  const safeCopy = JSON.stringify(clientCopy).replace(/</g, "\\u003c");

  return `<div id="shoppingAssistantBackdrop" class="assistant-backdrop" hidden></div>
  <aside id="shoppingAssistant" class="shopping-assistant" role="dialog" aria-modal="true" aria-labelledby="shoppingAssistantTitle" hidden data-market="${esc(code)}" data-language="${esc(language)}">
    <script type="application/json" data-assistant-copy>${safeCopy}</script>
    <div class="assistant-layout">
      <aside class="assistant-sidebar" data-assistant-sidebar aria-label="${esc(t(language, "assistant.chats"))}">
        <div class="assistant-sidebar-header"><strong>${esc(t(language, "assistant.chats"))}</strong><div><button type="button" data-assistant-new>+ ${esc(t(language, "assistant.newChat"))}</button><button class="assistant-sidebar-close" type="button" data-assistant-sidebar-close aria-label="${esc(t(language, "assistant.close"))}">×</button></div></div>
        <div class="assistant-history-list" data-assistant-history></div>
        <button class="assistant-clear-history" type="button" data-assistant-clear>${esc(t(language, "assistant.clearHistory"))}</button>
        <section class="assistant-saved-section">
          <div class="assistant-saved-heading"><strong>${esc(t(language, "assistant.saved"))}</strong><button type="button" data-assistant-compare-saved hidden>${esc(t(language, "assistant.compareSaved"))}</button></div>
          <div class="assistant-saved-list" data-assistant-saved></div>
        </section>
      </aside>
      <div class="assistant-main">
        <div class="assistant-header">
          <button class="assistant-sidebar-toggle" type="button" data-assistant-sidebar-toggle aria-label="${esc(t(language, "assistant.historyToggle"))}">☰</button>
          <div class="assistant-title"><span class="assistant-spark" aria-hidden="true">D</span><div><strong id="shoppingAssistantTitle">Delia</strong><small>D.E.L.I.A. · ${esc(t(language, "assistant.subtitle"))}</small></div></div>
          <div class="assistant-header-actions"><button class="assistant-new-mobile" type="button" data-assistant-new aria-label="${esc(t(language, "assistant.newChat"))}">+</button><button class="assistant-close" type="button" data-shopping-assistant-close aria-label="${esc(t(language, "assistant.close"))}">×</button></div>
        </div>
        <div class="assistant-current-chat" data-assistant-current-title>${esc(t(language, "assistant.newChatTitle"))}</div>
        <div class="assistant-product-context" data-assistant-product-context hidden></div>
        <div class="assistant-conversation">
          <div class="assistant-intro"><p>${esc(t(language, "assistant.intro"))}</p><div class="assistant-prompts">${prompts}</div></div>
          <div class="assistant-messages" data-assistant-messages aria-live="polite"></div>
        </div>
        <form class="assistant-form">
          <div class="assistant-input-row"><textarea maxlength="1200" rows="1" required placeholder="${esc(t(language, "assistant.placeholder"))}" aria-label="${esc(t(language, "assistant.placeholder"))}"></textarea><button class="assistant-stop" type="button" data-assistant-stop hidden>${esc(t(language, "assistant.stop"))}</button><button class="assistant-send" type="submit" aria-label="${esc(t(language, "assistant.send"))}">↑</button></div>
          <p class="assistant-disclaimer">${esc(t(language, "assistant.disclaimer"))}</p>
        </form>
      </div>
    </div>
  </aside>`;
}

module.exports = renderShoppingAssistantPanel;
