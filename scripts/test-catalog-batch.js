const assert = require("node:assert/strict");
const { presentCatalogBatch } = require("../src/catalogBatch");
const { formatter } = require("../src/intlFormatters");

(async () => {
  // A competing request can run before a large cold catalogue has finished.
  let otherRequestServed = false;
  setImmediate(() => { otherRequestServed = true; });
  let calls = 0;
  const rows = Array.from({length: 1001}, (_, i) => i);
  const first = presentCatalogBatch("cold-us", rows, value => { calls++; return value * 2; });
  const second = presentCatalogBatch("cold-us", rows, () => { throw new Error("duplicate work"); });
  assert.strictEqual(first, second);
  assert.deepEqual(await first, rows.map(n => n * 2));
  assert.equal(calls, rows.length);
  assert.equal(otherRequestServed, true);
  await assert.rejects(presentCatalogBatch("failure", rows, () => { throw new Error("bad row"); }), /bad row/);
  assert.deepEqual(await presentCatalogBatch("failure", [1], n => n), [1], "a failed job must not poison subsequent reads");

  // Output must match the uncached formatter across markets and currencies.
  for (const locale of ["en-US", "en-CA", "en-GB", "fr-FR", "de-DE", "es-US"]) {
    for (const currency of ["USD", "CAD", "GBP", "EUR"]) {
      const options = {style: "currency", currency};
      for (const amount of [0, 5.84, 1234.56]) assert.equal(formatter("NumberFormat", locale, options).format(amount), new Intl.NumberFormat(locale, options).format(amount));
    }
    const date = new Date("2026-10-16T08:38:59Z");
    assert.equal(formatter("DateTimeFormat", locale, {year:"numeric", month:"numeric", day:"numeric", hour:"numeric", minute:"numeric", second:"numeric"}).format(date), date.toLocaleString(locale));
  }
  console.log("Cold catalogue yields, shared work, failure recovery and localized formatting passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
