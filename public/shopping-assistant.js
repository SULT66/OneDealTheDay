(() => {
  const panel = document.getElementById("shoppingAssistant");
  if (!panel) return;
  const backdrop = document.getElementById("shoppingAssistantBackdrop");
  const closeButton = panel.querySelector("[data-shopping-assistant-close]");
  const form = panel.querySelector("form");
  const input = panel.querySelector("textarea");
  const messagesElement = panel.querySelector("[data-assistant-messages]");
  const conversationElement = panel.querySelector(".assistant-conversation");
  const submitButton = form?.querySelector("button[type='submit']");
  const history = [];
  let previousFocus = null;

  const text = (key, fallback) => panel.dataset[key] || fallback;
  const scrollToLatest = () =>
    conversationElement?.scrollTo({
      top: conversationElement.scrollHeight,
      behavior: "smooth",
    });

  function addMessage(role, content, pending = false) {
    const message = document.createElement("div");
    message.className = `assistant-message is-${role}${pending ? " is-pending" : ""}`;
    const label = document.createElement("span");
    label.className = "assistant-message-label";
    label.textContent =
      role === "user" ? text("you", "You") : "OneDailyDrop AI";
    const body = document.createElement("div");
    body.className = "assistant-message-copy";
    body.textContent = content;
    message.append(label, body);
    messagesElement.append(message);
    scrollToLatest();
    return message;
  }

  function renderRecommendations(recommendations = [], host) {
    if (!recommendations.length || !host) return;
    const section = document.createElement("div");
    section.className = "assistant-recommendations";
    recommendations.forEach((recommendation, index) => {
      const card = document.createElement("article");
      card.className = "assistant-recommendation";
      const top = document.createElement("div");
      top.className = "assistant-recommendation-top";
      const rank = document.createElement("span");
      rank.className = "assistant-recommendation-rank";
      rank.textContent = String(index + 1);
      top.append(rank);
      if (recommendation.badge) {
        const badge = document.createElement("span");
        badge.className = "assistant-recommendation-badge";
        badge.textContent = recommendation.badge;
        top.append(badge);
      }
      const title = document.createElement("h3");
      title.textContent = recommendation.title;
      const meta = document.createElement("div");
      meta.className = "assistant-recommendation-meta";
      if (recommendation.price) {
        const price = document.createElement("strong");
        price.textContent = recommendation.price;
        meta.append(price);
      }
      if (recommendation.retailer) {
        const retailer = document.createElement("span");
        retailer.textContent = recommendation.retailer;
        meta.append(retailer);
      }
      const reason = document.createElement("p");
      reason.textContent = recommendation.reason;
      card.append(top, title, meta, reason);
      if (recommendation.url) {
        const link = document.createElement("a");
        link.className = "assistant-recommendation-link";
        link.href = recommendation.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow";
        link.textContent = recommendation.action_label || "View offer";
        const arrow = document.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        link.append(arrow);
        card.append(link);
      }
      section.append(card);
    });
    host.append(section);
  }

  function renderComparison(notes = [], host) {
    if (!notes.length || !host) return;
    const list = document.createElement("ul");
    list.className = "assistant-comparison-notes";
    for (const note of notes) {
      const item = document.createElement("li");
      item.textContent = note;
      list.append(item);
    }
    host.append(list);
  }

  function renderProducts(products = [], host) {
    if (!products.length || !host) return;
    const section = document.createElement("div");
    section.className = "assistant-products";
    for (const product of products) {
      const card = document.createElement("a");
      card.className = "assistant-product";
      card.href = product.url;
      const image = document.createElement("img");
      image.src = product.image_url || "/product-placeholder.svg";
      image.alt = "";
      image.loading = "lazy";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = product.title;
      const meta = document.createElement("small");
      const price =
        product.price == null
          ? ""
          : new Intl.NumberFormat(window.__ODD_LOCALE__ || undefined, {
              style: "currency",
              currency: product.currency || "USD",
            }).format(product.price);
      meta.textContent = [
        price,
        product.score ? `${product.score}/100` : "",
        product.retailer,
      ]
        .filter(Boolean)
        .join(" · ");
      copy.append(title, meta);
      card.append(image, copy);
      section.append(card);
    }
    host.append(section);
  }

  function renderSources(sources = [], host) {
    if (!sources.length || !host) return;
    const section = document.createElement("div");
    section.className = "assistant-sources";
    const label = document.createElement("strong");
    label.textContent = text("sources", "Sources");
    section.append(label);
    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
      link.textContent = source.title;
      section.append(link);
    }
    host.append(section);
  }

  function renderResponse(message, body) {
    const copy = message.querySelector(".assistant-message-copy");
    copy.textContent = body.message || "";
    renderRecommendations(body.recommendations, message);
    renderComparison(body.comparison_notes, message);
    if (!(body.recommendations || []).length) {
      renderProducts(body.products, message);
    }
    if (body.follow_up) {
      const followUp = document.createElement("p");
      followUp.className = "assistant-follow-up";
      followUp.textContent = body.follow_up;
      message.append(followUp);
    }
    renderSources(body.sources, message);
  }

  function openPanel() {
    previousFocus = document.activeElement;
    panel.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("assistant-open");
    requestAnimationFrame(() => {
      panel.classList.add("is-open");
      backdrop.classList.add("is-open");
      input?.focus();
    });
  }

  function closePanel() {
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("assistant-open");
    window.setTimeout(() => {
      panel.hidden = true;
      backdrop.hidden = true;
      previousFocus?.focus?.();
    }, 180);
  }

  document
    .querySelectorAll("[data-shopping-assistant-open]")
    .forEach((button) => button.addEventListener("click", openPanel));
  closeButton?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
    if (event.key !== "Tab" || panel.hidden) return;
    const focusable = [
      ...panel.querySelectorAll(
        'button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),select:not([disabled])',
      ),
    ].filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  panel.querySelectorAll("[data-assistant-prompt]").forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.dataset.assistantPrompt || button.textContent;
      input.focus();
    }),
  );

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || submitButton.disabled) return;
    addMessage("user", question);
    conversationElement?.classList.add("has-conversation");
    const priorHistory = history.slice(-8);
    history.push({ role: "user", content: question });
    input.value = "";
    submitButton.disabled = true;
    input.disabled = true;
    const pending = addMessage(
      "assistant",
      text("thinking", "Comparing options…"),
      true,
    );
    try {
      const response = await fetch("/api/shopping-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          messages: priorHistory,
          market: window.__ODD_MARKET__ || panel.dataset.market || "us",
          language: window.__ODD_LANGUAGE__ || panel.dataset.language || "en",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error ||
            text("failed", "The assistant is unavailable right now."),
        );
      renderResponse(pending, body);
      pending.classList.remove("is-pending");
      const recommendationHistory = (body.recommendations || [])
        .map((item) => `${item.title} — ${item.price} ${item.retailer}`.trim())
        .join("; ");
      if (body.scope === "off_topic") {
        history.pop();
      } else {
        history.push({
          role: "assistant",
          content: [body.message, recommendationHistory]
            .filter(Boolean)
            .join(" ")
            .slice(0, 1200),
        });
      }
    } catch (error) {
      if (
        history.at(-1)?.role === "user" &&
        history.at(-1)?.content === question
      ) {
        history.pop();
      }
      pending.querySelector(".assistant-message-copy").textContent =
        error.message ||
        text("failed", "The assistant is unavailable right now.");
      pending.classList.remove("is-pending");
      pending.classList.add("is-error");
    } finally {
      submitButton.disabled = false;
      input.disabled = false;
      input.focus();
      scrollToLatest();
    }
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
})();
