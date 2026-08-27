const crypto = require("crypto");

/**
 * Sign in with Google, without a library.
 *
 * The whole exchange is four HTTPS calls and some string handling, and a
 * dependency here would be a dependency holding the keys to every account on
 * the site. The parts worth getting wrong are pulled out as plain functions so
 * they can be tested without a browser or a Google account.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/* Google has issued tokens under both spellings for years and documents both
   as valid. Accepting only one of them locks out a share of sign-ins for no
   security gain. */
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/** A minute of slack, so a correct clock a second out does not reject anyone. */
const CLOCK_SKEW_MS = 60_000;

function googleConfig(env = process.env) {
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  const siteUrl = String(env.SITE_URL || "https://www.onedailydrop.com")
    .trim()
    .replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl}/api/auth/google/callback`,
    /* Nothing about Google sign-in is offered to a shopper until both halves
       of the credential are present. A half-configured button that fails after
       the shopper has already handed over their Google account is worse than
       no button. */
    configured: Boolean(clientId && clientSecret),
  };
}

/** Opaque, unguessable, and ours: this is what ties a callback to its start. */
function createState() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Same value, compared without leaking how much of it matched.
 *
 * The state is the only thing standing between a shopper and having someone
 * else's Google account attached to their session, so it is compared the way a
 * password would be.
 */
function statesMatch(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function authorizationUrl(config, state) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  /* Ask for a fresh choice of account rather than silently reusing whichever
     Google session the browser happens to hold. People share computers. */
  url.searchParams.set("prompt", "select_account");
  return url.href;
}

function decodeIdToken(idToken) {
  const payload = String(idToken || "").split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * The profile inside a Google ID token, or nothing.
 *
 * The signature is deliberately not checked here, and that is safe for exactly
 * one reason: this token did not come from the browser. It came back over TLS
 * from Google's own token endpoint, in response to a request carrying our
 * client secret, which is the case Google documents as not needing local
 * verification. A token arriving any other way must never be passed to this
 * function.
 *
 * What is checked is everything that decides whose account this is: that
 * Google issued it, that it was issued to us rather than to some other site,
 * that it has not expired, and that Google says it owns the email address. An
 * unverified address is worth nothing, since anyone can type any address into
 * a Google profile, and trusting it would let a stranger claim an existing
 * account by email.
 */
function verifiedGoogleProfile(idToken, clientId, now = Date.now()) {
  const claims = decodeIdToken(idToken);
  if (!claims) return null;
  if (!ISSUERS.has(String(claims.iss || ""))) return null;
  if (String(claims.aud || "") !== String(clientId || "")) return null;
  const expiresAt = Number(claims.exp) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt + CLOCK_SKEW_MS < now) return null;
  const subject = String(claims.sub || "").trim();
  const email = String(claims.email || "").trim().toLowerCase();
  if (!subject || !email) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  return {
    subject,
    email,
    /* Google profiles can arrive with no name at all. The part before the @ is
       a better greeting than an empty string, and the shopper can change it. */
    name: String(claims.name || "").trim().slice(0, 80) || email.split("@")[0].slice(0, 80),
  };
}

/**
 * Trades the one-time code for tokens.
 *
 * `fetchFn` is injectable so the tests never touch the network, and so a
 * failure here can be exercised rather than hoped about.
 */
async function exchangeCodeForTokens(config, code, { fetchFn = fetch, signal } = {}) {
  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: String(code || ""),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google token exchange failed with HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }
  return response.json();
}

module.exports = {
  AUTHORIZATION_ENDPOINT,
  TOKEN_ENDPOINT,
  authorizationUrl,
  createState,
  decodeIdToken,
  exchangeCodeForTokens,
  googleConfig,
  statesMatch,
  verifiedGoogleProfile,
};
