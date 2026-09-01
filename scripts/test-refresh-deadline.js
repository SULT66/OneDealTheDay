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
  /Promise\.race\(\[\s*provider\.search\(\{market\}\)/.test(registry),
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
 * The eBay budget has to fit inside one night.
 *
 * Raising it to 200 eligible with details fetched six at a time is what pushed
 * a run past 57 minutes. These numbers are the ones that fit; they are asserted
 * so the next person raising them sees why they are where they are.
 */
const ebay = fs.readFileSync(path.join(__dirname, "..", "src", "providers", "ebay.js"), "utf8");
const number = (name) => Number(new RegExp(`const ${name} = (\\d+)`).exec(ebay)?.[1]);

assert(number("DEFAULT_TARGET_ELIGIBLE") <= 140, "The eBay run is asking for more than a night can deliver");
assert(number("DEFAULT_TARGET_ELIGIBLE") >= 90, "The eBay run is back below what fills the thin categories");
assert(number("DETAIL_CONCURRENCY") >= 8, "Detail lookups are serialised enough to run the night out again");

const detailRounds = Math.ceil(number("DEFAULT_DETAIL_LIMIT") / number("DETAIL_CONCURRENCY"));
/* Each detail call may take up to its own ten second timeout. Thirty rounds is
   five minutes of worst case, which fits; sixty seven rounds did not. */
assert(
  detailRounds <= 30,
  `Detail lookups need ${detailRounds} rounds; at ten seconds each that is longer than a nightly run can wait`,
);

console.log("Refresh deadline and eBay budget checks passed.");
