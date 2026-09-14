/*
 * Finding an old conversation with Delia by what was said in it.
 *
 * The list used to be titles and dates, and a title is one line written from
 * the first question. Somebody looking for "the PS5 conversation" who had
 * opened with "hi, can you help me" had no way to find it except scrolling and
 * opening each one in turn.
 *
 * This searches the words of every message as well as the title. It is done
 * here in JavaScript rather than with LIKE in SQL for one reason that matters
 * on this site: SQLite folds case for ASCII only, so "PlayStation" would find
 * "playstation" while "Кроссовки" would never find "кроссовки" — and people
 * ask Delia in Russian. toLocaleLowerCase folds both.
 *
 * The cost is bounded by what is kept: a user's conversations are capped, so
 * this reads at most that many conversations' messages, once per search.
 */

const MAX_QUERY = 80;
const SNIPPET_RADIUS = 48;

const fold = (value) => String(value || "").toLocaleLowerCase();

/** A search term, or "" when there is nothing worth searching for. */
function normalizeQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

/*
 * The words around the match, so the list can show why a conversation came
 * back. Cut at spaces where it can be, and marked with an ellipsis where it
 * was cut, so it never reads as a whole sentence when it is not one.
 */
function snippetAround(text, index, length) {
  const source = String(text || "").replace(/\s+/g, " ");
  let start = Math.max(0, index - SNIPPET_RADIUS);
  let end = Math.min(source.length, index + length + SNIPPET_RADIUS);
  if (start > 0) {
    const space = source.indexOf(" ", start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < source.length) {
    const space = source.lastIndexOf(" ", end);
    if (space > index + length) end = space;
  }
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

/**
 * The conversations that mention `query`, in the order they were given, each
 * with a snippet of the first message that matched.
 *
 * @param {Array<{id:number,title:string}>} conversations
 * @param {Array<{conversation_id:number,content:string}>} messages in reading order
 * @param {string} query
 */
function matchConversations(conversations, messages, query) {
  const term = normalizeQuery(query);
  if (!term) return conversations;
  const needle = fold(term);

  /* First match per conversation only: the snippet explains the hit, it is not
     a list of every place the word appears. */
  const firstHit = new Map();
  for (const message of messages) {
    if (firstHit.has(message.conversation_id)) continue;
    const content = String(message.content || "");
    const at = fold(content).indexOf(needle);
    if (at !== -1) firstHit.set(message.conversation_id, snippetAround(content, at, needle.length));
  }

  return conversations
    .filter((conversation) => fold(conversation.title).includes(needle) || firstHit.has(conversation.id))
    .map((conversation) => ({
      ...conversation,
      /* A title match needs no snippet: the title is already on screen. */
      snippet: fold(conversation.title).includes(needle) ? "" : firstHit.get(conversation.id) || "",
    }));
}

module.exports = { MAX_QUERY, matchConversations, normalizeQuery, snippetAround };
