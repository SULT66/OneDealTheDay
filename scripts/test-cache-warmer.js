/*
 * The cache warmer.
 *
 * The behaviour worth protecting here is not "does it fetch" — it is the
 * pacing. The plan has one core and Node has one thread, so two renders at
 * once means the second waits and everything behind it waits too: on
 * production a twelve-second search render left the request after it, a cache
 * hit needing no work, waiting thirteen seconds. A warmer that lost its
 * spacing would spend part of every cycle making the site slower than having
 * no warmer at all. So most of this file is about overlap.
 */

const assert = require("assert");
const { startCacheWarmer, pathsFor } = require("../src/cacheWarmer");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  /* --- Which pages, and how they can be overridden. --- */
  assert.deepStrictEqual(pathsFor("us"), ["/us", "/us/daily-drop"]);
  assert.deepStrictEqual(pathsFor("de"), ["/de", "/de/daily-drop"]);
  assert.deepStrictEqual(
    pathsFor("us", "/us, /us/stores ,/us/about"),
    ["/us", "/us/stores", "/us/about"],
    "WARM_PATHS overrides the list without a deploy",
  );
  assert.deepStrictEqual(pathsFor("us", "   "), ["/us", "/us/daily-drop"], "blank falls back to the default");

  /* --- One page at a time, never two. --- */
  {
    let inFlight = 0;
    let maxInFlight = 0;
    const requested = [];
    const fetchImpl = async (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requested.push(new URL(url).pathname);
      await sleep(30);
      inFlight -= 1;
      return {
        status: 200,
        headers: { get: () => "MISS" },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };

    let cycles = 0;
    const stop = startCacheWarmer({
      baseUrl: "http://127.0.0.1:1234",
      paths: ["/us", "/us/daily-drop", "/us/stores"],
      intervalMs: 10_000,
      spacingMs: 20,
      fetchImpl,
      onCycle: () => { cycles += 1; },
    });

    await sleep(400);
    stop();

    assert.strictEqual(maxInFlight, 1, "never two renders at once");
    assert.strictEqual(cycles, 1, "one cycle inside the interval");
    assert.deepStrictEqual(requested, ["/us", "/us/daily-drop", "/us/stores"], "every page, in order");
  }

  /* --- A slow cycle is not overlapped by the next one. ---
     This is the failure that matters: if a cycle outlives its interval and a
     second starts on top of it, the warmer is doing exactly the thing it
     exists to prevent. */
  {
    let calls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async () => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(120);
      inFlight -= 1;
      return { status: 200, headers: { get: () => "MISS" }, arrayBuffer: async () => new ArrayBuffer(0) };
    };

    const stop = startCacheWarmer({
      baseUrl: "http://127.0.0.1:1234",
      paths: ["/us", "/us/daily-drop"],
      /* Deliberately shorter than one cycle takes. */
      intervalMs: 40,
      spacingMs: 10,
      fetchImpl,
    });

    await sleep(500);
    stop();
    assert.strictEqual(maxInFlight, 1, "a slow cycle is never overlapped by the next");
    assert.ok(calls >= 2, "it does keep going");
  }

  /* --- A page that fails does not stop the rest, or the next cycle. --- */
  {
    const seen = [];
    let cycles = 0;
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      seen.push(path);
      if (path === "/us") throw new Error("connection refused");
      return { status: 200, headers: { get: () => "MISS" }, arrayBuffer: async () => new ArrayBuffer(0) };
    };

    const stop = startCacheWarmer({
      baseUrl: "http://127.0.0.1:1234",
      paths: ["/us", "/us/daily-drop"],
      intervalMs: 60,
      spacingMs: 5,
      fetchImpl,
      log: { warn: () => {} },
      onCycle: (results) => {
        cycles += 1;
        if (cycles === 1) {
          assert.strictEqual(results.length, 2, "both pages attempted");
          assert.match(results[0].error, /connection refused/);
          assert.strictEqual(results[1].status, 200, "the second page still ran");
        }
      },
    });

    await sleep(300);
    stop();
    assert.ok(cycles >= 2, "a failure does not end the schedule");
  }

  /* --- stop() actually stops, including mid-cycle. --- */
  {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      await sleep(30);
      return { status: 200, headers: { get: () => "MISS" }, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const stop = startCacheWarmer({
      baseUrl: "http://127.0.0.1:1234",
      paths: ["/us", "/us/daily-drop", "/us/stores"],
      intervalMs: 50,
      spacingMs: 40,
      fetchImpl,
    });
    await sleep(80);
    stop();
    const afterStop = calls;
    await sleep(250);
    assert.strictEqual(calls, afterStop, "nothing is requested after stop()");
  }

  /* --- The body is drained. ---
     A response whose body is never read is never finished, and the cache
     stores nothing — the warmer would run forever, warming nothing. */
  {
    let drained = 0;
    const fetchImpl = async () => ({
      status: 200,
      headers: { get: () => "MISS" },
      arrayBuffer: async () => { drained += 1; return new ArrayBuffer(0); },
    });
    const stop = startCacheWarmer({
      baseUrl: "http://127.0.0.1:1234",
      paths: ["/us"],
      intervalMs: 10_000,
      spacingMs: 5,
      fetchImpl,
    });
    await sleep(120);
    stop();
    assert.strictEqual(drained, 1, "the body is read, so the response completes and the cache stores it");
  }

  console.log("cache warmer: ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
