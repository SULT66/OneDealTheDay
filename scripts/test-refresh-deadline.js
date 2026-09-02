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
assert(
  /provider\.search\(\{market, signal:controller\.signal\}\)/.test(registry),
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

console.log("Refresh deadline and eBay budget checks passed.");
