const assert = require("assert");
const { emailHealth } = require("../src/emailHealth");

/*
 * Why no email is arriving, answered by the site.
 *
 * Mail delivery was unconfigured for weeks and the only signal was a boolean
 * reading "not configured" — true, and useless: the API key is the last of four
 * steps, and setting it while the three before it are undone produces mail that
 * SendGrid accepts and Gmail drops.
 */

async function run() {
const answering = (records) => async (url) => ({
  ok: true,
  json: async () => {
    const name = new URL(url).searchParams.get("name");
    const data = records[name];
    return data ? { Answer: [{ data }] } : {};
  },
});

const env = {
  SENDGRID_API_KEY: "SG.test",
  EMAIL_FROM: "info@onedailydrop.com",
};

/* Everything in place. */
const ready = await emailHealth("onedailydrop.com", env, answering({
  "s1._domainkey.onedailydrop.com": "s1.domainkey.u1.wl.sendgrid.net.",
  "s2._domainkey.onedailydrop.com": "s2.domainkey.u1.wl.sendgrid.net.",
  "_dmarc.onedailydrop.com": "v=DMARC1; p=none",
}));
assert.strictEqual(ready.ready, true, "a fully configured domain is not reported as ready");

/* One CNAME missing is the state this account has actually been in for weeks. */
const halfDone = await emailHealth("onedailydrop.com", env, answering({
  "s1._domainkey.onedailydrop.com": "s1.domainkey.u1.wl.sendgrid.net.",
  "_dmarc.onedailydrop.com": "v=DMARC1; p=none",
}));
assert.strictEqual(halfDone.ready, false, "a half-finished domain authentication is reported as ready");
assert.strictEqual(
  halfDone.steps[0].done,
  false,
  "one missing CNAME does not fail the domain authentication step",
);

/*
 * The one that matters most, and the bug the first version had: a resolver that
 * cannot be reached returns an error indistinguishable from "no such record",
 * so the check reported a DMARC record missing when it was plainly there. A
 * diagnostic that invents work is worse than no diagnostic — the third state
 * exists so nobody is sent back to the registrar to add a record twice.
 */
const unreachable = await emailHealth("onedailydrop.com", env, async () => {
  throw new Error("ECONNREFUSED");
});
assert.strictEqual(unreachable.steps[0].done, null, "an unreachable resolver reads as unfinished work");
assert.strictEqual(unreachable.steps[1].done, null, "an unreachable resolver reads as a missing DMARC record");
assert(
  /could not check/i.test(unreachable.steps[1].detail),
  "an unreachable resolver does not say so",
);
assert.strictEqual(unreachable.ready, false, "a domain nobody could check is reported as ready");
/* The two steps that need no DNS are still answered. */
assert.strictEqual(unreachable.steps[2].done, true, "the API key check needs DNS, which it does not");

/* And an address on somebody else's domain is not an authenticated sender. */
const strayFrom = await emailHealth("onedailydrop.com", { ...env, EMAIL_FROM: "hello@gmail.com" }, answering({}));
assert.strictEqual(strayFrom.steps[3].done, false, "a from address on another domain passes as authenticated");

console.log("Email readiness checks passed: four steps, and could-not-check is not failure.");
}
run().catch((error) => { console.error(error); process.exit(1); });
