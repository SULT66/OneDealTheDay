/*
 * Delia remembering what she just showed.
 *
 * Written against the failures read back from real conversations: "which one
 * is better?" starting a new search, "Why did you choose the SIHOO B100?"
 * answered with six other chairs, "number 2 or 3?" losing both. The products
 * here are deliberately not those ones. Sofas, drills and televisions are asked
 * about the same way, and a rule that only held for office chairs would be no
 * rule at all.
 */
const assert = require("assert");
const Database = require("better-sqlite3");
const {
  referencedPositions,
  sanitizeShortlist,
  shortlistQuestionIntent,
} = require("../src/deliaConversation");
const { createShoppingAssistant } = require("../src/shoppingAssistant");

/* ------------------------------------------------ what a message refers to */

const aboutShown = [
  "which one is better?",
  "what do you think?",
  "which one would you choose?",
  "number 2 or 3?",
  "why is this your pick?",
  "Why did you choose the SIHOO B100 specifically for sitting 8 hours a day? Use only verified product features.",
  "which of these can I actually sleep on every night?",
  "is the second one good for a small apartment?",
  "does it come with a warranty?",
  "compare the first and the last",
  "#1 vs #3 for a garage workshop?",
  "and why not the cheaper one?",
  "is that one worth the extra money?",
  "какой из них лучше?",
  "почему ты выбрала этот?",
  "а второй подойдёт для сна?",
  "сравни первый и третий",
  "стоит ли брать дрель за 129?",
  "¿cuál es mejor?",
  "welcher ist besser für die Küche?",
];
for (const message of aboutShown) {
  assert.strictEqual(shortlistQuestionIntent(message), "about_shown", `not read as a question about the shown products: ${message}`);
}

const moreOptions = [
  "show me other options",
  "find something else",
  "search again",
  "give me cheaper alternatives",
  "anything cheaper?",
  "any other brands?",
  "покажи другие варианты",
  "найди подешевле",
  "что-то другое есть?",
];
for (const message of moreOptions) {
  assert.strictEqual(shortlistQuestionIntent(message), "more_options", `not read as asking for other products: ${message}`);
}

/* A changed constraint or a new product is neither; those search as before. */
for (const message of [
  "sofa bed under $500",
  "only mesh back under $150",
  "a sofa for 2 or 3 people",
  "I need a cordless drill",
  "65 inch",
  "в чёрном цвете",
]) {
  assert.strictEqual(shortlistQuestionIntent(message), "", `a new constraint was taken for a question about the list: ${message}`);
}

assert.deepStrictEqual(referencedPositions("number 2 or 3?", 5), [2, 3]);
assert.deepStrictEqual(referencedPositions("the first one", 5), [1]);
assert.deepStrictEqual(referencedPositions("compare the first and the last", 5), [1, 5]);
assert.deepStrictEqual(referencedPositions("сравни второй и третий", 4), [2, 3]);
assert.deepStrictEqual(referencedPositions("#7", 5), [], "a position that is not on the screen was referenced");
assert.deepStrictEqual(referencedPositions("a sofa for 2 or 3 people", 5), [], "a seat count was read as positions");

/* ------------------------------------------ the shortlist from the browser */

const sanitized = sanitizeShortlist([
  { title: "<b>Novogratz</b> Brittany Sleeper Sofa", retailer: "Walmart", price_value: 349, currency: "usd", url: "https://evil.example/", click_url: "/go/web?u=x", condition: "pre_owned", position_role: "best_overall" },
  { title: "", retailer: "Nobody" },
  { title: "IKEA FRIHETEN sleeper", retailer: "IKEA", price_value: "not a number", condition: "haunted", position_role: "king" },
  ...Array.from({ length: 12 }, (_, index) => ({ title: `Filler ${index}`, retailer: "Shop" })),
]);
assert.strictEqual(sanitized.length, 8, "the shortlist is not bounded");
assert.strictEqual(sanitized[0].title, "Novogratz Brittany Sleeper Sofa");
assert.strictEqual(sanitized[0].currency, "USD");
assert.ok(!("url" in sanitized[0]) && !("click_url" in sanitized[0]), "links from the browser must never be carried: they would come back out signed");
assert.strictEqual(sanitized[1].price_value, null);
assert.strictEqual(sanitized[1].condition, "");
assert.strictEqual(sanitized[1].position_role, "");
assert.deepStrictEqual(sanitizeShortlist("nope"), []);

/* ---------------------------------------------------- the whole assistant */

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,title TEXT,brand TEXT,category TEXT,market TEXT,status TEXT,source TEXT,
    retailer_name TEXT,current_price REAL,original_price REAL,currency TEXT,rating REAL,review_count INTEGER,
    seller_name TEXT,seller_rating REAL,seller_feedback_count INTEGER,shipping_summary TEXT,return_summary TEXT,
    availability TEXT,checked_at TEXT,updated_at TEXT,image_url TEXT,affiliate_url TEXT,score REAL,
    shipping_cost REAL,evidence_confidence REAL,score_breakdown TEXT
  );
  CREATE TABLE price_history (product_id INTEGER,price REAL,currency TEXT,observed_at TEXT);
`);
const sourceSql = () => "source='ebay'";
const market = (code) => ({ code, currency: "USD" });

const sofaShortlist = [
  { title: "Novogratz Brittany Sleeper Sofa", retailer: "Walmart", price_value: 349, currency: "USD", position_role: "best_overall" },
  { title: "Zinus Josh Sofa Couch", retailer: "Target", price_value: 279, currency: "USD", position_role: "cheaper_option" },
  { title: "DHP Emily Futon Couch Bed", retailer: "Amazon", price_value: 189, currency: "USD", position_role: "lowest_price" },
];
const sofaHistory = [
  { role: "user", content: "find me a sofa I can sleep on, under $400" },
  { role: "assistant", content: "I would take the Novogratz for sleeping on." },
];
const sofaMission = { product_type: "sofa", use_case: "sleeping", budget_max: 400, brands: [], query_terms: ["sleeper sofa"] };

const router = (intent, positions = []) => ({
  output: [],
  output_text: JSON.stringify({
    scope: "shopping",
    needs_clarification: false,
    clarification_reason: "none",
    clarifying_questions: [],
    clarification_prompts: [],
    language: "en",
    social_reply: "",
    starts_new_mission: false,
    turn_intent: intent,
    referenced_positions: positions,
    mission_patch: {},
  }),
});

(async () => {
  /* 1. A question about the sofas on screen is answered about them. */
  {
    const calls = [];
    let retailerSearches = 0;
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      retailerSearch: async () => { retailerSearches += 1; return []; },
      client: {
        responses: {
          create: async (request) => {
            calls.push(request);
            if (request.text?.format?.name === "shopping_scope_guardrail") return router("about_shown", [1, 3]);
            if (request.text?.format?.name === "delia_shortlist_discussion") {
              return {
                output: [],
                output_text: JSON.stringify({
                  answer: "For sleeping on every night I'd go with the Novogratz at Walmart: it's a real sleeper with a flat surface, while the DHP futon at $189 saves you $160 but is thinner.",
                  follow_up: "Will someone sleep on it every night, or just guests now and then?",
                  referenced_positions: [1, 3],
                }),
              };
            }
            throw new Error(`unexpected model call: ${request.text?.format?.name}`);
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "which one can I actually sleep on every night, 1 or 3?",
      messages: sofaHistory,
      shoppingMission: sofaMission,
      shortlist: sofaShortlist,
      marketCode: "us",
      language: "en",
    });
    assert.strictEqual(retailerSearches, 0, "a question about the shown sofas searched the shops again");
    assert.ok(!calls.some((call) => call.tool_choice === "required"), "a question about the shown sofas ran a forced live search");
    assert.strictEqual(result.turn_kind, "discussion");
    assert.deepStrictEqual(result.recommendations, [], "a discussion must not replace the list the shopper is asking about");
    assert.ok(result.message.includes("Novogratz"), result.message);
    assert.strictEqual(result.message_source, "delia");
    assert.deepStrictEqual(result.referenced_positions, [1, 3]);
    assert.strictEqual(result.shopping_mission.product_type, "sofa", "the conversation forgot what it was shopping for");
    assert.strictEqual(result.shopping_mission.budget_max, 400, "the budget was dropped on a follow-up");

    const discussion = calls.find((call) => call.text?.format?.name === "delia_shortlist_discussion");
    const input = JSON.parse(discussion.input);
    assert.deepStrictEqual(input.shown_products.map((product) => product.title), sofaShortlist.map((item) => item.title));
    assert.ok(input.price_facts.includes("#3 is $160.00 cheaper than #1 (about 46% less)."), input.price_facts.join(" | "));
    assert.ok(/sleep/i.test(input.shopping_goal), "the shopper's use was not handed to the answer");
    assert.deepStrictEqual(input.referenced_positions, [1, 3]);
    assert.ok(/Do not recommend, name or suggest any product that is not in shown_products/.test(discussion.instructions));
    /* It may check a fact on the shown model's page, never go shopping. */
    assert.strictEqual(discussion.tool_choice, "auto");
    assert.ok(/Never use search to find other products/.test(discussion.instructions));
  }

  /* 2. The router timing out does not turn "number 2 or 3?" into a search. */
  {
    let searched = false;
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      retailerSearch: async () => { searched = true; return []; },
      scopeTimeoutMs: 50,
      client: {
        responses: {
          create: async (request, options) => {
            if (request.text?.format?.name === "shopping_scope_guardrail") {
              return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
            }
            if (request.tool_choice === "required") searched = true;
            return {
              output: [],
              output_text: JSON.stringify({
                answer: "Between those two, the Zinus is firmer and $70 cheaper, but only the DHP folds flat into a bed.",
                follow_up: "",
                referenced_positions: [2, 3],
              }),
            };
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "number 2 or 3?",
      messages: sofaHistory,
      shoppingMission: sofaMission,
      shortlist: sofaShortlist,
      marketCode: "us",
      language: "en",
    });
    assert.strictEqual(searched, false, "without the router, a question about the list became a search");
    assert.strictEqual(result.turn_kind, "discussion");
    assert.deepStrictEqual(result.referenced_positions, [2, 3]);
  }

  /* 3. The web look-up failing still gets an answer, from what she has. */
  {
    const discussionCalls = [];
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      client: {
        responses: {
          create: async (request) => {
            if (request.text?.format?.name === "shopping_scope_guardrail") return router("about_shown");
            discussionCalls.push(request);
            if (request.tools) throw new Error("search tool unavailable");
            return {
              output: [],
              output_text: JSON.stringify({
                answer: "I couldn't confirm the motor spec from the listing, so I'd check that before buying.",
                follow_up: "",
                referenced_positions: [],
              }),
            };
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "does it have a brushless motor? use only verified features",
      messages: [{ role: "user", content: "cordless drill under $150" }],
      shoppingMission: { product_type: "drill", brands: [], query_terms: [] },
      shortlist: [
        { title: "DEWALT 20V MAX Cordless Drill DCD771C2", retailer: "Home Depot", price_value: 129, currency: "USD" },
        { title: "BLACK+DECKER 20V MAX Drill LDX120C", retailer: "Walmart", price_value: 59, currency: "USD" },
      ],
      marketCode: "us",
      language: "en",
    });
    assert.strictEqual(discussionCalls.length, 2, "no fallback after the look-up failed");
    assert.ok(discussionCalls[0].tools && !discussionCalls[1].tools);
    assert.ok(result.message.includes("couldn't confirm"), result.message);
  }

  /* 4. Nothing at all to say still keeps the list and does not search. */
  {
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      client: {
        responses: {
          create: async (request) => {
            if (request.text?.format?.name === "shopping_scope_guardrail") return router("about_shown");
            throw new Error("model down");
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "какой из них лучше?",
      messages: sofaHistory,
      shoppingMission: sofaMission,
      shortlist: sofaShortlist,
      marketCode: "us",
      language: "ru",
    });
    assert.strictEqual(result.turn_kind, "discussion");
    assert.ok(/товары выше/.test(result.message), result.message);
    assert.strictEqual(result.message_source, "template");
  }

  /* 5. Naming a different kind of product is a new search, whatever the router
        says about it. */
  {
    let searched = false;
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      retailerSearch: async () => { searched = true; return []; },
      client: {
        responses: {
          create: async (request) => {
            if (request.text?.format?.name === "shopping_scope_guardrail") return router("about_shown");
            if (request.tool_choice === "required") searched = true;
            return { output: [], output_text: JSON.stringify({ answer: "", result_state: "no_match", conversation_title: "", follow_up: "", recommendations: [], comparison_notes: [], comparison: [] }) };
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "which laptop would you choose for school?",
      messages: sofaHistory,
      shoppingMission: sofaMission,
      shortlist: sofaShortlist,
      marketCode: "us",
      language: "en",
    });
    assert.strictEqual(searched, true, "a question about a laptop was answered from a list of sofas");
    assert.notStrictEqual(result.turn_kind, "discussion");
  }

  /* 6. "Show me other ones" searches, and leaves out what was already shown. */
  {
    const televisions = [
      { title: "TCL 65-Inch Q65 QLED 4K Smart TV", brand: "TCL", price: 449.99, id: "tcl-65" },
      { title: "Hisense 65-Inch U6 Mini-LED 4K Smart TV", brand: "Hisense", price: 497.99, id: "hisense-65" },
      { title: "Samsung 65-Inch Crystal UHD DU7200 4K Smart TV", brand: "Samsung", price: 479.99, id: "samsung-65" },
    ];
    const assistant = createShoppingAssistant({
      db, sourceSql, market,
      retailerSearch: async () =>
        televisions.map((tv) => ({
          external_id: tv.id,
          title: tv.title,
          brand: tv.brand,
          category: "televisions",
          current_price: tv.price,
          currency: "USD",
          image_url: `https://i.ebayimg.com/${tv.id}.jpg`,
          affiliate_url: `https://www.ebay.com/itm/${tv.id.length}0000${tv.price.toFixed(0)}`,
          retailer_name: "eBay",
          rating: 4.5,
          review_count: 200,
          checked_at: "2026-09-10T12:00:00Z",
        })),
      client: {
        responses: {
          create: async (request) => {
            if (request.text?.format?.name === "shopping_scope_guardrail") return router("more_options");
            if (request.text?.format?.name === "delia_shortlist_summary") throw new Error("summary skipped");
            return { output: [], output_text: JSON.stringify({ answer: "", result_state: "exact_matches", conversation_title: "65 inch TVs", follow_up: "", recommendations: [], comparison_notes: [], comparison: [] }) };
          },
        },
      },
    });
    const result = await assistant.respond({
      message: "show me other options",
      messages: [{ role: "user", content: "65 inch tv under $500" }, { role: "assistant", content: "Here are a few." }],
      shoppingMission: { product_type: "tv", size: "65 inch", budget_max: 500, brands: [], query_terms: ["65 inch tv"] },
      shortlist: [{ title: "TCL 65-Inch Q65 QLED 4K Smart TV", retailer: "eBay", price_value: 449.99, currency: "USD" }],
      marketCode: "us",
      language: "en",
    });
    const titles = result.recommendations.map((item) => item.title);
    assert.ok(titles.length >= 1, `the search for other options came back empty: ${JSON.stringify(result.message)}`);
    assert.ok(!titles.includes("TCL 65-Inch Q65 QLED 4K Smart TV"), `a product already shown came back as another option: ${titles.join(" | ")}`);
    assert.strictEqual(result.shopping_mission.budget_max, 500, "asking for other options dropped the budget");
  }

  /* 7. After a search, her own words about the final list, and the pick they
        name is the pick on the screen. */
  {
    const drills = [
      { title: "DEWALT 20V MAX XR Brushless Drill DCD791D2", brand: "DEWALT", price: 179, id: "dewalt-791" },
      { title: "BLACK+DECKER 20V MAX Cordless Drill LDX120C", brand: "BLACK+DECKER", price: 59, id: "bd-120" },
      { title: "Refurbished Makita XFD131 18V LXT Brushless Drill", brand: "Makita", price: 99, id: "makita-131" },
    ];
    const summaryInputs = [];
    const makeAssistant = (summaryReply) =>
      createShoppingAssistant({
        db, sourceSql, market,
        retailerSearch: async () =>
          drills.map((drill, index) => ({
            external_id: drill.id,
            title: drill.title,
            brand: drill.brand,
            category: "power drills",
            current_price: drill.price,
            currency: "USD",
            image_url: `https://i.ebayimg.com/${drill.id}.jpg`,
            affiliate_url: `https://www.ebay.com/itm/33300000${index}`,
            retailer_name: "eBay",
            rating: 4.7,
            review_count: 150,
            checked_at: "2026-09-10T12:00:00Z",
          })),
        client: {
          responses: {
            create: async (request) => {
              if (request.text?.format?.name === "shopping_scope_guardrail") return router("new_request");
              if (request.text?.format?.name === "delia_shortlist_summary") {
                summaryInputs.push(JSON.parse(request.input));
                return { output: [], output_text: JSON.stringify(summaryReply(JSON.parse(request.input))) };
              }
              return { output: [], output_text: JSON.stringify({ answer: "", result_state: "exact_matches", conversation_title: "Cordless drill", follow_up: "", recommendations: [], comparison_notes: [], comparison: [] }) };
            },
          },
        },
      });

    const liked = await makeAssistant((input) => {
      const dewalt = input.shown_products.find((product) => /DEWALT/.test(product.title)).position;
      const makita = input.shown_products.find((product) => /Makita/.test(product.title)).position;
      return {
        answer: "For weekend furniture builds I'd take the DEWALT: brushless, and it will outlast the BLACK+DECKER, which is fine for hanging pictures. The Makita is cheaper but refurbished.",
        pick_position: dewalt,
        pick_reason: "Brushless motor for regular DIY use",
        notes: [{ position: makita, note: "Refurbished" }],
        follow_up: "",
      };
    }).respond({ message: "cordless drill under $200 for weekend DIY", messages: [], marketCode: "us", language: "en" });

    assert.strictEqual(liked.message_source, "delia");
    assert.ok(liked.message.startsWith("For weekend furniture builds"), liked.message);
    const pick = liked.recommendations.find((item) => item.position_role === "best_overall");
    assert.ok(pick && /DEWALT/.test(pick.title), `the pick on screen is not the one she named: ${pick?.title}`);
    assert.strictEqual(liked.recommendations[0], pick, "her pick is not first");
    assert.strictEqual(pick.pick_reason, "Brushless motor for regular DIY use");
    const makita = liked.recommendations.find((item) => /Makita/.test(item.title));
    assert.strictEqual(makita.note, "Refurbished");
    assert.strictEqual(makita.condition, "refurbished");
    assert.strictEqual(makita.position_role, "alternative", "refurbished stock that is not the cheapest got a price group");
    assert.ok(summaryInputs[0].price_facts.some((fact) => fact.startsWith("Lowest new price: ")), summaryInputs[0].price_facts.join(" | "));

    /* A summary naming something that is not on the screen is not used. */
    const unshown = await makeAssistant(() => ({
      answer: "Honestly the Milwaukee M18 is the one to get.",
      pick_position: 1,
      pick_reason: "",
      notes: [],
      follow_up: "",
    })).respond({ message: "cordless drill under $200 for weekend DIY", messages: [], marketCode: "us", language: "en" });
    assert.strictEqual(unshown.message_source, "template", "a summary naming an unshown drill was shown");
    assert.ok(!/Milwaukee/.test(unshown.message));
  }

  console.log("Delia conversation memory passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
