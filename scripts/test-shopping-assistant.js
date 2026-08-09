const assert = require("assert");
const Database = require("better-sqlite3");
const {
  createShoppingAssistant,
  normalizeAssistantResponse,
  searchCatalog,
} = require("../src/shoppingAssistant");

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,title TEXT,brand TEXT,category TEXT,market TEXT,status TEXT,source TEXT,
    retailer_name TEXT,current_price REAL,original_price REAL,currency TEXT,rating REAL,review_count INTEGER,
    seller_name TEXT,seller_rating REAL,seller_feedback_count INTEGER,shipping_summary TEXT,return_summary TEXT,
    availability TEXT,checked_at TEXT,updated_at TEXT,image_url TEXT,affiliate_url TEXT,score REAL,
    evidence_confidence REAL,score_breakdown TEXT
  );
  CREATE TABLE price_history (product_id INTEGER,price REAL,currency TEXT,observed_at TEXT);
`);
const product = {
  id: 1,
  title: "Acme quiet countertop blender",
  brand: "Acme",
  category: "Kitchen",
  market: "us",
  status: "published",
  source: "ebay",
  retailer_name: "eBay",
  current_price: 79,
  original_price: 99,
  currency: "USD",
  rating: 4.7,
  review_count: 420,
  seller_name: "Acme Store",
  seller_rating: 4.99,
  seller_feedback_count: 12000,
  shipping_summary: "Free shipping",
  return_summary: "30 calendar days, seller-paid return shipping",
  availability: "In stock",
  checked_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
  image_url: "https://example.com/blender.jpg",
  affiliate_url: "https://example.com/blender",
  score: 75,
  evidence_confidence: 80,
  score_breakdown: JSON.stringify({
    model: "current-offer-v6",
    price_quality: 12,
    product_quality: 15,
    review_confidence: 12,
    seller_reliability: 15,
    demand_usefulness: 8,
    shipping_returns: 10,
  }),
};
db.prepare(
  `INSERT INTO products (${Object.keys(product).join(",")}) VALUES (${Object.keys(
    product,
  )
    .map(() => "?")
    .join(",")})`,
).run(...Object.values(product));
db.prepare("INSERT INTO price_history VALUES (?,?,?,?)").run(
  1,
  89,
  "USD",
  "2026-08-01T12:00:00Z",
);
db.prepare("INSERT INTO price_history VALUES (?,?,?,?)").run(
  1,
  79,
  "USD",
  "2026-08-08T12:00:00Z",
);

const sourceSql = () => "source='ebay'";
const matches = searchCatalog(
  db,
  sourceSql,
  {
    query: "quiet blender",
    category: "Kitchen",
    max_price: 100,
    minimum_score: 82,
    limit: 6,
  },
  "us",
  "en",
);
assert.strictEqual(
  matches.length,
  1,
  "Qualified regional catalog result was not returned",
);
assert(matches[0].score >= 82, "Assistant exposed an unqualified public score");

const calls = [];
const client = {
  responses: {
    create: async (request) => {
      calls.push(request);
      if (calls.length === 1) {
        return {
          output: [
            {
              type: "function_call",
              name: "search_catalog",
              call_id: "catalog-1",
              arguments: JSON.stringify({
                query: "quiet blender",
                category: "Kitchen",
                max_price: 100,
                minimum_score: 82,
                limit: 3,
              }),
            },
          ],
          output_text: "",
        };
      }
      return {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "This qualified blender fits the budget.",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://example.com/review",
                    title: "Independent review",
                  },
                ],
              },
            ],
          },
        ],
        output_text: JSON.stringify({
          answer: "I found one qualified option within budget.",
          follow_up: "Do you care more about noise or capacity?",
          recommendations: [
            {
              title: "Acme quiet countertop blender",
              retailer: "eBay",
              price: "$79",
              badge: "Best match",
              reason: "It fits the budget and prioritizes quieter operation.",
              url: "https://example.com/blender",
              action_label: "View offer",
            },
          ],
          comparison_notes: ["The tracked offer is below the $100 budget."],
        }),
      };
    },
  },
};

(async () => {
  const assistant = createShoppingAssistant({
    db,
    sourceSql,
    market: (code) => ({ code, currency: "USD" }),
    client,
  });
  const result = await assistant.respond({
    message: "Find a quiet blender under $100",
    messages: [],
    marketCode: "us",
    language: "en",
  });
  assert.strictEqual(
    calls.length,
    2,
    "Assistant did not complete the tool round trip",
  );
  assert.strictEqual(
    calls[0].store,
    false,
    "Assistant API request must not persist conversations",
  );
  assert(
    calls[0].tools.some((tool) => tool.type === "web_search"),
    "Web search tool is missing",
  );
  assert.strictEqual(
    calls[1].text.format.type,
    "json_schema",
    "Assistant response is not constrained to the visual UI schema",
  );
  assert.strictEqual(
    calls[1].text.format.strict,
    true,
    "Assistant response schema must be strict",
  );
  assert.strictEqual(
    result.recommendations[0].title,
    "Acme quiet countertop blender",
    "Structured recommendation was not returned to the UI",
  );
  assert.strictEqual(
    result.follow_up,
    "Do you care more about noise or capacity?",
    "Structured follow-up was not returned to the UI",
  );
  assert(
    calls[0].tools.some(
      (tool) => tool.name === "search_catalog" && tool.strict,
    ),
    "Strict catalog tool is missing",
  );
  assert.strictEqual(
    result.products[0].id,
    1,
    "Catalog recommendation was not returned to the UI",
  );
  const sanitized = normalizeAssistantResponse(
    JSON.stringify({
      answer: "A short answer",
      follow_up: "",
      recommendations: [
        {
          title: "Unsafe link test",
          retailer: "Example",
          price: "$1",
          badge: "",
          reason: "The card should render without an unsafe action.",
          url: "javascript:alert(1)",
          action_label: "Open",
        },
      ],
      comparison_notes: [],
    }),
  );
  assert.strictEqual(sanitized.recommendations[0].url, "");
  const fallback = normalizeAssistantResponse(
    "**Best value**: [Open offer](https://example.com/a-very-long-product-url)",
  );
  assert.strictEqual(fallback.answer, "Best value : Open offer");
  assert.strictEqual(
    result.sources[0].url,
    "https://example.com/review",
    "Web citation was not surfaced",
  );
  assert.strictEqual(
    createShoppingAssistant({
      db,
      sourceSql,
      market: (code) => ({ code, currency: "USD" }),
      apiKey: "",
    }).configured,
    false,
  );
  console.log(
    "OpenAI shopping assistant catalog tools and privacy settings passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
