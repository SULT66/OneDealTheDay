(() => {
  const panel = document.getElementById("shoppingAssistant");
  if (!panel) return;
  const backdrop = document.getElementById("shoppingAssistantBackdrop");
  const closeButton = panel.querySelector("[data-shopping-assistant-close]");
  const form = panel.querySelector("form");
  const input = panel.querySelector("textarea");
  const messagesElement = panel.querySelector("[data-assistant-messages]");
  const productsElement = panel.querySelector("[data-assistant-products]");
  const sourcesElement = panel.querySelector("[data-assistant-sources]");
  const submitButton = form?.querySelector("button[type='submit']");
  const history = [];
  let previousFocus = null;

  const text = (key, fallback) => panel.dataset[key] || fallback;
  const scrollToLatest = () =>
    messagesElement?.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: "smooth",
    });

  function addMessage(role, content, pending = false) {
    const message = document.createElement("div");
    message.className = `assistant-message is-${role}${pending ? " is-pending" : ""}`;
    const label = document.createElement("span");
    label.className = "assistant-message-label";
    label.textContent =
      role === "user" ? text("you", "You") : "OneDailyDrop AI";
    const body = document.createElement("p");
    body.textContent = content;
    message.append(label, body);
    messagesElement.append(message);
    scrollToLatest();
    return message;
  }

  function renderProducts(products = []) {
    productsElement.replaceChildren();
    productsElement.hidden = !products.length;
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
      productsElement.append(card);
    }
  }

  function renderSources(sources = []) {
    sourcesElement.replaceChildren();
    sourcesElement.hidden = !sources.length;
    if (!sources.length) return;
    const label = document.createElement("strong");
    label.textContent = text("sources", "Sources");
    sourcesElement.append(label);
    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
      link.textContent = source.title;
      sourcesElement.append(link);
    }
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
    const priorHistory = history.slice(-8);
    history.push({ role: "user", content: question });
    input.value = "";
    submitButton.disabled = true;
    input.disabled = true;
    renderProducts([]);
    renderSources([]);
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
      pending.querySelector("p").textContent = body.message;
      pending.classList.remove("is-pending");
      history.push({ role: "assistant", content: body.message });
      renderProducts(body.products);
      renderSources(body.sources);
    } catch (error) {
      pending.querySelector("p").textContent =
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
