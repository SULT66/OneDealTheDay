(() => {
  const panel = document.getElementById("shoppingAssistant");
  if (!panel) return;

  const STORAGE_KEY = "odd_delia_chats_v1";
  const ACTIVE_KEY = "odd_delia_active_chat_v1";
  const SAVED_KEY = "odd_delia_saved_products_v1";
  const MAX_CHATS = 20;
  const MAX_MESSAGES_PER_CHAT = 80;
  const REQUEST_TIMEOUT_MS = 33000;
  const backdrop = document.getElementById("shoppingAssistantBackdrop");
  const closeButton = panel.querySelector("[data-shopping-assistant-close]");
  const form = panel.querySelector("form");
  const input = panel.querySelector("textarea");
  const subtitleElement = panel.querySelector("[data-assistant-subtitle]");
  const disclaimerElement = panel.querySelector("[data-assistant-disclaimer]");
  const messagesElement = panel.querySelector("[data-assistant-messages]");
  const conversationElement = panel.querySelector(".assistant-conversation");
  const submitButton = panel.querySelector(".assistant-send");
  const stopButton = panel.querySelector("[data-assistant-stop]");
  const historyElement = panel.querySelector("[data-assistant-history]");
  const savedElement = panel.querySelector("[data-assistant-saved]");
  const compareSavedButton = panel.querySelector(
    "[data-assistant-compare-saved]",
  );
  const currentTitleElement = panel.querySelector(
    "[data-assistant-current-title]",
  );
  const productContextElement = panel.querySelector(
    "[data-assistant-product-context]",
  );
  const sidebar = panel.querySelector("[data-assistant-sidebar]");
  const copy = (() => {
    try {
      return JSON.parse(
        panel.querySelector("[data-assistant-copy]")?.textContent || "{}",
      );
    } catch {
      return {};
    }
  })();

  let previousFocus = null;
  let activeChat = null;
  let chats = readStorage(STORAGE_KEY, []);
  let savedProducts = readStorage(SAVED_KEY, []);
  let requestController = null;
  let loadingTimer = null;
  let requestTimeoutTimer = null;
  let requestTimedOut = false;

  function readStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The chat still works when storage is unavailable or full.
    }
  }

  const tr = (key, fallback) => copy[key] || fallback;
  const LOCAL_GREETING_REPLIES = {
    en: ["Hey! 👋 How are you?", "Hi! 😊 How's it going?", "Hey there! How are things?"],
    ru: ["Привет! 👋 Как дела?", "Здорово! 😄 Как ты?", "Привет-привет! Как настроение?"],
    es: ["¡Hola! 👋 ¿Cómo estás?", "¡Buenas! 😊 ¿Qué tal?"],
    fr: ["Salut ! 👋 Comment ça va ?", "Bonjour ! 😊 Ça va ?"],
    de: ["Hallo! 👋 Wie geht’s?", "Hi! 😊 Wie geht es dir?"],
  };
  const LOCAL_CHECK_IN_REPLIES = {
    en: ["I'm doing well, thanks 😄 How about you?", "All good here! How are you?"],
    ru: ["Привет! Всё хорошо 😄 А у тебя как?", "Всё отлично, спасибо! Как ты?", "Хорошо, спасибо 😊 Как твои дела?"],
    es: ["¡Todo bien, gracias! 😄 ¿Y tú?", "¡Muy bien! ¿Cómo estás tú?"],
    fr: ["Tout va bien, merci ! 😄 Et vous ?", "Très bien, merci ! Et toi ?"],
    de: ["Mir geht’s gut, danke! 😄 Und dir?", "Alles gut! Wie geht es dir?"],
  };
  const stableReply = (replies, seed) => {
    const hash = [...String(seed || "")].reduce(
      (total, character) => total + character.codePointAt(0),
      0,
    );
    return replies[hash % replies.length];
  };
  const localGreetingResponse = (value) => {
    const normalized = String(value || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}'’]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:ну|слушай|эй|ой)\s+/u, "")
      .replace(/\s+(?:бро|брат|друг|делия)$/u, "")
      .trim();
    const greeting = [
      [
        "ru",
        /^(?:(?:привет(?:ик|ики)?|прив|здравствуй(?:те)?|здорово|здорова|здарова|здаров|салют|хай|ку|доброе утро|добрый день|добрый вечер|доброго времени суток)(?:\s+(?:бро|брат|друг|делия))?(?:\s+(?:как (?:у тебя )?(?:дела|делишки)|как (?:ты|сам|сама)|как поживаешь|как жизнь|как настроение|что нового|ч[её] как))?|(?:как (?:у тебя )?(?:дела|делишки)|как (?:ты|сам|сама)|как поживаешь|как жизнь|как настроение|что нового|ч[её] как|дела|делишки))$/u,
        /(?:как (?:у тебя )?(?:дела|делишки)|как (?:ты|сам|сама)|как поживаешь|как жизнь|как настроение|что нового|ч[её] как|дела|делишки)/u,
      ],
      [
        "es",
        /^(?:(?:hola|buenos días|buenas tardes|buenas noches)(?:\s+(?:amigo|bro))?(?:\s+(?:cómo estás|como estas|qué tal|que tal|cómo va|como va))?|(?:cómo estás|como estas|qué tal|que tal|cómo va|como va))$/u,
        /(?:cómo estás|como estas|qué tal|que tal|cómo va|como va)/u,
      ],
      [
        "fr",
        /^(?:(?:bonjour|bonsoir|salut|coucou)(?:\s+(?:ami|frère|bro))?(?:\s+(?:comment ça va|comment ca va|ça va|ca va))?|(?:comment ça va|comment ca va|ça va|ca va))$/u,
        /(?:comment ça va|comment ca va|ça va|ca va)/u,
      ],
      [
        "de",
        /^(?:(?:hallo|guten morgen|guten tag|guten abend)(?:\s+(?:freund|bruder|bro))?(?:\s+(?:wie geht es dir|wie geht['’]?s|wie gehts))?|(?:wie geht es dir|wie geht['’]?s|wie gehts))$/u,
        /(?:wie geht es dir|wie geht['’]?s|wie gehts)/u,
      ],
      [
        "en",
        /^(?:(?:hello|hey|hi|yo|good morning|good afternoon|good evening)(?:\s+(?:bro|dude|man|there))?(?:\s+(?:how are you|how['’]?s it going|what['’]?s up|how are things))?|(?:how are you|how['’]?s it going|what['’]?s up|how are things))$/u,
        /(?:how are you|how['’]?s it going|what['’]?s up|how are things)/u,
      ],
    ].find(([, pattern]) => pattern.test(normalized));
    if (!greeting) return "";
    const [greetingLanguage, , checkInPattern] = greeting;
    if (checkInPattern.test(normalized)) {
      return stableReply(LOCAL_CHECK_IN_REPLIES[greetingLanguage], normalized);
    }
    if (greetingLanguage === "en") {
      const translated = tr("greeting", "");
      if (translated && !/(?:buy|shopping|looking for)/i.test(translated)) {
        return translated;
      }
    }
    return stableReply(LOCAL_GREETING_REPLIES[greetingLanguage], normalized);
  };
  const RESPONSE_LABELS = {
    en: {
      product: "Product", price: "Price", bestFor: "Best for", score: "Score",
      delivery: "Delivery", returns: "Returns", strengths: "Strengths",
      drawbacks: "Watch-outs", comparisonTitle: "Quick comparison",
      sources: "Sources", save: "Save", savedLabel: "Saved",
      askProduct: "Ask Delia", inCatalog: "Verified OneDailyDrop product",
      productFit: "Is it right for me?", productCompare: "Compare",
      productAlternative: "Find an alternative", explainScore: "Explain the Score",
      checked: "Price checked", otherOffers: "Other offers", viewDetails: "View product",
      actionCompare: "Compare these products", actionCheaper: "Find cheaper options",
      actionPremium: "Show premium options", actionNew: "Only new products",
      actionStores: "Check other stores", feedbackQuestion: "Was this useful?",
      helpful: "Helpful", notHelpful: "Not helpful", wrongPrice: "Price is wrong",
      feedbackThanks: "Thanks — your feedback was recorded.",
      partialTitle: "Current product pages", partialStatus: "Confirm current price and availability with the retailer",
      checkPrice: "Check live price", viewOffer: "Open retailer page",
      topThree: "Top 3 in", topOne: "Top option in", topOptions: "Top options in", option: "option", options: "options",
      actionSimilar: "Show similar models", actionRetry: "Search again",
      you: "You", placeholder: "What are you shopping for?",
      disclaimer: "Prices and availability can change. Confirm final details with the retailer.",
      subtitle: "Your OneDailyDrop shopping assistant",
      totalPrice: "Total delivered", comparisonReady: "I compared the products already shown — no new search needed.",
      noNewStores: "I couldn't find any new matching offers in other stores yet.",
      positionBestOverall: "Best overall", positionLowestPrice: "Lowest price", positionAlternative: "Alternative",
      availability: "Availability", pack: "Pack", sizes: "Sizes",
    },
    ru: {
      product: "Товар", price: "Цена", bestFor: "Лучше для", score: "Оценка",
      delivery: "Доставка", returns: "Возврат", strengths: "Плюсы",
      drawbacks: "Ограничения", comparisonTitle: "Короткое сравнение",
      sources: "Источники", save: "Сохранить", savedLabel: "Сохранено",
      askProduct: "Спросить Delia", inCatalog: "Проверенный товар OneDailyDrop",
      productFit: "Подойдёт ли мне?", productCompare: "Сравнить",
      productAlternative: "Найти альтернативу", explainScore: "Объяснить оценку",
      checked: "Цена проверена", otherOffers: "Другие предложения", viewDetails: "Открыть товар",
      actionCompare: "Сравнить эти товары", actionCheaper: "Найти дешевле",
      actionPremium: "Показать премиум-варианты", actionNew: "Только новые товары",
      actionStores: "Проверить другие магазины", feedbackQuestion: "Ответ был полезен?",
      helpful: "Полезно", notHelpful: "Не помогло", wrongPrice: "Цена неверна",
      feedbackThanks: "Спасибо — отзыв сохранён.",
      partialTitle: "Актуальные товарные страницы", partialStatus: "Уточните текущую цену и наличие у магазина",
      checkPrice: "Проверить цену", viewOffer: "Открыть страницу магазина",
      topThree: "Топ-3 ·", topOne: "Лучший вариант ·", topOptions: "Лучшие варианты ·", option: "вариант", options: "варианты",
      actionSimilar: "Показать похожие модели", actionRetry: "Повторить поиск",
      you: "Вы", placeholder: "Что хотите купить?",
      disclaimer: "Цена и наличие могут измениться. Проверьте итоговые условия у магазина.",
      subtitle: "Ваш помощник по покупкам OneDailyDrop",
      totalPrice: "Итого с доставкой", comparisonReady: "Сравнила уже найденные варианты — повторный поиск не нужен.",
      noNewStores: "Новых подходящих предложений в других магазинах пока не найдено.",
      positionBestOverall: "Лучший выбор", positionLowestPrice: "Самая низкая цена", positionAlternative: "Альтернатива",
      availability: "Наличие", pack: "В упаковке", sizes: "Размеры",
    },
    es: {
      product: "Producto", price: "Precio", bestFor: "Ideal para", score: "Puntuación",
      delivery: "Entrega", returns: "Devoluciones", strengths: "Ventajas",
      drawbacks: "A tener en cuenta", comparisonTitle: "Comparación rápida",
      sources: "Fuentes", save: "Guardar", savedLabel: "Guardado",
      askProduct: "Preguntar a Delia", inCatalog: "Producto verificado por OneDailyDrop",
      productFit: "¿Es adecuado para mí?", productCompare: "Comparar",
      productAlternative: "Buscar una alternativa", explainScore: "Explicar la puntuación",
      checked: "Precio comprobado", otherOffers: "Otras ofertas", viewDetails: "Ver producto",
      actionCompare: "Comparar estos productos", actionCheaper: "Buscar opciones más baratas",
      actionPremium: "Ver opciones premium", actionNew: "Solo productos nuevos",
      actionStores: "Comprobar otras tiendas", feedbackQuestion: "¿Te sirvió?",
      helpful: "Útil", notHelpful: "No fue útil", wrongPrice: "El precio es incorrecto",
      feedbackThanks: "Gracias, guardamos tu opinión.",
      partialTitle: "Páginas de producto actuales", partialStatus: "Confirma el precio y la disponibilidad con la tienda",
      checkPrice: "Comprobar precio", viewOffer: "Abrir página de la tienda",
      topThree: "Top 3 ·", topOne: "Mejor opción ·", topOptions: "Mejores opciones ·", option: "opción", options: "opciones",
      actionSimilar: "Ver modelos similares", actionRetry: "Buscar de nuevo",
      you: "Tú", placeholder: "¿Qué quieres comprar?",
      disclaimer: "El precio y la disponibilidad pueden cambiar. Confirma los detalles con la tienda.",
      positionBestOverall: "Mejor opción", positionLowestPrice: "Precio más bajo", positionAlternative: "Alternativa",
      availability: "Disponibilidad", pack: "Paquete", sizes: "Tallas",
    },
    fr: {
      product: "Produit", price: "Prix", bestFor: "Idéal pour", score: "Score",
      delivery: "Livraison", returns: "Retours", strengths: "Points forts",
      drawbacks: "À surveiller", comparisonTitle: "Comparaison rapide",
      sources: "Sources", save: "Enregistrer", savedLabel: "Enregistré",
      askProduct: "Demander à Delia", inCatalog: "Produit vérifié par OneDailyDrop",
      productFit: "Est-il adapté pour moi ?", productCompare: "Comparer",
      productAlternative: "Trouver une alternative", explainScore: "Expliquer le score",
      checked: "Prix vérifié", otherOffers: "Autres offres", viewDetails: "Voir le produit",
      actionCompare: "Comparer ces produits", actionCheaper: "Trouver moins cher",
      actionPremium: "Voir les options premium", actionNew: "Produits neufs uniquement",
      actionStores: "Vérifier d’autres magasins", feedbackQuestion: "Est-ce utile ?",
      helpful: "Utile", notHelpful: "Pas utile", wrongPrice: "Le prix est incorrect",
      feedbackThanks: "Merci, votre avis a été enregistré.",
      partialTitle: "Pages produit actuelles", partialStatus: "Confirmez le prix et la disponibilité auprès du vendeur",
      checkPrice: "Vérifier le prix", viewOffer: "Ouvrir la page du vendeur",
      topThree: "Top 3 ·", topOne: "Meilleure option ·", topOptions: "Meilleures options ·", option: "option", options: "options",
      actionSimilar: "Voir des modèles similaires", actionRetry: "Relancer la recherche",
      you: "Vous", placeholder: "Que souhaitez-vous acheter ?",
      disclaimer: "Le prix et la disponibilité peuvent changer. Confirmez les détails auprès du vendeur.",
      positionBestOverall: "Meilleur choix", positionLowestPrice: "Prix le plus bas", positionAlternative: "Alternative",
      availability: "Disponibilité", pack: "Lot", sizes: "Tailles",
    },
    de: {
      product: "Produkt", price: "Preis", bestFor: "Am besten für", score: "Bewertung",
      delivery: "Lieferung", returns: "Rückgabe", strengths: "Stärken",
      drawbacks: "Zu beachten", comparisonTitle: "Kurzer Vergleich",
      sources: "Quellen", save: "Speichern", savedLabel: "Gespeichert",
      askProduct: "Delia fragen", inCatalog: "Von OneDailyDrop geprüftes Produkt",
      productFit: "Passt es zu mir?", productCompare: "Vergleichen",
      productAlternative: "Alternative finden", explainScore: "Bewertung erklären",
      checked: "Preis geprüft", otherOffers: "Weitere Angebote", viewDetails: "Produkt öffnen",
      actionCompare: "Diese Produkte vergleichen", actionCheaper: "Günstigere Optionen finden",
      actionPremium: "Premium-Optionen zeigen", actionNew: "Nur neue Produkte",
      actionStores: "Andere Händler prüfen", feedbackQuestion: "War das hilfreich?",
      helpful: "Hilfreich", notHelpful: "Nicht hilfreich", wrongPrice: "Preis ist falsch",
      feedbackThanks: "Danke, Ihr Feedback wurde gespeichert.",
      partialTitle: "Aktuelle Produktseiten", partialStatus: "Preis und Verfügbarkeit beim Händler bestätigen",
      checkPrice: "Aktuellen Preis prüfen", viewOffer: "Händlerseite öffnen",
      topThree: "Top 3 ·", topOne: "Beste Option ·", topOptions: "Beste Optionen ·", option: "Option", options: "Optionen",
      actionSimilar: "Ähnliche Modelle zeigen", actionRetry: "Erneut suchen",
      you: "Sie", placeholder: "Was möchten Sie kaufen?",
      disclaimer: "Preis und Verfügbarkeit können sich ändern. Prüfen Sie die endgültigen Angaben beim Händler.",
      positionBestOverall: "Beste Wahl", positionLowestPrice: "Niedrigster Preis", positionAlternative: "Alternative",
      availability: "Verfügbarkeit", pack: "Packung", sizes: "Größen",
    },
  };
  const responseLanguage = (body = {}) => {
    const selected = String(body.language || "").toLowerCase();
    if (RESPONSE_LABELS[selected]) return selected;
    return /[\u0400-\u04ff]/u.test(String(body.message || "")) ? "ru" : language();
  };
  const responseTr = (body, key, fallback) =>
    RESPONSE_LABELS[responseLanguage(body)]?.[key] || fallback;
  const responseOptionCountLabel = (body, count) => {
    const selectedLanguage = responseLanguage(body);
    if (selectedLanguage === "ru") {
      const finalTwoDigits = count % 100;
      if (finalTwoDigits >= 11 && finalTwoDigits <= 14) return "вариантов";
      const finalDigit = count % 10;
      if (finalDigit === 1) return "вариант";
      if (finalDigit >= 2 && finalDigit <= 4) return "варианта";
      return "вариантов";
    }
    return responseTr(
      body,
      count === 1 ? "option" : "options",
      count === 1 ? "option" : "options",
    );
  };
  const messageLanguage = (value) =>
    /[\u0400-\u04ff]/u.test(String(value || "")) ? "ru" : language();
  function updateConversationLocale(body = {}) {
    const selectedLanguage = responseLanguage(body);
    const localizedBody = { language: selectedLanguage };
    input.placeholder = responseTr(
      localizedBody,
      "placeholder",
      tr("placeholder", "What are you shopping for?"),
    );
    if (disclaimerElement) {
      disclaimerElement.textContent = responseTr(
        localizedBody,
        "disclaimer",
        tr(
          "disclaimer",
          "Prices and availability can change. Confirm final details with the retailer.",
        ),
      );
    }
    if (subtitleElement) {
      subtitleElement.textContent = `D.E.L.I.A. · ${responseTr(
        localizedBody,
        "subtitle",
        tr("subtitle", "Your OneDailyDrop shopping assistant"),
      )}`;
    }
    panel.dataset.conversationLanguage = selectedLanguage;
    messagesElement
      .querySelectorAll(".assistant-message.is-user .assistant-message-label")
      .forEach((label) => {
        label.textContent = responseTr(localizedBody, "you", "You");
      });
  }
  const looksLikeSerializedPayload = (value) => {
    const text = String(value || "").trim();
    return (
      /^[\[{]/.test(text) ||
      /^```(?:json)?/i.test(text) ||
      /"(?:answer|message|recommendations|comparison_notes)"\s*:/i.test(text)
    );
  };
  const recoverEmbeddedAnswer = (value) => {
    let parsed = String(value || "").trim();
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof parsed !== "string" || !looksLikeSerializedPayload(parsed)) break;
      try {
        parsed = JSON.parse(
          parsed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
        );
      } catch {
        return "";
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    const answer = String(parsed.answer || parsed.message || "").trim();
    return answer && !looksLikeSerializedPayload(answer) ? answer.slice(0, 700) : "";
  };
  const safeBrowserUrl = (value) => {
    const raw = String(value || "").trim();
    if (/^\/(?!\/)/.test(raw)) return raw;
    try {
      const url = new URL(raw, window.location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const hasDisplayPrice = (value) =>
    /(?:[$€£¥]\s*\d|\d[\d\s,.]*\s*[$€£¥]|\d[\d\s,.]*\s*(?:USD|CAD|GBP|EUR|AUD)\b)/i.test(
      String(value || ""),
    );
  const hasSpecificProductIdentity = (value) =>
    /[a-z]/i.test(String(value || "")) && /\d/.test(String(value || ""));
  const isDirectProductPage = (value) => {
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== "https:") return false;
      const path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, "");
      if (!path || path === "/") return false;
      if (/(?:^|\/)(?:search|browse|category|categories|collection|collections|department|departments|results)(?:\/|$)/i.test(path)) return false;
      if (/\b(?:search|query|keyword|category)\b/i.test(url.search)) return false;
      if (/pcmcat/i.test(path) || /pcmcat/i.test(url.search)) return false;
      if (/\/(?:ip|p|product|products|dp|itm)\//i.test(path) || /\/site\/[^/]+\/[^/]+\.p$/i.test(path) || /\/shop\/buy-[^/]+\//i.test(path) || (/(?:^|\/)buy(?:\/|$)/i.test(path) && /\d/.test(path))) return true;
      return false;
    } catch {
      return false;
    }
  };
  const isEditorialProductPage = (title, value) => {
    try {
      const url = new URL(value, window.location.href);
      return (
        /(?:^|\.)(?:cnet|esquire|pcmag|reddit|techradar|theverge|tistory|tomsguide|wired|youtube)\./i.test(
          url.hostname,
        ) ||
        /\/(?:article|blog|guide|news|review)s?(?:\/|$)/i.test(url.pathname) ||
        /\b(?:hands-on|launch|news|review|rumou?r|shopping guide)\b/i.test(
          String(title || ""),
        )
      );
    } catch {
      return true;
    }
  };
  const numericAmount = (value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const shippingCostFromText = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/(?:\bfree\s+(?:shipping|delivery)\b|бесплатн\p{L}*\s+доставк\p{L}*)/iu.test(text)) {
      return 0;
    }
    const amount = text.match(
      /(?:USD|CAD|GBP|EUR|AUD|[$€£])\s*([\d]+(?:[.,]\d{1,2})?)\s*(?:shipping|delivery|доставк\p{L}*)/iu,
    );
    return amount ? numericAmount(String(amount[1]).replace(",", ".")) : null;
  };
  const totalDelivered = (item = {}) => {
    const explicit = numericAmount(item.total_price ?? item.landed_cost);
    if (explicit != null) return explicit;
    const base = numericAmount(item.price_value);
    if (base == null) return null;
    const explicitShipping = numericAmount(item.shipping_cost);
    const shipping = explicitShipping == null
      ? shippingCostFromText(item.delivery)
      : explicitShipping;
    return shipping == null ? base : base + Math.max(0, shipping);
  };
  const normalizeShoppingMission = (value) => {
    const mission = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    return {
      product_type: String(mission.product_type || "").slice(0, 60),
      brands: (Array.isArray(mission.brands) ? mission.brands : [])
        .map((item) => String(item || "").slice(0, 40))
        .filter(Boolean)
        .slice(0, 4),
      use_case: String(mission.use_case || "").slice(0, 100),
      season: String(mission.season || "").slice(0, 30),
      style: String(mission.style || "").slice(0, 60),
      audience: String(mission.audience || "").slice(0, 30),
      size: String(mission.size || "").slice(0, 20),
      market: String(mission.market || "").slice(0, 10),
      preferred_retailer: String(mission.preferred_retailer || "").slice(0, 50),
      budget_max: Math.max(0, Number(mission.budget_max) || 0),
      query_terms: (Array.isArray(mission.query_terms) ? mission.query_terms : [])
        .map((item) => String(item || "").slice(0, 60))
        .filter(Boolean)
        .slice(0, 6),
    };
  };
  function normalizeResponseBody(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        message: tr("failed", "The assistant is unavailable right now."),
        follow_up: "",
        recommendations: [],
        partial_offers: [],
        comparison_notes: [],
        comparison: [],
        products: [],
        sources: [],
        clarifying_questions: [],
        needs_clarification: false,
        scope: "shopping",
      };
    }
    const rawMessage = String(value.message || "").trim();
    const recovered = looksLikeSerializedPayload(rawMessage)
      ? recoverEmbeddedAnswer(rawMessage)
      : rawMessage;
    const message = recovered ||
      (looksLikeSerializedPayload(rawMessage)
        ? tr(
            "malformed",
            "I found results, but could not safely format the comparison. Please try again.",
          )
        : "");
    return {
      ...value,
      language: RESPONSE_LABELS[String(value.language || "").toLowerCase()]
        ? String(value.language).toLowerCase()
        : /[\u0400-\u04ff]/u.test(message)
          ? "ru"
          : language(),
      message: String(message).slice(0, 700),
      conversation_title: String(value.conversation_title || "").slice(0, 60),
      resolved_request: String(value.resolved_request || "").slice(0, 1200),
      shopping_mission: normalizeShoppingMission(value.shopping_mission),
      follow_up: String(value.follow_up || "").slice(0, 240),
      recommendations: (Array.isArray(value.recommendations)
        ? value.recommendations
        : []
      )
        .filter((item) => item && typeof item === "object")
        .slice(0, 3)
        .map((item) => {
          const priceValue = numericAmount(item.price_value);
          const shippingCost = numericAmount(item.shipping_cost) ??
            shippingCostFromText(item.delivery);
          const totalPrice = totalDelivered({
            ...item,
            price_value: priceValue,
            shipping_cost: shippingCost,
          });
          return {
            ...item,
            price_value: priceValue,
            shipping_cost: shippingCost,
            total_price: totalPrice,
            url: safeBrowserUrl(item.url),
            image_url: safeBrowserUrl(item.image_url),
            position_role: ["best_overall", "lowest_price", "alternative"].includes(
              item.position_role,
            )
              ? item.position_role
              : "alternative",
            availability: String(item.availability || "").slice(0, 100),
            available_sizes: (Array.isArray(item.available_sizes)
              ? item.available_sizes
              : [])
              .map((size) => String(size).slice(0, 20))
              .filter(Boolean)
              .slice(0, 8),
            pack_count:
              Number.isInteger(Number(item.pack_count)) && Number(item.pack_count) > 1
                ? Number(item.pack_count)
                : null,
            badge: "",
            other_offers: (Array.isArray(item.other_offers)
              ? item.other_offers
              : []
            )
              .filter((offer) => offer && typeof offer === "object")
              .map((offer) => ({ ...offer, url: safeBrowserUrl(offer.url) }))
              .filter((offer) => offer.url)
              .slice(0, 2),
          };
        })
        .filter((item) => {
          const hasPrice =
            item.price_value != null || hasDisplayPrice(item.price);
          if (!item.title || !item.reason || !item.url || !item.image_url || !hasPrice)
            return false;
          if (item.in_catalog || item.verified_retailer) return true;
          return (
            hasSpecificProductIdentity(item.title) &&
            isDirectProductPage(item.url) &&
            !isEditorialProductPage(item.title, item.url)
          );
        }),
      partial_offers: (Array.isArray(value.partial_offers)
        ? value.partial_offers
        : []
      )
        .filter((item) => item && typeof item === "object")
        .slice(0, 3)
        .map((item) => ({
          ...item,
          url: safeBrowserUrl(item.url),
          image_url: safeBrowserUrl(item.image_url),
          price: hasDisplayPrice(item.price) ? String(item.price).slice(0, 40) : "",
          badge: "",
          evidence_level: "partial",
        }))
        .filter(
          (item) =>
            item.title &&
            item.retailer &&
            item.reason &&
            item.url &&
            item.image_url &&
            hasSpecificProductIdentity(item.title) &&
            isDirectProductPage(item.url) &&
            !isEditorialProductPage(item.title, item.url),
        ),
      comparison_notes: Array.isArray(value.comparison_notes)
        ? value.comparison_notes.slice(0, 4)
        : [],
      comparison: Array.isArray(value.comparison)
        ? value.comparison.slice(0, 4)
        : [],
      products: (Array.isArray(value.products) ? value.products : [])
        .filter((item) => item && typeof item === "object")
        .slice(0, 6)
        .map((item) => ({
          ...item,
          url: safeBrowserUrl(item.url),
          image_url: safeBrowserUrl(item.image_url),
        })),
      sources: (Array.isArray(value.sources) ? value.sources : [])
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ ...item, url: safeBrowserUrl(item.url) }))
        .filter((item) => item.url)
        .slice(0, 6),
      clarifying_questions: Array.isArray(value.clarifying_questions)
        ? value.clarifying_questions.slice(0, 3)
        : [],
    };
  }
  const makeId = () =>
    window.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const market = () => window.__ODD_MARKET__ || panel.dataset.market || "us";
  const language = () =>
    window.__ODD_LANGUAGE__ || panel.dataset.language || "en";
  const scrollToLatest = () =>
    conversationElement?.scrollTo({
      top: conversationElement.scrollHeight,
      behavior: "smooth",
    });

  function createDraftChat() {
    return {
      id: makeId(),
      title: tr("newChatTitle", "New shopping chat"),
      messages: [],
      shopping_context: "",
      shopping_mission: normalizeShoppingMission(null),
      conversation_language: language(),
      market: market(),
      language: language(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      draft: true,
    };
  }

  function normalizedChats() {
    return chats
      .filter((chat) => chat && chat.id && Array.isArray(chat.messages))
      .sort(
        (left, right) =>
          new Date(right.updated_at || 0) - new Date(left.updated_at || 0),
      )
      .slice(0, MAX_CHATS);
  }

  function persistChats() {
    activeChat.updated_at = new Date().toISOString();
    activeChat.messages = activeChat.messages.slice(-MAX_MESSAGES_PER_CHAT);
    const index = chats.findIndex((chat) => chat.id === activeChat.id);
    if (index >= 0) chats[index] = activeChat;
    else if (!activeChat.draft || activeChat.messages.length) chats.unshift(activeChat);
    chats = normalizedChats();
    writeStorage(STORAGE_KEY, chats);
    try {
      localStorage.setItem(ACTIVE_KEY, activeChat.id);
    } catch {}
    renderHistory();
  }

  function titleFromQuestion(question) {
    const words = String(question || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 8)
      .join(" ");
    return words.length > 48 ? `${words.slice(0, 45).trim()}…` : words;
  }

  function setActiveChat(chat) {
    activeChat = chat || createDraftChat();
    activeChat.shopping_context = String(activeChat.shopping_context || "").slice(
      0,
      1200,
    );
    activeChat.shopping_mission = normalizeShoppingMission(activeChat.shopping_mission);
    activeChat.conversation_language =
      RESPONSE_LABELS[activeChat.conversation_language]
        ? activeChat.conversation_language
        : activeChat.language || language();
    updateConversationLocale({ language: activeChat.conversation_language });
    productContextElement.hidden = true;
    productContextElement.replaceChildren();
    messagesElement.replaceChildren();
    for (const record of activeChat.messages) renderRecord(record);
    conversationElement.classList.toggle(
      "has-conversation",
      activeChat.messages.length > 0,
    );
    currentTitleElement.textContent = activeChat.title;
    try {
      localStorage.setItem(ACTIVE_KEY, activeChat.id);
    } catch {}
    renderHistory();
    closeSidebarOnMobile();
    scrollToLatest();
  }

  function newChat() {
    if (requestController) requestController.abort();
    setActiveChat(createDraftChat());
    input.value = "";
    input.focus();
  }

  function renameChat(chat) {
    const title = window.prompt(
      tr("renamePrompt", "Rename this chat"),
      chat.title,
    );
    if (!title?.trim()) return;
    chat.title = title.trim().slice(0, 60);
    if (chat.id === activeChat.id) currentTitleElement.textContent = chat.title;
    persistChats();
  }

  function deleteChat(chat) {
    if (!window.confirm(tr("deleteConfirm", "Delete this chat?"))) return;
    chats = chats.filter((item) => item.id !== chat.id);
    writeStorage(STORAGE_KEY, chats);
    if (chat.id === activeChat.id) setActiveChat(chats[0] || createDraftChat());
    else renderHistory();
  }

  function clearHistory() {
    if (!window.confirm(tr("clearConfirm", "Delete all locally saved chats?")))
      return;
    chats = [];
    writeStorage(STORAGE_KEY, chats);
    setActiveChat(createDraftChat());
  }

  function renderHistory() {
    historyElement.replaceChildren();
    const visible = normalizedChats().filter((chat) => chat.messages.length);
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "assistant-sidebar-empty";
      empty.textContent = tr(
        "noChats",
        "Your recent shopping chats will appear here.",
      );
      historyElement.append(empty);
      return;
    }
    for (const chat of visible) {
      const row = document.createElement("div");
      row.className = `assistant-history-item${chat.id === activeChat.id ? " is-active" : ""}`;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "assistant-history-open";
      const title = document.createElement("strong");
      title.textContent = chat.title;
      const date = document.createElement("small");
      date.textContent = new Date(chat.updated_at).toLocaleDateString();
      open.append(title, date);
      open.addEventListener("click", () => setActiveChat(chat));
      const actions = document.createElement("span");
      actions.className = "assistant-history-actions";
      const rename = document.createElement("button");
      rename.type = "button";
      rename.textContent = "✎";
      rename.title = tr("rename", "Rename");
      rename.setAttribute("aria-label", tr("rename", "Rename"));
      rename.addEventListener("click", () => renameChat(chat));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = tr("delete", "Delete");
      remove.setAttribute("aria-label", tr("delete", "Delete"));
      remove.addEventListener("click", () => deleteChat(chat));
      actions.append(rename, remove);
      row.append(open, actions);
      historyElement.append(row);
    }
  }

  function money(value, currency = "USD") {
    if (value == null || value === "") return "";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return String(value);
    try {
      return new Intl.NumberFormat(window.__ODD_LOCALE__ || undefined, {
        style: "currency",
        currency: currency || "USD",
        currencyDisplay: "code",
      }).format(numericValue);
    } catch {
      return `${currency || ""} ${value}`.trim();
    }
  }

  function localizeRetailerFact(value, type, body = {}) {
    const raw = String(value || "").trim();
    if (!raw || responseLanguage(body) !== "ru") return raw;
    if (type === "availability") {
      const availability = {
        "in stock": "В наличии",
        "out of stock": "Нет в наличии",
        "limited stock": "Ограниченное наличие",
        available: "В наличии",
      };
      return availability[raw.toLowerCase()] || raw;
    }
    if (type === "delivery") {
      const free = raw.match(/^free\s+(?:shipping|delivery)(?:\s+via\s+(.+))?$/i);
      if (free) return `Бесплатная доставка${free[1] ? ` · ${free[1]}` : ""}`;
      const paid = raw.match(/^((?:USD|CAD|GBP|EUR|AUD|[$€£])\s*[\d.,]+)\s+(?:shipping|delivery)(?:\s+via\s+(.+))?$/i);
      if (paid) return `Доставка ${paid[1]}${paid[2] ? ` · ${paid[2]}` : ""}`;
      if (/^home delivery available$/i.test(raw)) return "Доступна доставка домой";
      if (/^delivery options shown at checkout$/i.test(raw)) return "Варианты доставки при оформлении";
      if (/^standard home delivery$/i.test(raw)) return "Стандартная доставка домой";
      return raw;
    }
    if (type === "returns") {
      const calendarDays = raw.match(/^(\d+)\s+calendar days(?:,\s*seller-paid return shipping)?$/i);
      if (calendarDays) {
        return `${calendarDays[1]} дней${/seller-paid/i.test(raw) ? " · обратную доставку оплачивает продавец" : ""}`;
      }
      const accepted = raw.match(/^returns accepted within\s+(\d+)\s+days?$/i);
      if (accepted) return `Возврат в течение ${accepted[1]} дней`;
    }
    return raw;
  }

  function productKey(product) {
    return String(product.catalog_product_id || product.id || product.url || "");
  }

  function isSaved(product) {
    const key = productKey(product);
    return Boolean(key && savedProducts.some((item) => productKey(item) === key));
  }

  function toggleSaved(product) {
    const key = productKey(product);
    if (!key) return;
    if (isSaved(product)) {
      savedProducts = savedProducts.filter((item) => productKey(item) !== key);
    } else {
      savedProducts.unshift({
        catalog_product_id: product.catalog_product_id || product.id || 0,
        title: product.title,
        retailer: product.retailer || "",
        price_value: product.price_value ?? product.price ?? null,
        shipping_cost: product.shipping_cost ?? null,
        total_price: product.total_price ?? totalDelivered(product),
        currency: product.currency || "USD",
        reason: product.reason || "",
        availability: product.availability || "",
        delivery: product.delivery || "",
        returns: product.returns || "",
        image_url: product.image_url || "",
        url: product.url || "",
        score: product.score ?? null,
        response_language: product.response_language || language(),
        saved_at: new Date().toISOString(),
      });
      savedProducts = savedProducts.slice(0, 50);
    }
    writeStorage(SAVED_KEY, savedProducts);
    renderSavedProducts();
    document.querySelectorAll("[data-save-product]").forEach((button) => {
      if (button.dataset.saveProduct !== key) return;
      const saved = isSaved(product);
      button.classList.toggle("is-saved", saved);
      button.textContent = saved
        ? `♥ ${button.dataset.savedLabel || tr("savedLabel", "Saved")}`
        : `♡ ${button.dataset.saveLabel || tr("save", "Save")}`;
    });
  }

  function renderSavedProducts() {
    savedElement.replaceChildren();
    compareSavedButton.hidden = savedProducts.length < 2;
    if (!savedProducts.length) {
      const empty = document.createElement("p");
      empty.className = "assistant-sidebar-empty";
      empty.textContent = tr(
        "noSaved",
        "Save products from Delia's recommendations to compare later.",
      );
      savedElement.append(empty);
      return;
    }
    for (const product of savedProducts) {
      const row = document.createElement("article");
      row.className = "assistant-saved-item";
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      if (product.image_url) {
        image.src = product.image_url;
        image.addEventListener(
          "error",
          () => {
            image.remove();
            row.classList.add("is-image-missing");
          },
          { once: true },
        );
      } else {
        image.hidden = true;
        row.classList.add("is-image-missing");
      }
      const copyElement = document.createElement("button");
      copyElement.type = "button";
      copyElement.className = "assistant-saved-open";
      const title = document.createElement("strong");
      title.textContent = product.title;
      const meta = document.createElement("small");
      meta.textContent = [
        money(product.price_value, product.currency),
        product.retailer,
      ]
        .filter(Boolean)
        .join(" · ");
      copyElement.append(title, meta);
      copyElement.addEventListener("click", () => {
        setProductContext(product);
        closeSidebarOnMobile();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "assistant-saved-remove";
      remove.textContent = "×";
      remove.setAttribute(
        "aria-label",
        tr("removeSaved", "Remove saved product"),
      );
      remove.addEventListener("click", () => toggleSaved(product));
      row.append(image, copyElement, remove);
      savedElement.append(row);
    }
  }

  function addMessage(role, content, pending = false) {
    const message = document.createElement("div");
    message.className = `assistant-message is-${role}${pending ? " is-pending" : ""}`;
    const label = document.createElement("span");
    label.className = "assistant-message-label";
    label.textContent =
      role === "user"
        ? responseTr({ language: messageLanguage(content) }, "you", "You")
        : "Delia";
    const body = document.createElement("div");
    body.className = "assistant-message-copy";
    body.textContent = content;
    message.append(label, body);
    messagesElement.append(message);
    scrollToLatest();
    return message;
  }

  function createButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function askProductPrompt(action, product) {
    const title = product.title;
    const id = product.catalog_product_id || product.id;
    const reference = `${title}${id ? ` (OneDailyDrop product #${id})` : product.url ? ` (${product.url})` : ""}`;
    const productBody = { language: product.response_language || language() };
    const prompts = {
      fit: `${responseTr(productBody, "productFit", "Is it right for me?")} ${reference}`,
      compare: `${responseTr(productBody, "productCompare", "Compare")} ${reference}`,
      alternative: `${responseTr(productBody, "productAlternative", "Find an alternative")} ${reference}`,
      score: `${responseTr(productBody, "explainScore", "Explain the Score")} ${reference}`,
    };
    return prompts[action] || prompts.fit;
  }

  function setProductContext(product) {
    const productBody = { language: product.response_language || language() };
    productContextElement.replaceChildren();
    const top = document.createElement("div");
    const label = document.createElement("small");
    label.textContent = responseTr(productBody, "askProduct", "Ask Delia");
    const title = document.createElement("strong");
    title.textContent = product.title;
    top.append(label, title);
    const actions = document.createElement("div");
    actions.className = "assistant-product-context-actions";
    const contextActions = [
      ["fit", responseTr(productBody, "productFit", "Is it right for me?")],
      ["compare", responseTr(productBody, "productCompare", "Compare")],
      ["alternative", responseTr(productBody, "productAlternative", "Find an alternative")],
    ];
    if (product.catalog_product_id || product.id || product.in_catalog) {
      contextActions.push([
        "score",
        responseTr(productBody, "explainScore", "Explain the Score"),
      ]);
    }
    for (const [action, labelText] of contextActions) {
      actions.append(
        createButton(labelText, "assistant-context-action", () => {
          sendQuestion(askProductPrompt(action, product));
          productContextElement.hidden = true;
        }),
      );
    }
    const close = createButton("×", "assistant-context-close", () => {
      productContextElement.hidden = true;
    });
    productContextElement.append(top, actions, close);
    productContextElement.hidden = false;
    openPanel();
  }

  function renderMarketContext(body, host) {
    const count = (body.recommendations || []).length +
      (body.partial_offers || []).length;
    if (!host || !count || !body.market_name || !body.currency) return;
    const context = document.createElement("div");
    context.className = "assistant-market-context";
    const title = document.createElement("strong");
    const titleKey = count === 3 ? "topThree" : count === 1 ? "topOne" : "topOptions";
    const titleFallback = count === 3 ? "Top 3 in" : count === 1 ? "Top option in" : "Top options in";
    title.textContent = `${responseTr(body, titleKey, titleFallback)} ${body.market_name}`;
    const details = document.createElement("span");
    details.textContent = `${body.currency} · ${count} ${responseOptionCountLabel(body, count)}`;
    context.append(title, details);
    host.append(context);
  }

  function renderRecommendations(recommendations = [], host, responseBody = {}) {
    if (!recommendations.length || !host) return;
    const section = document.createElement("div");
    section.className = "assistant-recommendations";
    recommendations.forEach((recommendation, index) => {
      recommendation.response_language = responseLanguage(responseBody);
      const card = document.createElement("article");
      card.className = `assistant-recommendation ${recommendation.in_catalog ? "is-catalog" : "is-web"}`;
      const media = document.createElement("div");
      media.className = "assistant-recommendation-media";
      const image = document.createElement("img");
      image.src = recommendation.image_url;
      image.alt = recommendation.title;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        card.remove();
      }, { once: true });
      const rank = document.createElement("span");
      rank.className = "assistant-recommendation-rank";
      rank.textContent = String(index + 1);
      media.append(image, rank);
      const content = document.createElement("div");
      content.className = "assistant-recommendation-content";
      const position = document.createElement("span");
      position.className = "assistant-recommendation-role";
      const positionLabels = {
        best_overall: ["positionBestOverall", "Best overall"],
        lowest_price: ["positionLowestPrice", "Lowest price"],
        alternative: ["positionAlternative", "Alternative"],
      };
      const [positionKey, positionFallback] =
        positionLabels[recommendation.position_role] || positionLabels.alternative;
      position.textContent = responseTr(
        responseBody,
        positionKey,
        positionFallback,
      );
      const title = document.createElement("h3");
      title.textContent = recommendation.title;
      const meta = document.createElement("div");
      meta.className = "assistant-recommendation-meta";
      const price = document.createElement("strong");
      price.textContent =
        money(recommendation.price_value, recommendation.currency) ||
        recommendation.price ||
        "";
      const retailer = document.createElement("span");
      retailer.textContent = recommendation.retailer || "";
      meta.append(price, retailer);
      const signals = document.createElement("div");
      signals.className = "assistant-recommendation-signals";
      if (recommendation.score != null) {
        const score = document.createElement("span");
        score.textContent = `${responseTr(responseBody, "score", "Score")} ${recommendation.score}/100`;
        signals.append(score);
      }
      if (recommendation.rating) {
        const rating = document.createElement("span");
        rating.textContent = `★ ${Number(recommendation.rating).toFixed(1)}${recommendation.reviews ? ` (${Number(recommendation.reviews).toLocaleString()})` : ""}`;
        signals.append(rating);
      }
      const reason = document.createElement("p");
      reason.textContent = recommendation.reason;
      const facts = document.createElement("dl");
      facts.className = "assistant-recommendation-facts";
      const deliveredTotal = totalDelivered(recommendation);
      const basePrice = numericAmount(recommendation.price_value);
      for (const [labelText, value] of [
        [
          responseTr(responseBody, "totalPrice", "Total delivered"),
          deliveredTotal != null && basePrice != null && deliveredTotal > basePrice
            ? money(deliveredTotal, recommendation.currency)
            : "",
        ],
        [responseTr(responseBody, "availability", "Availability"), localizeRetailerFact(recommendation.availability, "availability", responseBody)],
        [responseTr(responseBody, "delivery", "Delivery"), localizeRetailerFact(recommendation.delivery, "delivery", responseBody)],
        [responseTr(responseBody, "returns", "Returns"), localizeRetailerFact(recommendation.returns, "returns", responseBody)],
        [
          responseTr(responseBody, "pack", "Pack"),
          recommendation.pack_count ? String(recommendation.pack_count) : "",
        ],
        [
          responseTr(responseBody, "sizes", "Sizes"),
          (recommendation.available_sizes || []).join(", "),
        ],
      ]) {
        if (!value) continue;
        const wrapper = document.createElement("div");
        const term = document.createElement("dt");
        term.textContent = labelText;
        const detail = document.createElement("dd");
        detail.textContent = value;
        wrapper.append(term, detail);
        facts.append(wrapper);
      }
      const trust = document.createElement("small");
      trust.className = "assistant-recommendation-trust";
      const checked = recommendation.checked_at
        ? new Date(recommendation.checked_at).toLocaleString()
        : "";
      trust.textContent = recommendation.in_catalog
        ? [
            responseTr(responseBody, "inCatalog", "Verified OneDailyDrop product"),
            checked
              ? `${responseTr(responseBody, "checked", "Price checked")} ${checked}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      const otherOffers = document.createElement("div");
      otherOffers.className = "assistant-other-offers";
      if ((recommendation.other_offers || []).length) {
        const otherOffersLabel = document.createElement("strong");
        otherOffersLabel.textContent = responseTr(
          responseBody,
          "otherOffers",
          "Other offers",
        );
        otherOffers.append(otherOffersLabel);
        for (const offer of recommendation.other_offers) {
          const offerLink = document.createElement("a");
          offerLink.href = offer.url;
          offerLink.target = "_blank";
          offerLink.rel = "noopener noreferrer nofollow";
          offerLink.textContent = [
            offer.retailer,
            money(offer.price_value ?? offer.price, offer.currency),
          ]
            .filter(Boolean)
            .join(" · ");
          otherOffers.append(offerLink);
        }
      }
      const controls = document.createElement("div");
      controls.className = "assistant-recommendation-controls";
      if (recommendation.url) {
        const link = document.createElement("a");
        link.className = "assistant-recommendation-link";
        link.href = recommendation.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow";
        link.textContent = responseTr(
          responseBody,
          "viewDetails",
          "View product",
        );
        controls.append(link);
      }
      const saved = isSaved(recommendation);
      const save = createButton(
        saved
          ? `♥ ${responseTr(responseBody, "savedLabel", "Saved")}`
          : `♡ ${responseTr(responseBody, "save", "Save")}`,
        `assistant-save-product${saved ? " is-saved" : ""}`,
        () => toggleSaved(recommendation),
      );
      save.dataset.saveProduct = productKey(recommendation);
      save.dataset.savedLabel = responseTr(responseBody, "savedLabel", "Saved");
      save.dataset.saveLabel = responseTr(responseBody, "save", "Save");
      const ask = createButton(
        `✦ ${responseTr(responseBody, "askProduct", "Ask Delia")}`,
        "assistant-ask-product",
        () => setProductContext(recommendation),
      );
      controls.append(save, ask);
      content.append(
        position,
        title,
        meta,
        signals,
        reason,
        facts,
        trust,
        otherOffers,
        controls,
      );
      card.append(media, content);
      section.append(card);
    });
    host.append(section);
  }

  function renderPartialOffers(offers = [], host, responseBody = {}) {
    if (!offers.length || !host) return;
    const section = document.createElement("section");
    section.className = "assistant-partial-offers";
    const heading = document.createElement("h3");
    heading.textContent = responseTr(
      responseBody,
      "partialTitle",
      "Current product pages",
    );
    section.append(heading);
    for (const offer of offers) {
      const card = document.createElement("article");
      card.className = "assistant-partial-offer";
      if (offer.image_url) {
        const image = document.createElement("img");
        image.src = offer.image_url;
        image.alt = offer.title;
        image.loading = "lazy";
        image.addEventListener("error", () => {
          card.remove();
        }, { once: true });
        card.append(image);
      }
      const content = document.createElement("div");
      content.className = "assistant-partial-offer-copy";
      const title = document.createElement("strong");
      title.textContent = offer.title;
      const meta = document.createElement("span");
      meta.textContent = [
        money(offer.price_value, offer.currency) ||
          offer.price ||
          responseTr(responseBody, "checkPrice", "Check live price"),
        offer.retailer,
      ]
        .filter(Boolean)
        .join(" · ");
      const status = document.createElement("small");
      status.textContent = responseTr(
        responseBody,
        "partialStatus",
        "Details not independently verified",
      );
      const reason = document.createElement("p");
      reason.textContent = offer.reason;
      content.append(title, meta, status, reason);
      const link = document.createElement("a");
      link.href = offer.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
      link.textContent = responseTr(
        responseBody,
        "viewOffer",
        "Open retailer page",
      );
      card.append(content, link);
      section.append(card);
    }
    host.append(section);
  }

  function renderComparison(comparison = [], host, responseBody = {}) {
    if (comparison.length < 2 || !host) return;
    const section = document.createElement("section");
    section.className = "assistant-comparison";
    const heading = document.createElement("h3");
    heading.textContent = responseTr(
      responseBody,
      "comparisonTitle",
      "Quick comparison",
    );
    const grid = document.createElement("div");
    grid.className = "assistant-comparison-grid";
    const addField = (card, labelText, value, emphasis = false) => {
      if (!value || (Array.isArray(value) && !value.length)) return;
      const field = document.createElement("div");
      field.className = `assistant-comparison-field${emphasis ? " is-emphasis" : ""}`;
      const label = document.createElement("dt");
      label.textContent = labelText;
      const detail = document.createElement("dd");
      if (Array.isArray(value)) {
        const list = document.createElement("ul");
        for (const entry of value) {
          const item = document.createElement("li");
          item.textContent = entry;
          list.append(item);
        }
        detail.append(list);
      } else {
        detail.textContent = value;
      }
      field.append(label, detail);
      card.append(field);
    };
    for (const item of comparison.slice(0, 3)) {
      const card = document.createElement("dl");
      card.className = "assistant-comparison-item";
      const title = document.createElement(item.url ? "a" : "strong");
      title.className = "assistant-comparison-product";
      title.textContent = item.title;
      if (item.url) {
        title.href = item.url;
        title.target = "_blank";
        title.rel = "noopener noreferrer nofollow";
      }
      card.append(title);
      addField(
        card,
        responseTr(responseBody, "price", "Price"),
        typeof item.price === "number"
          ? money(item.price, item.currency)
          : item.price,
        true,
      );
      const comparisonTotal = numericAmount(item.total_price);
      const comparisonPrice = numericAmount(item.price);
      addField(
        card,
        responseTr(responseBody, "totalPrice", "Total delivered"),
        comparisonTotal != null &&
          (comparisonPrice == null || comparisonTotal > comparisonPrice)
          ? money(comparisonTotal, item.currency)
          : "",
        true,
      );
      addField(
        card,
        responseTr(responseBody, "bestFor", "Best for"),
        item.best_for,
        true,
      );
      if (item.score != null) {
        addField(
          card,
          responseTr(responseBody, "score", "Score"),
          `${item.score}/100`,
        );
      }
      addField(
        card,
        responseTr(responseBody, "availability", "Availability"),
        localizeRetailerFact(item.availability, "availability", responseBody),
      );
      addField(
        card,
        responseTr(responseBody, "delivery", "Delivery"),
        localizeRetailerFact(item.delivery, "delivery", responseBody),
      );
      addField(
        card,
        responseTr(responseBody, "returns", "Returns"),
        localizeRetailerFact(item.returns, "returns", responseBody),
      );
      addField(
        card,
        responseTr(responseBody, "strengths", "Strengths"),
        item.strengths,
      );
      addField(
        card,
        responseTr(responseBody, "drawbacks", "Watch-outs"),
        item.drawbacks,
      );
      grid.append(card);
    }
    section.append(heading, grid);
    host.append(section);
  }

  function renderComparisonNotes(notes = [], host) {
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

  function renderProducts(products = [], host, responseBody = {}) {
    if (!products.length || !host) return;
    const section = document.createElement("div");
    section.className = "assistant-products";
    for (const product of products
      .filter((item) => item.image_url && item.url && item.price != null)
      .slice(0, 6)) {
      product.response_language = responseLanguage(responseBody);
      const card = document.createElement("article");
      card.className = "assistant-product";
      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => card.remove(), { once: true });
      const copyElement = document.createElement("a");
      copyElement.href = product.url;
      const title = document.createElement("strong");
      title.textContent = product.title;
      const meta = document.createElement("small");
      meta.textContent = [
        money(product.price, product.currency),
        product.score ? `${product.score}/100` : "",
        product.retailer,
      ]
        .filter(Boolean)
        .join(" · ");
      copyElement.append(title, meta);
      const ask = createButton("✦", "assistant-product-ask", () =>
        setProductContext(product),
      );
      card.append(image, copyElement, ask);
      section.append(card);
    }
    host.append(section);
  }

  function renderClarifyingQuestions(questions = [], host) {
    if (!questions.length) return;
    const list = document.createElement("ol");
    list.className = "assistant-clarifying-questions";
    for (const question of questions) {
      const item = document.createElement("li");
      item.textContent = question;
      list.append(item);
    }
    host.append(list);
  }

  function renderSources(sources = [], host, responseBody = {}) {
    if (!sources.length || !host) return;
    const section = document.createElement("details");
    section.className = "assistant-sources";
    const label = document.createElement("summary");
    label.textContent = `${responseTr(responseBody, "sources", "Sources")} (${sources.length})`;
    section.append(label);
    const links = document.createElement("div");
    links.className = "assistant-source-links";
    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
      link.textContent = source.title;
      links.append(link);
    }
    section.append(links);
    host.append(section);
  }

  function showLocalComparison(body, labelOverride = "") {
    const recommendations = (body.recommendations || []).slice(0, 3);
    if (recommendations.length < 2 || requestController) return;
    const latestAction = activeChat.messages.at(-1)?.response?.trigger_action;
    if (latestAction === "compare") return;
    const label = labelOverride ||
      responseTr(body, "actionCompare", "Compare these products");
    const userRecord = {
      id: makeId(),
      role: "user",
      content: label,
      action: "compare",
      include_in_model: false,
      created_at: new Date().toISOString(),
    };
    activeChat.messages.push(userRecord);
    addMessage("user", label).dataset.messageId = userRecord.id;
    const comparisonBody = normalizeResponseBody({
      message: responseTr(
        body,
        "comparisonReady",
        "I compared the products already shown — no new search needed.",
      ),
      follow_up: "",
      recommendations: [],
      partial_offers: [],
      comparison_notes: [],
      comparison: recommendations.map((recommendation) => ({
        title: recommendation.title,
        retailer: recommendation.retailer,
        price: recommendation.price_value ?? recommendation.price,
        total_price: totalDelivered(recommendation),
        currency: recommendation.currency,
        best_for: recommendation.reason,
        score: recommendation.score,
        availability: recommendation.availability,
        delivery: recommendation.delivery,
        returns: recommendation.returns,
        url: recommendation.url,
      })),
      products: [],
      sources: [],
      clarifying_questions: [],
      needs_clarification: false,
      scope: "shopping",
      language: responseLanguage(body),
      result_state: "exact_matches",
      trigger_action: "compare",
    });
    const assistantRecord = {
      id: makeId(),
      role: "assistant",
      content: comparisonBody.message,
      response: comparisonBody,
      include_in_model: false,
      created_at: new Date().toISOString(),
    };
    const message = addMessage("assistant", comparisonBody.message);
    message.dataset.messageId = assistantRecord.id;
    renderResponse(message, comparisonBody, assistantRecord);
    activeChat.messages.push(assistantRecord);
    persistChats();
    scrollToLatest();
  }

  function cheaperRequest(body, label) {
    const totals = (body.recommendations || [])
      .map((recommendation) => totalDelivered(recommendation))
      .filter((value) => value != null && value > 0);
    if (!totals.length) return label;
    const ceiling = Math.max(0.01, Math.min(...totals) - 0.01).toFixed(2);
    const currency = body.currency || body.recommendations?.[0]?.currency || "USD";
    return responseLanguage(body) === "ru"
      ? `Найти дешевле: до ${ceiling} ${currency} с учетом доставки`
      : `${label}: under ${ceiling} ${currency} including delivery`;
  }

  function renderFollowUpActions(body, host) {
    const recommendations = body.recommendations || [];
    const partialOffers = body.partial_offers || [];
    if (
      body.scope !== "shopping" ||
      body.needs_clarification ||
      (!recommendations.length && !partialOffers.length && body.result_state !== "no_match")
    ) return;
    const section = document.createElement("div");
    section.className = "assistant-quick-actions";
    const actions = recommendations.length
      ? [
          ...(recommendations.length >= 2
            ? [["compare", "actionCompare", "Compare these products"]]
            : []),
          ["cheaper", "actionCheaper", "Find cheaper options"],
          ["stores", "actionStores", "Check other stores"],
        ]
      : [
          ["stores", "actionStores", "Check other stores"],
          ["similar", "actionSimilar", "Show similar models"],
          ["retry", "actionRetry", "Search again"],
        ];
    for (const [action, key, fallback] of actions
      .filter(([action]) => body.trigger_action !== action)
      .slice(0, 3)) {
      const label = responseTr(body, key, fallback);
      section.append(
        createButton(label, "assistant-quick-action", () => {
          if (action === "compare") {
            showLocalComparison(body);
            return;
          }
          sendQuestion(label, {
            action,
            requestQuestion: action === "cheaper"
              ? cheaperRequest(body, label)
              : label,
          });
        }),
      );
    }
    if (section.childElementCount) host.append(section);
  }

  function renderFeedback(record, host, responseBody = {}) {
    if (
      record.response?.scope !== "shopping" ||
      record.response?.needs_clarification ||
      (!(record.response?.recommendations || []).length &&
        !(record.response?.partial_offers || []).length)
    )
      return;
    const section = document.createElement("div");
    section.className = "assistant-feedback";
    const question = document.createElement("span");
    question.textContent = responseTr(
      responseBody,
      "feedbackQuestion",
      "Was this useful?",
    );
    section.append(question);
    for (const [type, label] of [
      ["helpful", `👍 ${responseTr(responseBody, "helpful", "Helpful")}`],
      ["not_helpful", `👎 ${responseTr(responseBody, "notHelpful", "Not helpful")}`],
      ["wrong_price", `! ${responseTr(responseBody, "wrongPrice", "Price is wrong")}`],
    ]) {
      const button = createButton(label, "assistant-feedback-button", () =>
        sendFeedback(record, type, section, responseBody),
      );
      button.classList.toggle("is-selected", record.feedback === type);
      button.disabled = Boolean(record.feedback);
      section.append(button);
    }
    if (record.feedback) {
      const thanks = document.createElement("small");
      thanks.textContent = responseTr(
        responseBody,
        "feedbackThanks",
        "Thanks — your feedback was recorded.",
      );
      section.append(thanks);
    }
    host.append(section);
  }

  async function sendFeedback(record, feedbackType, section, responseBody = {}) {
    if (record.feedback) return;
    record.feedback = feedbackType;
    persistChats();
    section.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    const thanks = document.createElement("small");
    thanks.textContent = responseTr(
      responseBody,
      "feedbackThanks",
      "Thanks — your feedback was recorded.",
    );
    section.append(thanks);
    try {
      await fetch("/api/shopping-assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeChat.id,
          message_id: record.id,
          feedback_type: feedbackType,
          market: market(),
          product_ids: (record.response?.recommendations || []).map(
            (item) => item.catalog_product_id,
          ).filter(Boolean),
        }),
      });
    } catch {
      // Local feedback state remains visible even if analytics is unavailable.
    }
  }

  function renderResponse(message, body, record) {
    body = normalizeResponseBody(body);
    updateConversationLocale(body);
    if (record) record.response = body;
    const copyElement = message.querySelector(".assistant-message-copy");
    copyElement.textContent = body.message || "";
    renderClarifyingQuestions(body.clarifying_questions, message);
    renderMarketContext(body, message);
    renderRecommendations(body.recommendations, message, body);
    renderPartialOffers(body.partial_offers, message, body);
    renderComparison(body.comparison, message, body);
    renderComparisonNotes(body.comparison_notes, message);
    if (
      !(body.recommendations || []).length &&
      !(body.partial_offers || []).length &&
      !body.needs_clarification
    ) {
      renderProducts(body.products, message, body);
    }
    if (body.follow_up) {
      const followUp = document.createElement("p");
      followUp.className = "assistant-follow-up";
      followUp.textContent = body.follow_up;
      message.append(followUp);
    }
    renderFollowUpActions(body, message);
    renderSources(body.sources, message, body);
    renderFeedback(record, message, body);
  }

  function renderRecord(record) {
    const message = addMessage(record.role, record.content || "");
    message.dataset.messageId = record.id;
    if (record.role === "assistant" && record.response) {
      renderResponse(message, record.response, record);
    }
    if (record.stopped) message.classList.add("is-stopped");
  }

  function modelHistory() {
    return activeChat.messages
      .filter((item) => item.include_in_model !== false)
      .map((item) => ({
        role: item.role,
        content:
          item.role === "assistant" && item.response
            ? [
                item.response.message,
                [
                  ...(item.response.recommendations || []),
                  ...(item.response.partial_offers || []),
                ]
                  .map(
                    (product) =>
                      `${product.title} — ${money(product.price_value, product.currency) || product.price || ""} ${product.retailer}`,
                  )
                  .join("; "),
              ]
                .filter(Boolean)
                .join(" ")
                .slice(0, 1200)
            : item.content,
      }))
      .slice(-10);
  }

  function comparableSourceUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:utm_|ref$|ref_|tag$|aff|affiliate|campaign)/i.test(key)) {
          url.searchParams.delete(key);
        }
      }
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function previousSourceUrls() {
    return new Set(
      activeChat.messages.flatMap((record) =>
        (record.response?.sources || [])
          .map((source) => comparableSourceUrl(source.url))
          .filter(Boolean),
      ),
    );
  }

  function previousOfferUrls() {
    return new Set(
      activeChat.messages.flatMap((record) => [
        ...(record.response?.recommendations || []),
        ...(record.response?.partial_offers || []),
      ]
        .map((offer) => comparableSourceUrl(offer.url))
        .filter(Boolean)),
    );
  }

  function startLoading(message) {
    const stages = [
      tr("thinkingSearch", "Searching for suitable products…"),
      tr("thinkingPrices", "Checking prices and retailers…"),
      tr("thinkingCompare", "Comparing the strongest options…"),
    ];
    let index = 0;
    message.querySelector(".assistant-message-copy").textContent = stages[0];
    loadingTimer = window.setInterval(() => {
      index = (index + 1) % stages.length;
      message.querySelector(".assistant-message-copy").textContent = stages[index];
    }, 1600);
  }

  function stopLoading() {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
  }

  function setBusy(busy) {
    submitButton.hidden = busy;
    stopButton.hidden = !busy;
    input.disabled = busy;
  }

  async function sendQuestion(value, options = {}) {
    const question = String(value ?? input.value).trim();
    const requestQuestion = String(options.requestQuestion || question).trim();
    const action = String(options.action || "");
    const latestResponse = activeChat.messages.at(-1)?.response;
    if (
      !question ||
      !requestQuestion ||
      requestController ||
      (action && latestResponse?.trigger_action === action &&
        latestResponse?.result_state === "no_match")
    ) return;
    const priorHistory = modelHistory();
    const seenSources = previousSourceUrls();
    const seenOffers = previousOfferUrls();
    const userRecord = {
      id: makeId(),
      role: "user",
      content: question,
      action,
      include_in_model: true,
      created_at: new Date().toISOString(),
    };
    if (!activeChat.messages.length) activeChat.title = titleFromQuestion(question);
    activeChat.draft = false;
    activeChat.messages.push(userRecord);
    addMessage("user", question).dataset.messageId = userRecord.id;
    conversationElement.classList.add("has-conversation");
    currentTitleElement.textContent = activeChat.title;
    input.value = "";
    persistChats();
    const greeting = localGreetingResponse(question);
    if (greeting) {
      activeChat.conversation_language = messageLanguage(question);
      updateConversationLocale({ language: activeChat.conversation_language });
      userRecord.include_in_model = false;
      const assistantRecord = {
        id: makeId(),
        role: "assistant",
        content: greeting,
        include_in_model: false,
        created_at: new Date().toISOString(),
      };
      const localMessage = addMessage("assistant", greeting);
      localMessage.dataset.messageId = assistantRecord.id;
      activeChat.messages.push(assistantRecord);
      persistChats();
      input.focus();
      scrollToLatest();
      return;
    }
    setBusy(true);
    const pending = addMessage("assistant", "", true);
    startLoading(pending);
    requestController = new AbortController();
    requestTimedOut = false;
    requestTimeoutTimer = window.setTimeout(() => {
      if (!requestController) return;
      requestTimedOut = true;
      requestController.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/shopping-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({
          message: requestQuestion,
          messages: priorHistory,
          shopping_context: activeChat.shopping_context || "",
          shopping_mission: activeChat.shopping_mission || normalizeShoppingMission(null),
          market: market(),
          language: language(),
        }),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          responseBody.error ||
            tr("failed", "The assistant is unavailable right now."),
        );
      const body = normalizeResponseBody(responseBody);
      const responseSources = new Set();
      body.sources = body.sources.filter((source) => {
        const key = comparableSourceUrl(source.url);
        if (!key || seenSources.has(key) || responseSources.has(key)) return false;
        responseSources.add(key);
        return true;
      });
      body.trigger_action = action;
      if (action === "stores") {
        body.recommendations = body.recommendations.filter(
          (recommendation) =>
            !seenOffers.has(comparableSourceUrl(recommendation.url)),
        );
        body.partial_offers = body.partial_offers.filter(
          (offer) => !seenOffers.has(comparableSourceUrl(offer.url)),
        );
        if (!body.recommendations.length && !body.partial_offers.length) {
          body.comparison = [];
          body.comparison_notes = [];
        }
      }
      if (
        action === "stores" &&
        !(body.recommendations || []).length &&
        !(body.partial_offers || []).length
      ) {
        body.message = responseTr(
          body,
          "noNewStores",
          "I couldn't find any new matching offers in other stores yet.",
        );
        body.result_state = "no_match";
      }
      activeChat.conversation_language = body.language || messageLanguage(question);
      if (body.scope === "shopping" && body.resolved_request) {
        activeChat.shopping_context = body.resolved_request;
      }
      if (body.scope === "shopping" && body.shopping_mission) {
        activeChat.shopping_mission = normalizeShoppingMission(body.shopping_mission);
      }
      if (["off_topic", "social"].includes(body.scope)) userRecord.include_in_model = false;
      if (body.scope === "shopping" && body.conversation_title) {
        activeChat.title = body.conversation_title;
        currentTitleElement.textContent = activeChat.title;
      }
      const assistantRecord = {
        id: makeId(),
        role: "assistant",
        content: body.message || "",
        response: body,
        include_in_model: body.scope !== "off_topic",
        created_at: new Date().toISOString(),
      };
      pending.dataset.messageId = assistantRecord.id;
      renderResponse(pending, body, assistantRecord);
      pending.classList.remove("is-pending");
      activeChat.messages.push(assistantRecord);
      persistChats();
    } catch (error) {
      if (error.name === "AbortError") {
        userRecord.include_in_model = false;
        const timeoutMessage = tr(
          "timeout",
          "The live search took too long, so I stopped it. Try again or narrow the model and budget.",
        );
        const timeoutBody = requestTimedOut
          ? normalizeResponseBody({
              message: timeoutMessage,
              follow_up: "",
              recommendations: [],
              partial_offers: [],
              comparison_notes: [],
              comparison: [],
              products: [],
              sources: [],
              clarifying_questions: [],
              needs_clarification: false,
              scope: "shopping",
              result_state: "no_match",
              timed_out: true,
            })
          : null;
        const stoppedRecord = {
          id: makeId(),
          role: "assistant",
          content: requestTimedOut
            ? timeoutMessage
            : tr(
                "stopped",
                "Stopped. You can edit the request or try again.",
              ),
          ...(timeoutBody ? { response: timeoutBody } : {}),
          include_in_model: false,
          stopped: !requestTimedOut,
          created_at: new Date().toISOString(),
        };
        if (timeoutBody) renderResponse(pending, timeoutBody, stoppedRecord);
        else pending.querySelector(".assistant-message-copy").textContent =
          stoppedRecord.content;
        pending.classList.add(requestTimedOut ? "is-error" : "is-stopped");
        activeChat.messages.push(stoppedRecord);
      } else {
        userRecord.include_in_model = false;
        pending.querySelector(".assistant-message-copy").textContent =
          error.message ||
          tr("failed", "The assistant is unavailable right now.");
        pending.classList.add("is-error");
      }
      pending.classList.remove("is-pending");
      persistChats();
    } finally {
      if (requestTimeoutTimer) window.clearTimeout(requestTimeoutTimer);
      requestTimeoutTimer = null;
      stopLoading();
      requestController = null;
      requestTimedOut = false;
      setBusy(false);
      input.focus();
      scrollToLatest();
    }
  }

  function openPanel() {
    if (panel.hidden) previousFocus = document.activeElement;
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
    sidebar.classList.remove("is-open");
    window.setTimeout(() => {
      panel.hidden = true;
      backdrop.hidden = true;
      previousFocus?.focus?.();
    }, 180);
  }

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 760px)").matches)
      sidebar.classList.remove("is-open");
  }

  document.querySelectorAll("[data-shopping-assistant-open]").forEach((button) =>
    button.addEventListener("click", openPanel),
  );
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ask-delia]");
    if (!button) return;
    event.preventDefault();
    setProductContext({
      id: Number(button.dataset.productId || 0),
      catalog_product_id: Number(button.dataset.productId || 0),
      title: button.dataset.productTitle || "Product",
      score: Number(button.dataset.productScore || 0) || null,
      url: button.dataset.productUrl || "",
    });
  });
  closeButton?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);
  stopButton?.addEventListener("click", () => requestController?.abort());
  panel.querySelector("[data-assistant-sidebar-toggle]")?.addEventListener(
    "click",
    () => sidebar.classList.toggle("is-open"),
  );
  panel.querySelector("[data-assistant-sidebar-close]")?.addEventListener(
    "click",
    () => sidebar.classList.remove("is-open"),
  );
  panel.querySelectorAll("[data-assistant-new]").forEach((button) =>
    button.addEventListener("click", newChat),
  );
  panel.querySelector("[data-assistant-clear]")?.addEventListener(
    "click",
    clearHistory,
  );
  compareSavedButton?.addEventListener("click", () => {
    const recommendations = savedProducts.slice(0, 3);
    if (recommendations.length < 2) return;
    showLocalComparison(
      {
        recommendations,
        language:
          recommendations[0].response_language ||
          activeChat.conversation_language ||
          language(),
      },
      tr("compareSaved", "Compare saved"),
    );
    sidebar.classList.remove("is-open");
  });
  panel.querySelectorAll("[data-assistant-prompt]").forEach((button) =>
    button.addEventListener("click", () =>
      sendQuestion(button.dataset.assistantPrompt || button.textContent),
    ),
  );
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendQuestion(input.value);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      if (sidebar.classList.contains("is-open")) sidebar.classList.remove("is-open");
      else closePanel();
    }
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

  chats = normalizedChats();
  savedProducts = savedProducts.filter((product) => product && product.title).slice(0, 50);
  let activeId = "";
  try {
    activeId = localStorage.getItem(ACTIVE_KEY) || "";
  } catch {}
  setActiveChat(chats.find((chat) => chat.id === activeId) || chats[0] || createDraftChat());
  renderSavedProducts();
})();
