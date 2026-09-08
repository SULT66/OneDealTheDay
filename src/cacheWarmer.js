/*
 * Render the busiest pages before a person asks for them.
 *
 * The HTML cache (src/htmlCache.js) took the first request after a quiet spell
 * from fourteen seconds to under two, because most visitors now get a copy
 * that was already made. What it cannot do is make the copy in the first
 * place: someone has to pay for the render that fills the cache, and with this
 * site's traffic that someone is usually a real visitor.
 *
 * So this pays instead. Every few minutes it asks for the entry pages over the
 * loopback, which fills the cache exactly as a visitor's request would, and
 * the visitor who arrives next gets bytes out of memory.
 *
 * The pacing is the careful part, and it is not caution for its own sake. The
 * plan has one core and Node has one thread, so a page being rendered occupies
 * the whole server: measured on production, a search page rendering for twelve
 * seconds left the request behind it — a cache hit needing no work at all —
 * waiting thirteen. A warmer that asked for everything at once would spend a
 * minute of every cycle making the site slower than not having it. Hence one
 * page at a time, spaced, and few pages.
 *
 * Which pages: the entry points for the primary market only. Warming five
 * markets and a catalogue of deal pages would cost more core time than it
 * saves, and the traffic is not there to justify it. WARM_PATHS overrides the
 * list without a deploy if that changes.
 */

/* Under the ten-minute cache TTL, so an entry is replaced rather than allowed
   to lapse and be rebuilt by whoever shows up. */
const DEFAULT_INTERVAL_MS = 8 * 60 * 1000;
/* Long enough that two renders never overlap, on a box where one render can
   hold the thread for several seconds. */
const DEFAULT_SPACING_MS = 20 * 1000;
/* Nothing here is worth blocking on: a warm request that hangs must not keep
   the next cycle from running. */
const REQUEST_TIMEOUT_MS = 45 * 1000;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function pathsFor(market, override) {
  const configured = String(override || "").trim();
  if (configured) return configured.split(",").map(part => part.trim()).filter(Boolean);
  return [`/${market}`, `/${market}/daily-drop`];
}

/**
 * Keep the cache populated. Returns a stop function.
 */
function startCacheWarmer({
  baseUrl,
  market = "us",
  paths,
  intervalMs = DEFAULT_INTERVAL_MS,
  spacingMs = DEFAULT_SPACING_MS,
  fetchImpl = global.fetch,
  log = console,
  onCycle,
} = {}) {
  const targets = paths || pathsFor(market);
  let running = false;
  let stopped = false;

  async function warmOne(path) {
    const started = Date.now();
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers: {
          /* Says plainly what this is, in the access log and to anything that
             later wants to tell a warm request from a person. */
          "user-agent": "OneDailyDrop-CacheWarmer",
          "accept": "text/html",
          /* The cache stores gzip as gzip; asking for it means the entry we
             leave behind is the one a real browser can be given. */
          "accept-encoding": "gzip",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      /* The body has to be drained, or the response is never finished and the
         cache never stores it. */
      await response.arrayBuffer();
      return { path, status: response.status, ms: Date.now() - started, cache: response.headers.get("x-odd-cache") };
    } catch (error) {
      return { path, error: error.message, ms: Date.now() - started };
    }
  }

  async function cycle() {
    /* A cycle that outlives its interval must not have a second one started on
       top of it — that is the overlap this whole file is arranged to avoid. */
    if (running || stopped) return;
    running = true;
    const results = [];
    try {
      for (const path of targets) {
        if (stopped) break;
        results.push(await warmOne(path));
        if (!stopped && path !== targets[targets.length - 1]) await wait(spacingMs);
      }
    } finally {
      running = false;
      if (onCycle) onCycle(results);
      const failed = results.filter(result => result.error || result.status >= 400);
      if (failed.length) {
        log.warn?.(`[warm] ${failed.map(f => `${f.path}: ${f.error || f.status}`).join(", ")}`);
      }
    }
  }

  const timer = setInterval(cycle, intervalMs);
  timer.unref?.();
  /* Not on the very first tick: a process that has just started is already
     busy, and the deploy's own health check is the request that matters. */
  const first = setTimeout(cycle, spacingMs);
  first.unref?.();

  return function stop() {
    stopped = true;
    clearInterval(timer);
    clearTimeout(first);
  };
}

module.exports = { startCacheWarmer, pathsFor, DEFAULT_INTERVAL_MS, DEFAULT_SPACING_MS };
