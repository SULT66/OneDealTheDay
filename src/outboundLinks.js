/*
 * Signed links out to somewhere we do not have in the catalogue.
 *
 * Delia's web findings go straight out today, which costs two things. They
 * cannot be affiliated, so a shopper who takes her advice and buys is a
 * shopper we sent for nothing — three of four results for one live question
 * were web links worth no commission at all. And they are counted nowhere, so
 * nobody knows whether her suggestions are followed.
 *
 * Both are fixed by sending them through our own redirect, which is where the
 * network's rewrite will go once there is one. The catch is that a redirect
 * taking a URL from the query string is an open redirect: a link that reads
 * onedailydrop.com and lands wherever the sender likes is a phishing tool, and
 * it would be ours.
 *
 * So the server signs what it is willing to send a visitor to. Delia's results
 * are built here, by us, from what the model cited — signing them at that
 * moment costs nothing and means the route follows only URLs this site
 * produced. An unsigned or edited link is refused rather than followed.
 *
 * The signature is not a security boundary around anything valuable; it is a
 * lock on one door that would otherwise stand open.
 */

const crypto = require("crypto");

/* Long enough to outlive a conversation and far short of a link that could be
   passed around later. Delia's answers are acted on in minutes. */
const SIGNATURE_TTL_MS = 6 * 60 * 60 * 1000;

const secret = () => String(process.env.SESSION_SECRET || "onedailydrop-local-development");

const encode = (value) => Buffer.from(String(value), "utf8").toString("base64url");
const decode = (value) => {
  try {
    return Buffer.from(String(value || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
};

const digest = (payload) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 32);

/**
 * The one shape of URL this site will redirect to from a query string.
 *
 * http and https only — a javascript: or data: destination in a link wearing
 * our domain is exactly the thing the signature exists to prevent, and
 * checking the scheme as well costs one line.
 */
function isSendable(value) {
  try {
    return /^https?:$/.test(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

/**
 * A path on this site that leads to `url`, or an empty string if the URL is
 * not one we would send anybody to.
 */
function signOutbound(url, { now = Date.now() } = {}) {
  if (!isSendable(url)) return "";
  const target = encode(url);
  const expires = String(now + SIGNATURE_TTL_MS);
  return `/go/web?u=${target}&e=${expires}&s=${digest(`${target}.${expires}`)}`;
}

/**
 * The URL a signed link points at, or an empty string if the signature is
 * missing, wrong, or out of date.
 */
function verifyOutbound({ u, e, s }, { now = Date.now() } = {}) {
  const target = String(u || "");
  const expires = String(e || "");
  const signature = String(s || "");
  if (!target || !expires || !signature) return "";
  const expected = digest(`${target}.${expires}`);
  /* Constant time, because the alternative is a habit worth not having even
     where it does not matter. */
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return "";
  if (!Number.isFinite(Number(expires)) || Number(expires) < now) return "";
  const url = decode(target);
  return isSendable(url) ? url : "";
}

/** The shop a link goes to, for the click record. Never a promise about it. */
function hostLabel(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, "").slice(0, 120);
  } catch {
    return "";
  }
}


/*
 * Every web recommendation in an answer, given a door on this site.
 *
 * Delia builds recommendations in four places — the model's own list, a
 * live-offer path, an eBay path and a catalogue fallback — and signing them
 * where they are built covered one. Signing them where the answer leaves
 * covers all four and cannot be missed by the fifth, whenever there is one.
 *
 * It also fixes something the earlier version got wrong quietly: answers are
 * cached, signatures expire, and a cached answer served five hours later
 * carried links that were already dead. Signed on the way out, every answer
 * leaves with a fresh one.
 */
function withSignedLinks(payload) {
  if (!payload || !Array.isArray(payload.recommendations)) return payload;
  return {
    ...payload,
    recommendations: payload.recommendations.map((item) => {
      /* A catalogue result goes to its own page and leaves from there. */
      if (item?.source_type === "catalog") return { ...item, click_url: "" };
      return { ...item, click_url: signOutbound(item?.url) };
    }),
  };
}

module.exports = { SIGNATURE_TTL_MS, hostLabel, isSendable, signOutbound, verifyOutbound, withSignedLinks };
