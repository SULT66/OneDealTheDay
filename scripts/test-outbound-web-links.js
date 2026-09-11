/*
 * Delia's findings outside the catalogue, and the door they leave by.
 *
 * They used to link straight out. That cost two things: a shopper who took her
 * advice and bought was a shopper we sent for nothing — of four results for
 * one live question, three were web links earning no commission — and nobody
 * could tell whether her suggestions were followed at all, because the click
 * was recorded nowhere.
 *
 * Sending them through our own redirect fixes both and introduces one risk
 * worth taking seriously: a route that takes a URL from the query string is an
 * open redirect, and a link reading onedailydrop.com that lands wherever the
 * sender likes is a phishing tool with our name on it. So the server signs
 * what it is willing to send a visitor to, and the route follows nothing else.
 */
const assert = require("assert");
const {
  SIGNATURE_TTL_MS,
  hostLabel,
  isSendable,
  signOutbound,
  verifyOutbound,
} = require("../src/outboundLinks");

const query = (link) => Object.fromEntries(new URLSearchParams(link.split("?")[1]));

/* ------------------------------------------------------- the happy path */

const target = "https://www.walmart.com/ip/some-tv/12345?variant=black";
const link = signOutbound(target);
assert.ok(link.startsWith("/go/web?"), "a signed link must stay on this site");
assert.strictEqual(verifyOutbound(query(link)), target, "a link we signed must survive the round trip");

/* The query string is carried in the payload, not lost in it. */
assert.ok(verifyOutbound(query(link)).includes("variant=black"));

/* ------------------------------------------------------ what is refused */

const signed = query(link);

/* The whole point: swapping the destination under a valid signature. */
assert.strictEqual(
  verifyOutbound({ ...signed, u: Buffer.from("https://evil.example/login", "utf8").toString("base64url") }),
  "",
  "the destination can be swapped — this route is an open redirect",
);

/* A signature invented rather than computed. */
assert.strictEqual(verifyOutbound({ ...signed, s: "x".repeat(32) }), "");
/* A signature of the wrong length must not throw on the constant-time compare. */
assert.strictEqual(verifyOutbound({ ...signed, s: "short" }), "");
/* Nothing at all. */
assert.strictEqual(verifyOutbound({}), "");
assert.strictEqual(verifyOutbound({ u: signed.u }), "");

/* Expiry, moved forward rather than waited for. */
assert.strictEqual(
  verifyOutbound(signed, { now: Date.now() + SIGNATURE_TTL_MS + 1000 }),
  "",
  "an expired link is still being followed",
);
/* And still valid a minute before it runs out. */
assert.strictEqual(verifyOutbound(signed, { now: Date.now() + SIGNATURE_TTL_MS - 60000 }), target);

/*
 * Schemes. A javascript: or data: destination inside a link wearing our domain
 * is exactly what the signature exists to stop, so it is refused at signing
 * time rather than relied on to fail later.
 */
for (const refused of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "", null, undefined]) {
  assert.strictEqual(signOutbound(refused), "", `signed something unsendable: ${refused}`);
  assert.strictEqual(isSendable(refused), false);
}
/* Plain http is allowed — some smaller shops still redirect through it — and
   https obviously. */
assert.ok(signOutbound("http://example.com/thing"));
assert.ok(isSendable("https://example.com/thing"));

/*
 * The scheme is checked on the way out as well as on the way in.
 *
 * Nothing reaching this route from outside can carry a javascript: payload —
 * signOutbound refuses to sign one, and without the secret a signature cannot
 * be forged. So the check inside verifyOutbound is the second lock on the same
 * door, and the only way to test it is to hold the key: this forges a
 * correctly signed link the way the server would if it ever signed something
 * it should not have.
 */
{
  const crypto = require("crypto");
  const secret = String(process.env.SESSION_SECRET || "onedailydrop-local-development");
  const u = Buffer.from("javascript:alert(document.cookie)", "utf8").toString("base64url");
  const e = String(Date.now() + 60000);
  const s = crypto.createHmac("sha256", secret).update(`${u}.${e}`).digest("base64url").slice(0, 32);
  /* The forgery is genuine — a wrong signature would prove nothing here. */
  assert.strictEqual(
    verifyOutbound({ u: Buffer.from("https://example.com", "utf8").toString("base64url"), e, s: crypto.createHmac("sha256", secret).update(`${Buffer.from("https://example.com", "utf8").toString("base64url")}.${e}`).digest("base64url").slice(0, 32) }),
    "https://example.com",
    "the test's own signing does not match the module's",
  );
  assert.strictEqual(
    verifyOutbound({ u, e, s }),
    "",
    "a correctly signed javascript: destination is still followed",
  );
}

/* A signature made for one URL must not verify another with the same expiry. */
const other = signOutbound("https://www.target.com/p/other");
assert.strictEqual(verifyOutbound({ ...query(other), u: signed.u }), "");

/* ----------------------------------------------------- the click record */

/*
 * The shop's name for the click row comes from the host, which is a fact about
 * the link rather than a claim about the shop.
 */
assert.strictEqual(hostLabel("https://www.walmart.com/ip/12345"), "walmart.com");
assert.strictEqual(hostLabel("https://shop.example.co.uk/x"), "shop.example.co.uk");
assert.strictEqual(hostLabel("not a url"), "");

console.log("Signed outbound web links passed.");
