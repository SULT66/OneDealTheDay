/*
 * Finding an old Delia conversation by what was said in it.
 *
 * The sidebar used to be titles only, and a title is written from the first
 * question — "hi, can you help me" hides a whole conversation about a PS5.
 * These are the cases the search has to get right for that to stop being true,
 * including the one that decided it is done in JavaScript: people ask Delia in
 * Russian, and SQLite's LIKE folds case for ASCII only.
 */
const assert = require("assert");
const { MAX_QUERY, matchConversations, normalizeQuery, snippetAround } = require("../src/deliaConversationSearch");

const conversations = [
  { id: 1, title: "Compact iPhone 17 Pro", updated_at: "2026-09-11" },
  { id: 2, title: "hi, can you help me", updated_at: "2026-09-03" },
  { id: 3, title: "Large-screen TV", updated_at: "2026-08-29" },
  { id: 4, title: "Кроссовки", updated_at: "2026-08-20" },
];
const messages = [
  { conversation_id: 1, content: "I want a compact iPhone 17 Pro, unlocked" },
  { conversation_id: 1, content: "Here are the cheapest unlocked options I found." },
  { conversation_id: 2, content: "hi, can you help me" },
  { conversation_id: 2, content: "Sure — what are you shopping for?" },
  { conversation_id: 2, content: "I need a PlayStation 5 for my son's birthday, the digital edition is fine" },
  { conversation_id: 3, content: "Show me 65 inch TVs under a thousand" },
  { conversation_id: 4, content: "найди мне кроссовки для бега до ста долларов" },
];

const ids = (list) => list.map((item) => item.id);

/* No query, no filtering: the list is exactly what it was. */
assert.strictEqual(matchConversations(conversations, messages, ""), conversations);
assert.strictEqual(matchConversations(conversations, messages, "   "), conversations);

/* The case the change exists for: the title says nothing, the conversation does. */
const ps5 = matchConversations(conversations, messages, "playstation");
assert.deepStrictEqual(ids(ps5), [2], "a conversation whose title does not mention the product was not found");
assert.match(ps5[0].snippet, /PlayStation 5/, "the snippet should show the words that matched");

/* Case folding in both directions, in English. */
assert.deepStrictEqual(ids(matchConversations(conversations, messages, "IPHONE")), [1]);

/*
 * And in Russian, which is the reason this is not a LIKE query. "Кроссовки"
 * with a capital must find "кроссовки", and a lower-case search must find the
 * capitalised title.
 */
assert.deepStrictEqual(ids(matchConversations(conversations, messages, "КРОССОВКИ")), [4]);
assert.deepStrictEqual(ids(matchConversations(conversations, messages, "для бега")), [4]);

/* A title match needs no snippet — the title is already on the screen. */
assert.strictEqual(matchConversations(conversations, messages, "large-screen")[0].snippet, "");

/* Nothing found is an empty list, not the whole list. */
assert.deepStrictEqual(matchConversations(conversations, messages, "washing machine"), []);

/* Order is preserved: most recent first, as the list already was. */
assert.deepStrictEqual(ids(matchConversations(conversations, messages, "unlocked")), [1]);
assert.deepStrictEqual(ids(matchConversations(conversations, messages, "e")), [1, 2, 3]);

/* Queries are trimmed, collapsed and capped. */
assert.strictEqual(normalizeQuery("  play   station  "), "play station");
assert.strictEqual(normalizeQuery("x".repeat(500)).length, MAX_QUERY);

/* Snippets are cut at word boundaries and say so when they are cut. */
const long = "The first part of a long answer about televisions, and then the word Samsung appears here, followed by a great deal more text that goes on.";
const snip = snippetAround(long, long.indexOf("Samsung"), "samsung".length);
assert.ok(snip.includes("Samsung"));
assert.ok(snip.startsWith("…") && snip.endsWith("…"), `expected ellipses on a cut snippet: ${snip}`);
assert.ok(!/^…\S*\s?$/.test(snip), "the snippet should not start mid-word");
/* A short message is shown whole, with no ellipsis. */
assert.strictEqual(snippetAround("buy a PS5", 6, 3), "buy a PS5");

console.log("Delia conversation search passed.");
