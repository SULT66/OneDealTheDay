const assert = require("assert");
const Database = require("better-sqlite3");

const {
  FAILURE_TTL_MS,
  MAX_ICON_BYTES,
  SUCCESS_TTL_MS,
  fetchRetailerIcon,
  isPrivateAddress,
  normalizeIconHost,
  parseIconLinks,
  pinRetailerIcon,
  readCachedIcon,
  safeFetch,
  sniffImageType,
  storeUploadedIcon,
  writeCachedIcon,
} = require("../src/retailerIcons");

/*
 * This module fetches a URL derived from something a caller sent us, which is
 * the shape of every server-side request forgery there has ever been. Most of
 * what follows is about what it refuses rather than what it returns.
 */

/* ------------------------------------------------------------------ hosts */

for (const [input, expected] of [
  ["bestbuy.com", "bestbuy.com"],
  ["https://www.bestbuy.com/site/thing.p?x=1", "bestbuy.com"],
  ["WWW.Kroger.COM", "kroger.com"],
  ["shop.co.uk", "shop.co.uk"],
  ["b-h.com", "b-h.com"],
]) {
  assert.strictEqual(normalizeIconHost(input), expected, `${input} should normalise to ${expected}`);
}

/* Everything here is either somewhere on this machine, somewhere on the
   network this machine sits in, or not a name at all. */
for (const input of [
  "localhost",
  "127.0.0.1",
  "10.0.0.5",
  "169.254.169.254",
  "metadata.google.internal",
  "http://192.168.1.1/",
  "file:///etc/passwd",
  "shop.local",
  "[::1]",
  "a..b",
  "-bad.com",
  "bad-.com",
  "nodots",
  "",
  null,
]) {
  assert.strictEqual(normalizeIconHost(input), null, `${input} should be refused as an icon host`);
}

/* ------------------------------------------------------------- addresses */

for (const ip of [
  "127.0.0.1",
  "0.0.0.0",
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  /* The cloud metadata address. Reaching this one is the prize in most SSRF
     write-ups, so it gets a line of its own. */
  "169.254.169.254",
  "100.64.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "fd00::1",
  "fe80::1",
  "not-an-address",
]) {
  assert.strictEqual(isPrivateAddress(ip), true, `${ip} should be treated as private`);
}
for (const ip of ["8.8.8.8", "23.45.67.89", "172.32.0.1", "2606:4700::1111"]) {
  assert.strictEqual(isPrivateAddress(ip), false, `${ip} is a public address`);
}

/* ------------------------------------------------------------ declared icons */

const declared = parseIconLinks(
  `<html><head>
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" href="/small.png" sizes="16x16">
    <link rel="apple-touch-icon" href="https://cdn.example.com/big.png" sizes="180x180">
    <link rel="shortcut icon" href="favicon.ico">
  </head></html>`,
  "https://shop.test-shop.com/",
);
assert.deepStrictEqual(
  declared,
  ["https://cdn.example.com/big.png", "https://shop.test-shop.com/small.png", "https://shop.test-shop.com/favicon.ico"],
  "declared icons should come back absolute and largest first",
);
assert.deepStrictEqual(parseIconLinks("<html><head></head></html>", "https://shop.test-shop.com/"), []);

/* ------------------------------------------------------------- redirects */

const publicLookup = async () => [{ address: "23.45.67.89", family: 4 }];
const privateLookup = async () => [{ address: "127.0.0.1", family: 4 }];
/* One public answer and one loopback answer: the shape of a DNS record set up
   to get past a check that only reads the first address. */
const mixedLookup = async () => [
  { address: "23.45.67.89", family: 4 },
  { address: "127.0.0.1", family: 4 },
];

const response = (status, headers = {}, body = "") => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

async function main() {
  /* A redirect off a public host onto a loopback address must not be followed.
     Checking only the address first asked for is the mistake this avoids. */
  const redirectToLoopback = async (url) =>
    url.includes("evil.test-shop.com")
      ? response(302, { location: "http://127.0.0.1:9200/" })
      : response(200, { "content-type": "image/png" }, "x");
  assert.strictEqual(
    await safeFetch("https://evil.test-shop.com/favicon.ico", {
      fetchImpl: redirectToLoopback,
      lookup: async (host) => (host === "evil.test-shop.com" ? publicLookup() : privateLookup()),
    }),
    null,
    "a redirect onto a loopback address was followed",
  );

  assert.strictEqual(
    await safeFetch("https://shop.test-shop.com/favicon.ico", { fetchImpl: async () => response(200), lookup: mixedLookup }),
    null,
    "a host answering with one public and one private address was allowed",
  );

  /* Schemes that are not http reach things that are not web pages. */
  for (const url of ["file:///etc/passwd", "ftp://shop.test-shop.com/x", "gopher://shop.test-shop.com/"]) {
    assert.strictEqual(
      await safeFetch(url, { fetchImpl: async () => response(200), lookup: publicLookup }),
      null,
      `${url} should never be fetched`,
    );
  }

  /* ------------------------------------------------------------- fetching */

  /* /favicon.ico is tried before the homepage: it answers for most large
     retailers in a fraction of the time, and the homepage of the shops worth
     showing is the heaviest page they have. */
  const asked = [];
  const icon = await fetchRetailerIcon("shop.test-shop.com", {
    lookup: publicLookup,
    fetchImpl: async (url) => {
      asked.push(url);
      return url.endsWith("/favicon.ico")
        ? response(200, { "content-type": "image/x-icon" }, "iconbytes")
        : response(404);
    },
  });
  assert.strictEqual(asked[0], "https://shop.test-shop.com/favicon.ico", "the homepage was loaded before /favicon.ico");
  assert.strictEqual(icon.contentType, "image/x-icon");
  assert.strictEqual(icon.host, "shop.test-shop.com");

  /* When there is no /favicon.ico, the page is read for what it declares. */
  const declaredOnly = await fetchRetailerIcon("shop.test-shop.com", {
    lookup: publicLookup,
    fetchImpl: async (url) => {
      if (url.endsWith("/favicon.ico")) return response(404);
      if (url === "https://shop.test-shop.com/") {
        return response(200, { "content-type": "text/html" }, '<link rel="icon" href="/brand.png">');
      }
      return response(200, { "content-type": "image/png" }, "pngbytes");
    },
  });
  assert.strictEqual(declaredOnly.contentType, "image/png", "a declared icon was not used as the fallback");

  /* A shop that answers with a web page where an image should be has not
     given us an icon, whatever the status code says. */
  const notAnImage = await fetchRetailerIcon("shop.test-shop.com", {
    lookup: publicLookup,
    fetchImpl: async () => response(200, { "content-type": "text/html" }, "<html>blocked</html>"),
  });
  assert.strictEqual(notAnImage, null, "an HTML body was accepted as an icon");

  /* Nothing hands us a film through a favicon route. */
  const tooBig = await fetchRetailerIcon("shop.test-shop.com", {
    lookup: publicLookup,
    fetchImpl: async () =>
      response(200, { "content-type": "image/png", "content-length": String(MAX_ICON_BYTES + 1) }, "x"),
  });
  assert.strictEqual(tooBig, null, "an oversized response was accepted");

  /* ---------------------------------------------------------------- cache */

  const db = new Database(":memory:");
  db.exec(`CREATE TABLE retailer_icons(
    host TEXT PRIMARY KEY,
    content_type TEXT NOT NULL DEFAULT '',
    bytes BLOB,
    checked_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0
  )`);

  const now = Date.parse("2026-09-01T12:00:00Z");
  writeCachedIcon(db, "shop.test-shop.com", { contentType: "image/png", bytes: Buffer.from("png") }, now);
  assert.strictEqual(readCachedIcon(db, "shop.test-shop.com", now).contentType, "image/png");
  assert.strictEqual(
    readCachedIcon(db, "shop.test-shop.com", now + SUCCESS_TTL_MS + 1),
    null,
    "a stale icon was served instead of being refetched",
  );

  /* A shop with no icon is remembered as having none. Without this, every
     search naming that shop would try again and wait for it to time out. */
  writeCachedIcon(db, "blocked.test-shop.com", null, now);
  assert.deepStrictEqual(readCachedIcon(db, "blocked.test-shop.com", now), { missing: true });
  assert.strictEqual(
    readCachedIcon(db, "blocked.test-shop.com", now + FAILURE_TTL_MS + 1),
    null,
    "a shop that had no icon a month ago is never asked again",
  );
  assert.strictEqual(readCachedIcon(db, "never-seen.test-shop.com", now), null);

  /* ----------------------------------------------------------- pinned icons */

  /*
   * A pinned icon was chosen by hand for a shop that refuses our fetcher, so
   * it has to survive the two things that would otherwise undo it: the monthly
   * expiry, and the next automatic lookup writing a failure over it.
   */
  const pinned = await pinRetailerIcon(db, "blocked.test-shop.com", "https://cdn.test-shop.com/logo.png", {
    lookup: publicLookup,
    fetchImpl: async () => response(200, { "content-type": "image/png" }, "pinnedbytes"),
    now,
  });
  assert.strictEqual(pinned.host, "blocked.test-shop.com");
  assert.strictEqual(readCachedIcon(db, "blocked.test-shop.com", now).contentType, "image/png");
  assert.strictEqual(
    readCachedIcon(db, "blocked.test-shop.com", now + SUCCESS_TTL_MS * 12).contentType,
    "image/png",
    "a hand-picked icon expired, sending us back to a shop we know refuses us",
  );

  writeCachedIcon(db, "blocked.test-shop.com", null, now + 1000);
  assert.strictEqual(
    readCachedIcon(db, "blocked.test-shop.com", now + 2000)?.contentType,
    "image/png",
    "an automatic lookup wrote a failure over an icon somebody set by hand",
  );

  /* The guards do not relax because a person typed the address. */
  const pinnedLoopback = await pinRetailerIcon(db, "blocked.test-shop.com", "http://127.0.0.1/logo.png", {
    lookup: privateLookup,
    fetchImpl: async () => response(200, { "content-type": "image/png" }, "x"),
  });
  assert(pinnedLoopback.error, "an admin was allowed to point the server at a loopback address");

  const pinnedHtml = await pinRetailerIcon(db, "another.test-shop.com", "https://cdn.test-shop.com/page", {
    lookup: publicLookup,
    fetchImpl: async () => response(200, { "content-type": "text/html" }, "<html></html>"),
  });
  assert(pinnedHtml.error, "a web page was accepted as a hand-picked icon");

  /* --------------------------------------------------------- uploaded icons */

  /*
   * Pasting a link turned out to be the hard way round: the addresses people
   * have to hand are pages showing a logo, and several icon sites will not
   * serve their images to anybody else at all. Uploading the downloaded file
   * skips all of that, so it has to be as careful as the fetch was.
   *
   * The type is read from the first bytes, never from what the uploader said.
   * A browser reports image/png for anything somebody renamed, and these bytes
   * are served back to every visitor.
   */
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.strictEqual(sniffImageType(png), "image/png");
  assert.strictEqual(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), "image/jpeg");
  assert.strictEqual(sniffImageType(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16])), "image/x-icon");
  assert.strictEqual(sniffImageType(Buffer.from("GIF89a and then some")), "image/gif");
  assert.strictEqual(
    sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])),
    "image/webp",
  );
  assert.strictEqual(
    sniffImageType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    "image/svg+xml",
  );
  /* The two worth naming: a saved web page, and anything executable. */
  assert.strictEqual(sniffImageType(Buffer.from("<!doctype html><html></html>")), null);
  assert.strictEqual(sniffImageType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4])), null);
  assert.strictEqual(sniffImageType(Buffer.alloc(0)), null);

  const uploaded = storeUploadedIcon(db, "samsung-shop.test-shop.com", png, { now });
  assert.strictEqual(uploaded.contentType, "image/png");
  assert.strictEqual(
    readCachedIcon(db, "samsung-shop.test-shop.com", now + SUCCESS_TTL_MS * 12).contentType,
    "image/png",
    "an uploaded icon expired, though it was set by hand for a shop that refuses us",
  );

  assert(
    storeUploadedIcon(db, "samsung-shop.test-shop.com", Buffer.from("<!doctype html>"), { now }).error,
    "a web page was accepted as an uploaded icon",
  );
  assert(
    storeUploadedIcon(db, "samsung-shop.test-shop.com", Buffer.alloc(MAX_ICON_BYTES + 1), { now }).error,
    "an oversized upload was accepted",
  );
  assert(storeUploadedIcon(db, "localhost", png, { now }).error, "an upload bypassed the host check");

  console.log(
    "Retailer icon host, address, redirect, fetch, cache, pinning and upload checks passed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
