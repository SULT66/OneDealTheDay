/*
 * Serve a page that has already been rendered instead of rendering it again.
 *
 * Every page on this site is rendered from scratch for every visitor. Nothing
 * caches: the routes are all dynamic (the root layout reads request headers to
 * put a truthful `lang` on the document, which opts every route out of Next's
 * static rendering), so Next sends `no-store` and neither the browser nor any
 * proxy keeps a copy. On the single core of a B1 plan that costs 1–3 seconds
 * warm, and 14–18 seconds for the first request after a quiet spell. Measured
 * against production, not guessed.
 *
 * There was already a cache here meant to do exactly this. It had never once
 * run. Two things were wrong with it and each alone was fatal:
 *
 *   1. Its paths were the old bare URLs — /deal/123, /about — and the site has
 *      served everything under a market segment for months. /us/deal/123 never
 *      matched. (Patching just the regex was the obvious fix, and it changed
 *      nothing, which is how the second reason surfaced.)
 *   2. It captured the body by wrapping `res.send`. Express's `res.send` is
 *      not how these pages are written: Next streams straight to the response
 *      socket, so the wrapper never fired and the cache stayed empty.
 *
 * So this captures at the socket instead, and it tees rather than buffers: the
 * bytes go to the visitor exactly as they do now, and a copy is kept on the
 * way past. A miss is therefore never slower than no cache at all, and no
 * streaming behaviour changes for the person waiting.
 *
 * What this does not do is make the first render fast. It makes it rare — one
 * visitor per page per TTL pays it instead of every visitor. With this site's
 * traffic that is the difference between everyone seeing 14 seconds and almost
 * nobody seeing it. The render itself is a separate piece of work.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;
/* Search is the one page whose content follows a query rather than the daily
   catalogue refresh, so it gets a shorter life. */
const SEARCH_TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 300;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/*
 * Pages that are the same for everybody who asks in the same language.
 *
 * Deliberately absent: /account and /saved (one person's own things), /live
 * (a drop's stock and clock change by the second), and /admin. The market
 * segment is optional so a bare /about — which redirects, but may not always —
 * cannot quietly fall through to a different rule than /us/about.
 */
const CACHEABLE_PATH =
  /^(?:\/(?:us|ca|uk|fr|de))?\/?(?:|daily-drop|stores|search|archive|brands|about|contact|privacy|terms|affiliate-disclosure|editorial-policy|how-we-select-deals|price-disclaimer|for-retailers|deal\/[^/]+|category|category\/[^/]+|brand\/[^/]+)\/?$/;

const isSearch = (path) => /\/search\/?$/.test(path);

/*
 * Which of the response's own headers describe the bytes we kept.
 *
 * Content-Encoding is the one that matters and the one it would be easy to
 * drop: Next compresses its own output, so what arrives at the socket is
 * usually gzip. Replaying those bytes without saying so serves a visitor
 * compressed data labelled as plain text, which renders as garbage.
 */
const DESCRIBING_HEADERS = ["content-type", "content-encoding", "vary", "x-robots-tag", "content-language"];

/* A cached gzip body is useless to a client that did not ask for gzip. Rare
   enough to simply not answer from cache rather than to hold both forms. */
function encodingAccepted(entry, acceptEncoding) {
  const encoding = entry.headers["content-encoding"];
  if (!encoding) return true;
  return String(acceptEncoding || "")
    .toLowerCase()
    .split(",")
    .map(part => part.split(";")[0].trim())
    .includes(String(encoding).toLowerCase());
}

function htmlCache(options = {}) {
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const searchTtlMs = options.searchTtlMs || SEARCH_TTL_MS;
  const maxEntries = options.maxEntries || MAX_ENTRIES;
  const now = options.now || (() => Date.now());
  const entries = new Map();

  const middleware = (req, res, next) => {
    if (req.method !== "GET") return next();
    const path = req.path;
    if (!CACHEABLE_PATH.test(path)) return next();

    /* The language is decided per request by the middleware in front of this
       one and changes the whole document, so it belongs in the key rather
       than being hoped away. The URL carries the market and the query. */
    const key = `${req.language || "en"}:${req.originalUrl}`;
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now() && encodingAccepted(hit, req.headers["accept-encoding"])) {
      /* Touch it so the eviction below drops what nobody asks for rather than
         whatever happens to be oldest. */
      entries.delete(key);
      entries.set(key, hit);
      for (const [name, value] of Object.entries(hit.headers)) res.set(name, value);
      return res.set("X-ODD-Cache", "HIT").status(200).end(hit.body);
    }
    if (hit) entries.delete(key);

    /*
     * Tee the response. The visitor's bytes are untouched — every call is
     * passed straight through — and a copy accumulates alongside. If it grows
     * past the cap we stop collecting and let the response finish normally;
     * a page too big to keep is a page served, not a page broken.
     */
    const chunks = [];
    let bytes = 0;
    let collecting = true;
    const collect = (chunk, encoding) => {
      if (!collecting || chunk == null) return;
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
      bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) {
        collecting = false;
        chunks.length = 0;
        return;
      }
      chunks.push(buffer);
    };

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = function write(chunk, encoding, callback) {
      collect(chunk, encoding);
      return originalWrite(chunk, encoding, callback);
    };

    res.end = function end(chunk, encoding, callback) {
      /* res.end() is also called as end(callback) and end(chunk, callback);
         only a real chunk is body. */
      if (typeof chunk !== "function") collect(chunk, encoding);
      store();
      return originalEnd(chunk, encoding, callback);
    };

    function store() {
      res.write = originalWrite;
      res.end = originalEnd;
      if (!collecting || res.statusCode !== 200) return;
      if (!/^text\/html/i.test(String(res.get("content-type") || ""))) return;
      /* A response that sets a cookie is carrying something about this one
         visitor, whatever the body looks like. Not ours to hand to the next
         person. */
      if (res.get("set-cookie")) return;

      const headers = {};
      for (const name of DESCRIBING_HEADERS) {
        const value = res.get(name);
        if (value) headers[name] = value;
      }

      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, {
        body: Buffer.concat(chunks),
        headers,
        expiresAt: now() + (isSearch(path) ? searchTtlMs : ttlMs),
      });
    }

    res.set("X-ODD-Cache", "MISS");
    return next();
  };

  /* Exposed for the tests and for anything that needs to drop the lot — a
     catalogue refresh publishes new prices, and a page promising yesterday's
     is worse than a slow one. */
  middleware.clear = () => entries.clear();
  middleware.size = () => entries.size;
  return middleware;
}

module.exports = { htmlCache, CACHEABLE_PATH };
