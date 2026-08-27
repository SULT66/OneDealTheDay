const assert = require("assert");

const {
  authorizationUrl,
  createState,
  exchangeCodeForTokens,
  googleConfig,
  statesMatch,
  verifiedGoogleProfile,
} = require("../src/googleAuth");

const CLIENT_ID = "1234567890-abcdef.apps.googleusercontent.com";
const config = googleConfig({
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "a-secret",
  SITE_URL: "https://www.onedailydrop.com/",
});

/* A token shaped exactly like Google's, signed with nothing. The signature is
   deliberately absent: this code path only ever sees tokens that came back
   over TLS from Google's token endpoint in exchange for our client secret,
   which is the case Google documents as not needing local verification. What
   these tests pin down is everything that decides whose account it is. */
const idToken = (claims) => {
  const part = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature-not-checked-here`;
};
const inAnHour = Math.floor(Date.now() / 1000) + 3600;
const goodClaims = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: inAnHour,
  sub: "104729384756102938475",
  email: "Shopper@Example.com",
  email_verified: true,
  name: "A Shopper",
};

assert(config.configured, "a client id and secret should be enough to offer Google sign-in");
assert.strictEqual(
  config.redirectUri,
  "https://www.onedailydrop.com/api/auth/google/callback",
  "the redirect must match what is registered with Google, trailing slash and all",
);
assert(
  !googleConfig({ GOOGLE_CLIENT_ID: CLIENT_ID }).configured &&
    !googleConfig({ GOOGLE_CLIENT_SECRET: "a-secret" }).configured &&
    !googleConfig({}).configured,
  "a half-configured Google client must not be offered: it fails after the shopper has already handed over their account",
);

const authorization = new URL(authorizationUrl(config, "the-state"));
assert.strictEqual(authorization.origin + authorization.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
assert.strictEqual(authorization.searchParams.get("client_id"), CLIENT_ID);
assert.strictEqual(authorization.searchParams.get("redirect_uri"), config.redirectUri);
assert.strictEqual(authorization.searchParams.get("response_type"), "code");
assert.strictEqual(authorization.searchParams.get("state"), "the-state");
assert(
  /\bemail\b/.test(authorization.searchParams.get("scope")) &&
    /\bopenid\b/.test(authorization.searchParams.get("scope")),
  "without openid and email there is no identity to sign anyone in with",
);
assert.strictEqual(
  authorization.searchParams.get("prompt"),
  "select_account",
  "people share computers; reusing whichever Google session the browser holds signs in the wrong person",
);

// The state is the whole security of the callback, so it has to be unguessable.
const states = new Set(Array.from({ length: 200 }, () => createState()));
assert.strictEqual(states.size, 200, "createState repeated itself");
assert([...states].every((state) => state.length >= 32), "the state is too short to be unguessable");

assert(statesMatch("abc123", "abc123"), "a matching state was rejected");
assert(!statesMatch("abc123", "abc124"), "a different state was accepted");
assert(!statesMatch("abc123", "abc1234"), "a state of a different length was accepted");
assert(!statesMatch("", ""), "an empty state was accepted, which is what a missing cookie looks like");
assert(!statesMatch("abc", undefined), "a missing state was accepted");

// The happy path, and the normalisation the rest of the app depends on.
const profile = verifiedGoogleProfile(idToken(goodClaims), CLIENT_ID);
assert(profile, "a valid Google token was rejected");
assert.strictEqual(profile.subject, goodClaims.sub);
assert.strictEqual(profile.email, "shopper@example.com", "the email must be lowercased before it is matched against an account");
assert.strictEqual(profile.name, "A Shopper");

/* Each of these is somebody else's account if it gets through. */
for (const [what, claims] of [
  ["a token issued to a different site", { ...goodClaims, aud: "someone-else.apps.googleusercontent.com" }],
  ["a token from an issuer that is not Google", { ...goodClaims, iss: "https://accounts.evil.example" }],
  ["an expired token", { ...goodClaims, exp: Math.floor(Date.now() / 1000) - 3600 }],
  ["a token with no expiry at all", { ...goodClaims, exp: undefined }],
  ["an unverified email address", { ...goodClaims, email_verified: false }],
  ["an email address Google says nothing about", { ...goodClaims, email_verified: undefined }],
  ["a token with no subject", { ...goodClaims, sub: "" }],
  ["a token with no email", { ...goodClaims, email: "" }],
]) {
  assert.strictEqual(
    verifiedGoogleProfile(idToken(claims), CLIENT_ID),
    null,
    `${what} was accepted as proof of identity`,
  );
}
for (const rubbish of ["", "not.a.token", "onlyonepart", null, undefined, "a..b"]) {
  assert.strictEqual(verifiedGoogleProfile(rubbish, CLIENT_ID), null, `"${rubbish}" was accepted as a token`);
}

/* Google profiles arrive without a name often enough to matter, and greeting
   somebody with an empty string is worse than guessing from their address. */
assert.strictEqual(
  verifiedGoogleProfile(idToken({ ...goodClaims, name: "" }), CLIENT_ID).name,
  "shopper",
  "a nameless Google profile should still produce something to greet the shopper with",
);

// A minute of clock skew is tolerated; an hour is not.
const justExpired = { ...goodClaims, exp: Math.floor(Date.now() / 1000) - 30 };
assert(
  verifiedGoogleProfile(idToken(justExpired), CLIENT_ID),
  "a token thirty seconds past expiry was rejected, which will lock out anyone whose clock is a second out",
);

(async () => {
  // The exchange sends what Google needs, and nothing it does not.
  let seen = null;
  await exchangeCodeForTokens(config, "the-code", {
    fetchFn: async (url, options) => {
      seen = { url, options };
      return { ok: true, json: async () => ({ id_token: idToken(goodClaims) }) };
    },
  });
  assert.strictEqual(seen.url, "https://oauth2.googleapis.com/token");
  assert.strictEqual(seen.options.method, "POST");
  const body = new URLSearchParams(seen.options.body);
  assert.strictEqual(body.get("code"), "the-code");
  assert.strictEqual(body.get("grant_type"), "authorization_code");
  assert.strictEqual(body.get("client_id"), CLIENT_ID);
  assert.strictEqual(body.get("client_secret"), "a-secret");
  assert.strictEqual(body.get("redirect_uri"), config.redirectUri);

  /* A refusal from Google has to raise, not return something falsy that the
     caller then treats as a profile. */
  await assert.rejects(
    exchangeCodeForTokens(config, "a-used-code", {
      fetchFn: async () => ({ ok: false, status: 400, text: async () => '{"error":"invalid_grant"}' }),
    }),
    /invalid_grant|400/,
    "a rejected code exchange did not raise",
  );

  console.log("Google sign-in identity, state and token exchange checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
