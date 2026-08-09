const OpenAIExport = require("openai");
const { marketPath } = require("./markets");
const { presentProduct } = require("./productPresentation");

const OpenAI = OpenAIExport.default || OpenAIExport;
const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1200;
const MAX_TOOL_ROUNDS = 3;

const clean = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const number = (value, fallback = 0) => {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const slug = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "deal";

function productUrl(product) {
  return marketPath(
    product.market || "us",
    `/deal/${slug(product.title)}-${product.id}`,
  );
}

function assistantProduct(product, language = "en") {
  const presented = presentProduct(product, language);
  return {
    id: Number(product.id),
    title: clean(product.title),
    brand: clean(product.brand),
    category: clean(presented.display_category || product.category),
    retailer: clean(product.retailer_name || product.source),
    price: number(product.current_price, null),
    currency: clean(product.currency),
    score: presented.display_score,
    rating: number(product.rating, null),
    reviews: Math.max(0, Math.round(number(product.review_count))),
    delivery: clean(presented.display_shipping_summary),
    returns: clean(presented.display_return_summary),
    checked_at: clean(product.checked_at),
    image_url: clean(product.image_url),
    url: productUrl(product),
  };
}

function normalizeSearch(value) {
  return clean(value).toLowerCase().slice(0, 160);
}

function searchCatalog(db, sourceSql, args, marketCode, language) {
  const query = normalizeSearch(args.query);
  const category = normalizeSearch(args.category);
  const maxPrice = number(args.max_price, 0);
  const minimumScore = Math.max(
    82,
    Math.min(95, number(args.minimum_score, 82)),
  );
  const limit = Math.max(1, Math.min(8, Math.round(number(args.limit, 6))));
  const tokens = query
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 8);
  const rows = db
    .prepare(
      `
    SELECT * FROM products
    WHERE market=? AND status='published' AND ${sourceSql()}
    ORDER BY score DESC,evidence_confidence DESC,updated_at DESC
    LIMIT 160
  `,
    )
    .all(marketCode);

  return rows
    .map((product) => assistantProduct(product, language))
    .filter((product) => product.score != null && product.score >= minimumScore)
    .filter(
      (product) =>
        !maxPrice || (product.price != null && product.price <= maxPrice),
    )
    .filter(
      (product) =>
        !category || product.category.toLowerCase().includes(category),
    )
    .map((product) => {
      const haystack =
        `${product.title} ${product.brand} ${product.category}`.toLowerCase();
      const matches = tokens.filter((token) => haystack.includes(token)).length;
      return { product, matches };
    })
    .filter((entry) => !tokens.length || entry.matches > 0)
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        right.product.score - left.product.score,
    )
    .slice(0, limit)
    .map((entry) => entry.product);
}

function priceHistory(db, sourceSql, args, marketCode) {
  const product = db
    .prepare(
      `
    SELECT id,title,current_price,currency,market
    FROM products
    WHERE id=? AND market=? AND status='published' AND ${sourceSql()}
  `,
    )
    .get(Number(args.product_id), marketCode);
  if (!product) return { error: "Product not found in this regional catalog." };
  const observations = db
    .prepare(
      `
    SELECT price,currency,observed_at
    FROM price_history
    WHERE product_id=?
    ORDER BY observed_at DESC
    LIMIT 30
  `,
    )
    .all(product.id);
  return {
    product: {
      id: product.id,
      title: clean(product.title),
      current_price: product.current_price,
      currency: product.currency,
    },
    observations: observations.reverse(),
  };
}

function toolDefinitions() {
  return [
    { type: "web_search" },
    {
      type: "function",
      name: "search_catalog",
      description:
        "Search the current OneDailyDrop regional catalog for editorially qualified offers.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Product type, use case, feature, or brand.",
          },
          category: {
            type: "string",
            description: "Optional catalog category filter.",
          },
          max_price: {
            type: "number",
            description:
              "Maximum budget in the regional currency. Use 0 when unknown.",
          },
          minimum_score: {
            type: "number",
            description:
              "Minimum public OneDailyDrop Score. Use 82 by default.",
          },
          limit: {
            type: "integer",
            description: "Number of results from 1 to 8.",
          },
        },
        required: ["query", "category", "max_price", "minimum_score", "limit"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_price_history",
      description:
        "Get OneDailyDrop's tracked price observations for one catalog product.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "integer",
            description: "OneDailyDrop product ID returned by search_catalog.",
          },
        },
        required: ["product_id"],
        additionalProperties: false,
      },
    },
  ];
}

function instructions({ marketCode, currency, language }) {
  return `You are the OneDailyDrop AI Shopping Assistant for market ${marketCode.toUpperCase()} and currency ${currency}.
Help shoppers narrow choices, compare tradeoffs, check current facts, and find relevant offers. Do not reduce the answer to a simplistic "buy" or "do not buy" verdict. Ask one concise follow-up question when budget or use case would materially change the result.

Use search_catalog before recommending anything from OneDailyDrop. Translate the shopper's request into concise catalog search terms when the catalog language differs. Only describe a catalog score when the tool returns one. Never invent a price, discount, product rating, seller policy, availability, or price history. Use web search for current specifications, independent context, or products outside the catalog, and clearly separate web findings from OneDailyDrop catalog offers. Do not claim that a retailer reference price is a verified historical price. Keep answers concise, practical, and in language code ${language}.`;
}

function extractSources(response) {
  const sources = new Map();
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        const citation = annotation.url_citation || annotation;
        if (
          annotation.type !== "url_citation" ||
          !/^https?:\/\//i.test(String(citation.url || ""))
        )
          continue;
        sources.set(citation.url, {
          title: clean(citation.title) || citation.url,
          url: citation.url,
        });
      }
    }
  }
  return [...sources.values()].slice(0, 6);
}

function safeHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: clean(item?.content).slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((item) => item.content);
}

function createShoppingAssistant({
  db,
  sourceSql,
  market,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_SHOPPING_MODEL || DEFAULT_MODEL,
  client,
} = {}) {
  const openai = client || (apiKey ? new OpenAI({ apiKey }) : null);

  return {
    configured: Boolean(openai),
    model,
    async respond({ message, messages, marketCode, language = "en" }) {
      if (!openai) {
        const error = new Error("AI Shopping Assistant is not configured.");
        error.statusCode = 503;
        throw error;
      }
      const selectedMarket = market(marketCode);
      const userMessage = clean(message).slice(0, MAX_MESSAGE_LENGTH);
      if (!userMessage) {
        const error = new Error("Enter a shopping question.");
        error.statusCode = 400;
        throw error;
      }

      let input = [
        ...safeHistory(messages),
        { role: "user", content: userMessage },
      ];
      const referencedProducts = new Map();
      let response;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        response = await openai.responses.create({
          model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 900,
          instructions: instructions({
            marketCode: selectedMarket.code,
            currency: selectedMarket.currency,
            language,
          }),
          tools: toolDefinitions(),
          input,
        });
        const calls = (response.output || []).filter(
          (item) => item.type === "function_call",
        );
        if (!calls.length) break;
        const outputs = calls.map((call) => {
          let args = {};
          try {
            args = JSON.parse(call.arguments || "{}");
          } catch {
            args = {};
          }
          let output;
          if (call.name === "search_catalog") {
            output = searchCatalog(
              db,
              sourceSql,
              args,
              selectedMarket.code,
              language,
            );
            output.forEach((product) =>
              referencedProducts.set(product.id, product),
            );
          } else if (call.name === "get_price_history") {
            output = priceHistory(db, sourceSql, args, selectedMarket.code);
          } else {
            output = { error: "Unsupported tool." };
          }
          return {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(output),
          };
        });
        input = [...input, ...(response.output || []), ...outputs];
      }

      return {
        message:
          clean(response?.output_text) ||
          "I could not complete that comparison. Try a more specific product or budget.",
        products: [...referencedProducts.values()].slice(0, 6),
        sources: extractSources(response || {}),
        model,
      };
    },
  };
}

module.exports = {
  DEFAULT_MODEL,
  assistantProduct,
  createShoppingAssistant,
  searchCatalog,
};
