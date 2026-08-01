const crypto = require("crypto");

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000;
const ALLOWED_DIGESTS = new Map([
  ["SHA1", "sha1"],
  ["SHA256", "sha256"],
  ["SHA384", "sha384"],
  ["SHA512", "sha512"]
]);

const tokenIsValid = token => TOKEN_PATTERN.test(String(token || ""));

const challengeResponse = ({challengeCode, verificationToken, endpoint}) => {
  if (!String(challengeCode || "")) throw new Error("Missing eBay challenge code.");
  if (!tokenIsValid(verificationToken)) throw new Error("Invalid eBay verification token configuration.");
  if (!String(endpoint || "").startsWith("https://")) throw new Error("Invalid eBay endpoint configuration.");
  return crypto.createHash("sha256")
    .update(String(challengeCode), "utf8")
    .update(String(verificationToken), "utf8")
    .update(String(endpoint), "utf8")
    .digest("hex");
};

const decodeSignatureHeader = header => {
  const encoded = String(header || "").trim();
  if (!encoded || encoded.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Invalid X-EBAY-SIGNATURE header.");
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid X-EBAY-SIGNATURE header.");
  }
  const keyId = String(decoded.kid || "");
  const signature = String(decoded.signature || "");
  const digest = String(decoded.digest || "").toUpperCase();
  if (String(decoded.alg || "").toLowerCase() !== "ecdsa" || !KEY_ID_PATTERN.test(keyId)) {
    throw new Error("Unsupported eBay signature metadata.");
  }
  if (!ALLOWED_DIGESTS.has(digest) || !signature || signature.length > 2048) {
    throw new Error("Unsupported eBay signature metadata.");
  }
  return {keyId, signature, digest:ALLOWED_DIGESTS.get(digest)};
};

const normalizePublicKey = key => {
  const value = String(key || "").trim();
  if (!value.includes("-----BEGIN PUBLIC KEY-----") || !value.includes("-----END PUBLIC KEY-----")) {
    throw new Error("eBay returned an invalid public key.");
  }
  return value
    .replace(/-----BEGIN PUBLIC KEY-----\s*/, "-----BEGIN PUBLIC KEY-----\n")
    .replace(/\s*-----END PUBLIC KEY-----/, "\n-----END PUBLIC KEY-----");
};

const verifySignature = async ({rawBody, signatureHeader, getPublicKey}) => {
  const {keyId, signature, digest} = decodeSignatureHeader(signatureHeader);
  const publicKey = normalizePublicKey(await getPublicKey(keyId));
  const verifier = crypto.createVerify(digest);
  verifier.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || ""));
  verifier.end();
  return verifier.verify(publicKey, signature, "base64");
};

const createEbayPublicKeyClient = ({clientId, clientSecret, environment = "production", fetchImpl = global.fetch}) => {
  const production = String(environment).toLowerCase() !== "sandbox";
  const apiOrigin = production ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
  const keyCache = new Map();
  let accessToken = "";
  let tokenExpiresAt = 0;

  const getAccessToken = async () => {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    if (!clientId || !clientSecret) throw new Error("eBay API credentials are not configured.");
    const response = await fetchImpl(`${apiOrigin}/identity/v1/oauth2/token`, {
      method:"POST",
      headers:{
        Authorization:`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body:new URLSearchParams({
        grant_type:"client_credentials",
        scope:"https://api.ebay.com/oauth/api_scope"
      }),
      signal:AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`eBay OAuth request failed with HTTP ${response.status}.`);
    const body = await response.json();
    accessToken = String(body.access_token || "");
    if (!accessToken) throw new Error("eBay OAuth response did not include an access token.");
    tokenExpiresAt = Date.now() + Math.max(1, Number(body.expires_in || 7200) - 60) * 1000;
    return accessToken;
  };

  return async keyId => {
    if (!KEY_ID_PATTERN.test(String(keyId || ""))) throw new Error("Invalid eBay public key ID.");
    const cached = keyCache.get(keyId);
    if (cached && Date.now() < cached.expiresAt) return cached.key;
    if (cached) keyCache.delete(keyId);
    const token = await getAccessToken();
    const response = await fetchImpl(`${apiOrigin}/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`, {
      headers:{Authorization:`Bearer ${token}`, Accept:"application/json"},
      signal:AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`eBay public-key request failed with HTTP ${response.status}.`);
    const body = await response.json();
    const key = normalizePublicKey(body.key);
    if (keyCache.size >= 100) keyCache.delete(keyCache.keys().next().value);
    keyCache.set(keyId, {key, expiresAt:Date.now() + PUBLIC_KEY_CACHE_TTL_MS});
    return key;
  };
};

module.exports = {
  challengeResponse,
  createEbayPublicKeyClient,
  decodeSignatureHeader,
  tokenIsValid,
  verifySignature
};
