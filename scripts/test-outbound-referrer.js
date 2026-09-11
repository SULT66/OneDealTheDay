/*
 * Whether a shop can tell which page sent it a buyer.
 *
 * helmet ships `Referrer-Policy: no-referrer` by default, nobody chose it, and
 * it applied to the whole site. Commissions kept arriving because attribution
 * rides on parameters inside the link — campid, clickref, customid — so
 * nothing ever looked broken.
 *
 * What it broke is the answer to "where did this click come from". The
 * merchant could not tell, our own reports could not tell, and an affiliate
 * network reviewing the site sees clicks arriving from nowhere, which is the
 * signature of the automated traffic those reviews exist to catch. Sovrn's
 * publisher code of conduct names it directly: a publisher must not obscure
 * the origin of a link, including through redirects.
 *
 * Two things are checked here, because the header alone is not enough — a
 * `rel="noreferrer"` on the anchor strips the referrer before the redirect is
 * ever reached, and every card on the site had one.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

/* ------------------------------------------------- the site-wide policy */

for (const file of ["src/server.js", "app.js"]) {
  const source = read(file);
  assert.ok(
    /referrerPolicy\s*:\s*\{\s*policy\s*:\s*"strict-origin-when-cross-origin"\s*\}/.test(source),
    `${file} lets helmet fall back to its no-referrer default`,
  );
}

/* ---------------------------------------------- every link that leaves */

const server = read("src/server.js");

/*
 * The outbound routes widen it deliberately: a shop paying commission is
 * entitled to the page that sent the buyer, and these are public catalogue
 * URLs with nothing in their paths a merchant should not see.
 */
assert.ok(
  /function outboundHeaders\(res\)[\s\S]{0,400}Referrer-Policy",\s*"no-referrer-when-downgrade"/.test(server),
  "outboundHeaders no longer widens the referrer for links that leave the site",
);

/*
 * And it has to be on all of them. /go/:id is the product link, /go/store the
 * shop's front door, /live/go the Buy button during a drop, and the two Amazon
 * routes the picks added by hand — a visitor leaving through any of them is a
 * visitor some shop is being asked to pay for.
 */
for (const route of ["/go/store/:retailer", "/go/:id", "/live/go/:key", "/amazon/go/store", "/amazon/go/:id"]) {
  const index = server.indexOf(`app.get("${route}"`);
  assert.notStrictEqual(index, -1, `the ${route} route has moved or gone`);
  const body = server.slice(index, index + 700);
  assert.ok(
    body.includes("outboundHeaders(res)"),
    `${route} sends visitors out without saying which page sent them`,
  );
}

/* ------------------------------------------------------- the anchors */

/*
 * `sponsored` is what marks a paid link, so it is what this walks. The admin
 * console and the footer's links to our own social profiles are neither paid
 * nor reviewed, and keep theirs.
 */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
  return /\.(tsx?|js)$/.test(entry.name) ? [full] : [];
});

const offenders = [];
let sponsoredLinks = 0;
for (const file of [...walk(path.join(root, "src")), ...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
  for (const [, rel] of read(path.relative(root, file)).matchAll(/rel="([^"]*sponsored[^"]*)"/g)) {
    sponsoredLinks += 1;
    const tokens = rel.split(/\s+/);
    if (tokens.includes("noreferrer")) offenders.push(`${path.relative(root, file)}: rel="${rel}"`);
    assert.ok(tokens.includes("noopener"), `${path.relative(root, file)} dropped noopener along with noreferrer`);
  }
}

assert.ok(sponsoredLinks > 0, "no affiliate links found at all — this test is looking in the wrong place");
assert.deepStrictEqual(
  offenders,
  [],
  `affiliate links still strip the referrer before the redirect can widen it:\n  ${offenders.join("\n  ")}`,
);

console.log(`Outbound referrer policy passed (${sponsoredLinks} affiliate links checked).`);
