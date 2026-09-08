const assert = require("assert");
const fs = require("fs");
const path = require("path");

/*
 * One slow source must not cost the whole nightly refresh.
 *
 * Every individual HTTP call in every provider already has a timeout. What was
 * missing was a limit on how many of them one source may make the run wait
 * for: a refresh ran for 57 minutes while the workflow watching it gave up at
 * 25 and reported a failure against a catalogue that was still being written.
 */

const registry = fs.readFileSync(path.join(__dirname, "..", "src", "providers", "registry.js"), "utf8");

assert(
  /const PROVIDER_DEADLINE_MS = Number\(process\.env\.SOURCE_REFRESH_DEADLINE_MS/.test(registry),
  "The per-source deadline is gone, so one slow source can hold a refresh open indefinitely",
);
assert(
  /Promise\.race\(\[\s*provider\.search\(/.test(registry),
  "Provider searches are no longer raced against a deadline",
);
/* Reported as a failure of that source, not swallowed: a category that stops
   being refreshed should be visible in the run report rather than quietly
   ageing out of the catalogue. */
assert(
  /did not finish within/.test(registry),
  "A source that runs out of time no longer says so",
);

/*
 * The deadline has to stop the work, not just stop waiting for it.
 *
 * Racing a promise leaves the loser running. Two eBay runs abandoned that way
 * carried on calling the Browse API in the background and spent the day's
 * whole call allowance; every market then failed with "The request limit has
 * been reached for the resource."
 */
assert(
  /new AbortController\(\)/.test(registry),
  "The deadline no longer cancels the source it gave up on, so abandoned work keeps calling out",
);
/* The call also spreads the market's own slice of the daily allowance, so the
   match stops at the signal rather than at the closing brace. */
assert(
  /provider\.search\(\{market, signal:controller\.signal/.test(registry),
  "Sources are no longer given the signal that tells them the run stopped waiting",
);
assert(
  /rotate:!keywords/.test(registry),
  "The scheduled sweep no longer rotates its keywords, or a shopper's own query does",
);

/*
 * The eBay budget has to fit inside one night *and* inside one day's call
 * allowance.
 *
 * Wall time was the first constraint: 200 eligible with details fetched six at
 * a time pushed a run past 57 minutes. The allowance turned out to be the
 * tighter one. A run spends one call per search term plus one per item it
 * examines, so 48 terms and 220 lookups cost close to 270 calls in each of the
 * five markets. Nine sweeps in a day — the schedule plus one after every
 * deploy — exhausted the allowance, and every market went dark.
 *
 * Coverage does not come from spending more in a single run. Products stay in
 * the catalogue for 48 hours after they were last seen, so runs accumulate,
 * and a rotating slice of the keyword list reaches categories that previously
 * lost the whole detail budget to louder ones.
 */
const ebay = fs.readFileSync(path.join(__dirname, "..", "src", "providers", "ebay.js"), "utf8");
const number = (name) => Number(new RegExp(`const ${name} = (\\d+)`).exec(ebay)?.[1]);

const callsPerMarketRun = number("KEYWORDS_PER_RUN") + number("DEFAULT_DETAIL_LIMIT");
/* Five markets a sweep, and several sweeps a day across the scheduled run and
   each market's own drop time. Anything above this and a normal day runs the
   allowance out again. */
assert(
  callsPerMarketRun <= 130,
  `One market's run may ask eBay ${callsPerMarketRun} questions; across five markets and a day's runs that spends the allowance again`,
);
assert(
  number("DEFAULT_TARGET_ELIGIBLE") <= number("DEFAULT_DETAIL_LIMIT"),
  "The run wants more eligible products than it is allowed to look at, so it always exhausts its budget",
);
assert(number("DEFAULT_TARGET_ELIGIBLE") >= 40, "The eBay run is back below what keeps the thin categories stocked");
assert(number("DETAIL_CONCURRENCY") >= 8, "Detail lookups are serialised enough to run the night out again");

const detailRounds = Math.ceil(number("DEFAULT_DETAIL_LIMIT") / number("DETAIL_CONCURRENCY"));
/* Each detail call may take up to its own ten second timeout. Thirty rounds is
   five minutes of worst case, which fits; sixty seven rounds did not. */
assert(
  detailRounds <= 30,
  `Detail lookups need ${detailRounds} rounds; at ten seconds each that is longer than a nightly run can wait`,
);


/* ------------------------------------- the deadline has to fit the budget */

/*
 * Eight minutes was right for sixteen keywords and ninety detail calls. When
 * the primary market was given the allowance the other four were wasting — the
 * whole keyword list and up to two hundred and sixty details, roughly three
 * hundred calls against a hundred and six — the ceiling stayed at eight and the
 * American run failed every time. A triggered refresh showed it within the
 * minute: "eBay Browse API did not finish within 8 minutes", found 0.
 *
 * Raising a budget without raising the time to spend it turns an intermittent
 * failure into a certain one, so the deadline is derived from the budget and
 * cannot be left behind by the next change to it.
 */
assert(
  /function deadlineFor\(market\)/.test(registry),
  "the deadline is a constant again, so a larger budget cannot be spent inside it",
);
assert(
  /budget\.detailLimit/.test(registry),
  "the deadline no longer takes account of how much the source was asked for",
);

{
  const config = require("../src/config");
  const primary = config.marketConfig(config.primaryMarket);
  const secondary = config.marketConfig(
    config.markets.find((code) => code !== config.primaryMarket) || "ca",
  );
  const callsFor = (market) => {
    const budget = market.searchBudget || {};
    const searches = Number(budget.keywordsPerRun) || (market.searchKeywords || []).length;
    return Number(budget.detailLimit || 0) + searches;
  };
  assert(
    callsFor(primary) > callsFor(secondary),
    "the primary market no longer carries the larger share of the allowance",
  );
}


/* ------------------------------ a stopped source keeps what it already had */

/*
 * A run spent twenty minutes calling eBay, had listings in hand, and reported
 * found: 0 — because the deadline rejected rather than asking the source to
 * stop. Every one of those calls came out of the daily allowance and bought
 * nothing, which is also why raising the budget kept making things worse: a
 * bigger ask made the window more likely to close, and closing it was total
 * loss instead of partial gain.
 */
/* Milliseconds, not minutes: the behaviour under test is what happens at the
   deadline, and the suite should not wait eight minutes to watch it. Set
   before the module is required, since it reads these once at load. */
process.env.SOURCE_REFRESH_DEADLINE_MS = "150";
process.env.SOURCE_ABANDON_GRACE_MS = "300";
const { runWithDeadline } = require("../src/providers/registry");

(async () => {
  /* The deadline timers are unref'd so a refresh can never hold the process
     open. In a bare script that means Node exits before they fire and this
     whole block silently does nothing — which it did, and passed. */
  const keepAlive = setInterval(() => {}, 20);
  const market = {code:"us", searchKeywords:["a"], searchBudget:{detailLimit:1, keywordsPerRun:1}};
  const slowButObedient = {
    name: "Test source",
    /* Behaves the way the real ones do: watches its signal and hands back what
       it gathered rather than throwing the work away. */
    search: ({signal}) => new Promise((resolve) => {
      /* Not on the abort event itself, which is what the first version of this
         fixture did — and it passed against the old rejecting code, because
         both settled on the same event and the provider happened to be
         registered first. A real source finishes its in-flight calls before it
         returns, so the resolve lands after the abort rather than with it, and
         that gap is exactly what the old code lost the harvest in. */
      const finish = () => setTimeout(() => resolve(["gathered"]), 80);
      if (signal.aborted) return finish();
      signal.addEventListener("abort", finish, {once:true});
    }),
  };

  const started = Date.now();
  const kept = await runWithDeadline(slowButObedient, market);
  assert.deepStrictEqual(
    kept,
    ["gathered"],
    "a source stopped at its deadline has its work thrown away again",
  );
  assert(
    Date.now() - started < 60000,
    "the deadline no longer stops the source promptly",
  );

  /* And a source that ignores the signal entirely still cannot hold the run. */
  const deaf = {name:"Deaf source", search: () => new Promise(() => {})};
  await assert.rejects(
    runWithDeadline(deaf, market),
    /did not finish within/,
    "a source that ignores its signal can hold a refresh open forever",
  );

  clearInterval(keepAlive);
  console.log("Partial-harvest check passed: a stopped source keeps what it gathered.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

console.log("Refresh deadline and eBay budget checks passed.");
