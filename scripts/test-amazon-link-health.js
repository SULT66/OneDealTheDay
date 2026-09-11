/*
 * The nightly check on hand-added Amazon links, and the limit it must be
 * honest about.
 *
 * Asked directly, Amazon answers a GET for an ASIN that does not exist with
 * 200 — it serves its "we couldn't find that page" as an ordinary page. So no
 * status code will ever reveal that a product has been delisted, and a check
 * that claimed otherwise would be worse than none: a green tick nobody should
 * trust. What this catches is a link that is broken or expired, and the panel
 * says so in those words.
 *
 * The rest is about not throwing the list away on a bad afternoon. Amazon
 * blocks and rate-limits automated requests, and a 503 is an opinion about the
 * request, not evidence about the product.
 */

const assert = require("assert");
const { checkAmazonLinks, checkOne } = require("../src/amazonLinkHealth");

/* A database with just enough of the shape the module uses. */
function fakeDb(rows) {
  const picks = rows.map(row => ({ ...row }));
  return {
    picks,
    prepare(sql) {
      return {
        all: () => picks.map(({ id, url }) => ({ id, url })),
        run: (status, checkedAt, id) => {
          const pick = picks.find(candidate => candidate.id === id);
          if (!sql.includes("UPDATE amazon_picks")) throw new Error("unexpected statement: " + sql);
          pick.link_status = status;
          pick.link_checked_at = checkedAt;
        },
      };
    },
  };
}

const responding = (byUrl) => async (url) => {
  const answer = byUrl[String(url)];
  if (answer instanceof Error) throw answer;
  return { status: answer };
};

(async () => {
  /* --- One link at a time. --- */
  assert.deepStrictEqual(
    await checkOne("https://amzn.to/live", responding({ "https://amzn.to/live": 200 })),
    { status: "ok", detail: "HTTP 200" },
  );
  /* A redirect that was followed to something that exists. */
  assert.strictEqual((await checkOne("https://amzn.to/x", responding({ "https://amzn.to/x": 200 }))).status, "ok");
  assert.strictEqual((await checkOne("https://amzn.to/x", responding({ "https://amzn.to/x": 404 }))).status, "dead");
  assert.strictEqual((await checkOne("https://amzn.to/x", responding({ "https://amzn.to/x": 410 }))).status, "dead");

  /*
   * The ones that must never be called dead. Amazon throttles and blocks
   * automated requests, and treating that as death would empty the homepage
   * over an afternoon of rate limiting.
   */
  for (const status of [403, 405, 429, 500, 503]) {
    const result = await checkOne("https://amzn.to/x", responding({ "https://amzn.to/x": status }));
    assert.strictEqual(result.status, "unknown", `HTTP ${status} is not evidence the product is gone`);
  }
  const offline = await checkOne("https://amzn.to/x", responding({ "https://amzn.to/x": new Error("socket hang up") }));
  assert.strictEqual(offline.status, "unknown", "a network failure is not evidence either");
  assert.match(offline.detail, /socket hang up/);

  /* --- The whole list. --- */
  const db = fakeDb([
    { id: 1, url: "https://amzn.to/alive" },
    { id: 2, url: "https://amzn.to/gone" },
    { id: 3, url: "https://amzn.to/blocked" },
  ]);

  const summary = await checkAmazonLinks({
    db,
    spacingMs: 0,
    now: () => Date.parse("2026-09-09T12:00:00.000Z"),
    fetchImpl: responding({
      "https://amzn.to/alive": 200,
      "https://amzn.to/gone": 404,
      "https://amzn.to/blocked": 503,
    }),
  });

  assert.deepStrictEqual(summary, { checked: 3, ok: 1, dead: 1, unknown: 1, deadIds: [2] });
  assert.strictEqual(db.picks[0].link_status, "ok");
  assert.strictEqual(db.picks[1].link_status, "dead");
  assert.strictEqual(db.picks[2].link_status, "unknown");
  /* Stamped whatever the answer was, so "never checked" and "checked and
     unclear" stay distinguishable. */
  for (const pick of db.picks) {
    assert.strictEqual(pick.link_checked_at, "2026-09-09T12:00:00.000Z");
  }

  /* --- One failure does not end the sweep. --- */
  const stubborn = fakeDb([
    { id: 1, url: "https://amzn.to/throws" },
    { id: 2, url: "https://amzn.to/fine" },
  ]);
  const after = await checkAmazonLinks({
    db: stubborn,
    spacingMs: 0,
    fetchImpl: responding({
      "https://amzn.to/throws": new Error("connection reset"),
      "https://amzn.to/fine": 200,
    }),
  });
  assert.strictEqual(after.checked, 2, "the second link is still checked");
  assert.strictEqual(stubborn.picks[1].link_status, "ok");

  /* --- Nothing to check is not an error. --- */
  assert.deepStrictEqual(
    await checkAmazonLinks({ db: fakeDb([]), spacingMs: 0, fetchImpl: responding({}) }),
    { checked: 0, ok: 0, dead: 0, unknown: 0, deadIds: [] },
  );

  console.log("amazon link health: ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
