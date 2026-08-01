const assert = require("assert");
const crypto = require("crypto");
const {
  challengeResponse,
  createEbayPublicKeyClient,
  decodeSignatureHeader,
  tokenIsValid,
  verifySignature
} = require("../src/ebayAccountDeletion");

const endpoint = "https://www.onedailydrop.com/api/ebay/account-deletion";
const token = "OneDailyDrop_eBay_AccountDeletion_2026";
const challengeCode = "challenge-123";
const expected = crypto.createHash("sha256").update(challengeCode + token + endpoint).digest("hex");

assert(tokenIsValid(token), "Valid eBay verification token was rejected");
assert(!tokenIsValid("too-short"), "Short eBay verification token was accepted");
assert(!tokenIsValid("x".repeat(32) + "!"), "Invalid verification-token characters were accepted");
assert.strictEqual(
  challengeResponse({challengeCode, verificationToken:token, endpoint}),
  expected,
  "eBay challenge response does not match the required SHA-256 input order"
);

const {publicKey, privateKey} = crypto.generateKeyPairSync("ec", {namedCurve:"prime256v1"});
const rawBody = Buffer.from(JSON.stringify({
  metadata:{topic:"MARKETPLACE_ACCOUNT_DELETION", schemaVersion:"1.0", deprecated:false},
  notification:{notificationId:"test-notification", eventDate:"2026-08-01T15:00:00Z", data:{}}
}));
const signer = crypto.createSign("sha256");
signer.update(rawBody);
signer.end();
const signatureHeader = Buffer.from(JSON.stringify({
  alg:"ecdsa",
  kid:"test-key-id",
  signature:signer.sign(privateKey, "base64"),
  digest:"SHA256"
})).toString("base64");

(async () => {
  const decoded = decodeSignatureHeader(signatureHeader);
  assert.strictEqual(decoded.keyId, "test-key-id");
  assert.strictEqual(decoded.digest, "sha256");
  assert(await verifySignature({
    rawBody,
    signatureHeader,
    getPublicKey:async () => publicKey.export({type:"spki", format:"pem"})
  }), "Valid eBay notification signature was rejected");
  assert(!(await verifySignature({
    rawBody:Buffer.concat([rawBody, Buffer.from(" ")]),
    signatureHeader,
    getPublicKey:async () => publicKey.export({type:"spki", format:"pem"})
  })), "Modified eBay notification payload passed signature validation");

  let calls = 0;
  const mockFetch = async (url, options = {}) => {
    calls += 1;
    if (url.endsWith("/identity/v1/oauth2/token")) {
      assert(String(options.headers.Authorization).startsWith("Basic "));
      return {ok:true, status:200, json:async () => ({access_token:"test-token", expires_in:7200})};
    }
    assert(url.endsWith("/commerce/notification/v1/public_key/test-key-id"));
    assert.strictEqual(options.headers.Authorization, "Bearer test-token");
    return {ok:true, status:200, json:async () => ({key:publicKey.export({type:"spki", format:"pem"})})};
  };
  const getPublicKey = createEbayPublicKeyClient({clientId:"client", clientSecret:"secret", fetchImpl:mockFetch});
  assert((await getPublicKey("test-key-id")).includes("BEGIN PUBLIC KEY"));
  await getPublicKey("test-key-id");
  assert.strictEqual(calls, 2, "eBay public key was not cached");

  console.log("eBay account-deletion validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
