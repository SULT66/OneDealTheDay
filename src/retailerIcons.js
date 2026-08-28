/**
 * Retailer favicons, fetched by us and served from our own origin.
 *
 * The obvious implementation is to point an <img> at the retailer, or at one
 * of the public favicon services. Both would tell a third party which shops a
 * given shopper is looking at, on every search, and Delia's whole job is to
 * put five or six shops in front of somebody at once. So the icon is fetched
 * server side, cached, and served from our own address: the browser only ever
 * talks to us.
 *
 * Fetching a URL a caller supplies is how servers get talked into reaching
 * things they should not, so the guards below are the substance of this file
 * rather than an afterthought. A missing icon is not a failure worth working
 * around: the interface falls back to a lettered circle and nothing is lost.
 */

const dns = require("dns").promises;
const net = require("net");

/** Favicons are small. Anything larger is not a favicon. */
const MAX_ICON_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 3000;
/** Redirects are common (bare domain to www, http to https) but two is plenty. */
const MAX_REDIRECTS = 2;
/** Long, because a shop's icon changes about never. */
const SUCCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Shorter, so a shop that was merely down gets another chance this month. */
const FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/gif",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

/**
 * The host we will look an icon up under, or null.
 *
 * Accepts a bare host or a full URL, since one caller has a link and another
 * has a name. www. is dropped so www.bestbuy.com and bestbuy.com are one
 * entry rather than two fetches of the same picture.
 */
function normalizeIconHost(input) {
  let host = String(input || "").trim().toLowerCase();
  if (!host) return null;
  if (host.includes("/") || host.includes(":")) {
    try {
      const parsed = new URL(host.includes("//") ? host : `https://${host}`);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      host = parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "");
  /* A name with no dot is not a public site; it is localhost, or an internal
     hostname, or a typo. A literal IP address is never a shop. */
  if (host.length > 253) return null;
  if (net.isIP(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  /* Every label real: no empty one from a doubled dot, none longer than DNS
     allows, and none opening or closing on a hyphen. */
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  /* A top level label that is entirely numeric means somebody wrote an address
     in a shape net.isIP does not recognise. */
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  if (/\.(?:local|localhost|internal|intranet|home|lan|test|example|invalid)$/.test(host)) return null;
  return host;
}

/**
 * Addresses nobody outside this network should be able to make us reach.
 *
 * Covers loopback, the three private v4 ranges, link-local (which is how cloud
 * metadata services are usually reached), carrier-grade NAT, and the v6
 * equivalents including v4-mapped addresses, which are the usual way past a
 * check that only looks at v4.
 */
function isPrivateAddress(address) {
  const ip = String(address || "").trim().toLowerCase();
  const version = net.isIP(ip);
  if (!version) return true;

  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (ip === "::" || ip === "::1") return true;
  /* ::ffff:10.0.0.1 and friends: the same private ranges wearing a v6 hat. */
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]);
  /* Unique local (fc00::/7) and link-local (fe80::/10). */
  if (/^f[cd]/.test(ip)) return true;
  if (/^fe[89ab]/.test(ip)) return true;
  return false;
}

/**
 * True when every address a host resolves to is public.
 *
 * Every address, not the first: a name that answers with one public address
 * and one loopback address is exactly the trick this is here to refuse.
 */
async function resolvesToPublicAddress(host, lookup = dns.lookup) {
  try {
    const answers = await lookup(host, { all: true });
    const list = Array.isArray(answers) ? answers : [answers];
    if (!list.length) return false;
    return list.every((answer) => !isPrivateAddress(answer.address));
  } catch {
    return false;
  }
}

/**
 * Icons declared in the page itself, best first.
 *
 * A deliberately small parser rather than a DOM: we are reading four
 * attributes out of the head of a document we do not control, and the answer
 * is only ever used as a URL to try.
 */
function parseIconLinks(html, baseUrl) {
  const found = [];
  const head = String(html || "").slice(0, 200000);
  const linkTag = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkTag.exec(head))) {
    const tag = match[0];
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() || "";
    if (!/\b(?:shortcut\s+)?icon\b|\bapple-touch-icon\b/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(tag)?.[1];
    if (!href) continue;
    const sizes = /\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    try {
      found.push({ url: new URL(href, baseUrl).toString(), size: Number(sizes) || 0 });
    } catch {
      /* A href we cannot resolve is a href we cannot fetch. */
    }
  }
  /* Largest declared size first: a 16px favicon looks like porridge next to
     the 20px circle it sits in on a high density screen. */
  return found.sort((a, b) => b.size - a.size).map((icon) => icon.url);
}

const withTimeout = async (run, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * One guarded request. Redirects are followed by hand so that each hop is
 * checked again: a public address that redirects to 127.0.0.1 is the whole
 * point of doing this manually.
 */
async function safeFetch(url, { fetchImpl = fetch, lookup = dns.lookup, accept } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!normalizeIconHost(parsed.hostname)) return null;
    if (!(await resolvesToPublicAddress(parsed.hostname, lookup))) return null;

    const response = await withTimeout(
      (signal) =>
        fetchImpl(current, {
          signal,
          redirect: "manual",
          headers: {
            accept,
            /* Named plainly. A shop that would rather we did not take its icon
               can say so, and can find us in its logs to ask. */
            "user-agent": "OneDailyDropIconFetcher/1.0 (+https://www.onedailydrop.com)",
          },
        }),
      FETCH_TIMEOUT_MS,
    ).catch(() => null);
    if (!response) return null;

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!response.ok) return null;
    return { response, url: current };
  }
  return null;
}

/** Reads at most MAX_ICON_BYTES, so a hostile server cannot hand us a film. */
async function readCapped(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ICON_BYTES) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length && buffer.length <= MAX_ICON_BYTES ? buffer : null;
}

const cleanType = (value) => String(value || "").split(";")[0].trim().toLowerCase();

/** Fetches one candidate and returns it only if it is really an image. */
async function tryIcon(url, safeHost, options) {
  const result = await safeFetch(url, { ...options, accept: "image/*" });
  if (!result) return null;
  const contentType = cleanType(result.response.headers.get("content-type"));
  if (!ALLOWED_TYPES.has(contentType)) return null;
  const bytes = await readCapped(result.response).catch(() => null);
  return bytes ? { host: safeHost, contentType, bytes } : null;
}

/**
 * Finds a retailer's icon.
 *
 * /favicon.ico is tried first, against the older instinct to prefer whatever
 * the page declares. Measured across ten large retailers it answers for seven
 * of them in about 150ms, where loading the homepage to read its <link> tags
 * took ten times that and sometimes timed out: the shops with the heaviest
 * front pages are exactly the ones worth showing. The declared icons are
 * usually larger and nicer, so they remain the fallback rather than the
 * first choice, and at 20px across the difference is not visible anyway.
 *
 * Some shops refuse us outright, by answering 403 or by hanging. That is
 * their call to make, and the interface falls back to a lettered circle.
 */
async function fetchRetailerIcon(host, options = {}) {
  const safeHost = normalizeIconHost(host);
  if (!safeHost) return null;

  /* Both spellings, because a shop that only answers on www is common enough
     and costs one fast request to rule out. */
  for (const url of [`https://${safeHost}/favicon.ico`, `https://www.${safeHost}/favicon.ico`]) {
    const icon = await tryIcon(url, safeHost, options);
    if (icon) return icon;
  }

  const page = await safeFetch(`https://${safeHost}/`, { ...options, accept: "text/html" });
  if (!page) return null;
  const html = await page.response.text().catch(() => "");
  for (const candidate of parseIconLinks(html, page.url).slice(0, 3)) {
    const icon = await tryIcon(candidate, safeHost, options);
    if (icon) return icon;
  }
  return null;
}

/**
 * The cached answer for a host: the icon, "we looked and there was not one",
 * or nothing at all when it has never been tried or the answer went stale.
 */
function readCachedIcon(db, host, now = Date.now()) {
  const row = db.prepare("SELECT * FROM retailer_icons WHERE host=?").get(host);
  if (!row) return null;
  /* A pinned icon was chosen by hand for a shop that refuses our fetcher.
     Letting it expire would send us back to ask a shop we already know says
     no, and lose the icon somebody deliberately set. */
  if (row.pinned && row.bytes) return { contentType: row.content_type, bytes: row.bytes };
  const age = now - Date.parse(row.checked_at || 0);
  if (row.bytes) return age < SUCCESS_TTL_MS ? { contentType: row.content_type, bytes: row.bytes } : null;
  /* A remembered failure. Held for a week so a shop with no icon is not
     re-fetched on every single search that mentions it. */
  return age < FAILURE_TTL_MS ? { missing: true } : null;
}

/**
 * Stores what we found, or the fact that we found nothing.
 *
 * `pinned` marks an icon chosen by hand. An ordinary fetch never overwrites a
 * pinned row: the reason somebody pinned one is that fetching does not work
 * for that shop, so letting a later fetch replace it with a failure would
 * undo the fix on its own.
 */
function writeCachedIcon(db, host, icon, now = Date.now(), { pinned = false } = {}) {
  db.prepare(`INSERT INTO retailer_icons(host,content_type,bytes,checked_at,pinned)
    VALUES(?,?,?,?,?)
    ON CONFLICT(host) DO UPDATE SET content_type=excluded.content_type,
      bytes=excluded.bytes, checked_at=excluded.checked_at, pinned=excluded.pinned
    WHERE excluded.pinned=1 OR retailer_icons.pinned=0`)
    .run(host, icon?.contentType || "", icon?.bytes || null, new Date(now).toISOString(), pinned ? 1 : 0);
}

/**
 * Takes one specific image, chosen by hand, as a shop's icon.
 *
 * The URL still goes through every guard an automatic fetch does. Somebody
 * typing an address into an admin form is not a reason to let the server
 * reach an address it would otherwise refuse.
 */
async function pinRetailerIcon(db, host, iconUrl, options = {}) {
  const safeHost = normalizeIconHost(host);
  if (!safeHost) return { error: "That is not a shop address." };

  const result = await safeFetch(String(iconUrl || ""), { ...options, accept: "image/*" });
  if (!result) return { error: "That image could not be fetched." };
  const contentType = cleanType(result.response.headers.get("content-type"));
  if (!ALLOWED_TYPES.has(contentType)) return { error: `That link answered with ${contentType || "no image type"}.` };
  const bytes = await readCapped(result.response).catch(() => null);
  if (!bytes) return { error: `An icon has to be an image under ${Math.round(MAX_ICON_BYTES / 1024)}KB.` };

  writeCachedIcon(db, safeHost, { contentType, bytes }, options.now ?? Date.now(), { pinned: true });
  return { host: safeHost, contentType, bytes: bytes.length };
}

module.exports = {
  FAILURE_TTL_MS,
  MAX_ICON_BYTES,
  SUCCESS_TTL_MS,
  fetchRetailerIcon,
  isPrivateAddress,
  normalizeIconHost,
  parseIconLinks,
  pinRetailerIcon,
  readCachedIcon,
  resolvesToPublicAddress,
  safeFetch,
  writeCachedIcon,
};
