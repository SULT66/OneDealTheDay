const assert = require("assert");
const fs = require("fs");
const path = require("path");

/*
 * A new account gets one email, and both ways in send it.
 *
 * Registration used to send nothing at all — not through Google, not through
 * the form — so a typo in an address went unnoticed until somebody tried to
 * reset a password they could never receive. It is also the only moment the
 * site can ask an account holder to subscribe: signing up and subscribing are
 * different things, and nothing connected them.
 */

const server = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");

const register = /app\.post\("\/api\/auth\/register"[\s\S]*?\n\}\);/.exec(server);
assert(register, "the registration route moved out of src/server.js");
assert(
  /sendWelcome\(/.test(register[0]),
  "signing up with an email and password sends nothing again",
);

const callback = /app\.get\("\/api\/auth\/google\/callback"[\s\S]*?\n\}\);/.exec(server);
assert(callback, "the Google callback moved out of src/server.js");
assert(
  /account\.created[\s\S]{0,120}sendWelcome\(/.test(callback[0]),
  "signing in with Google sends nothing again",
);
/*
 * Only on the first one. Google sign-in runs on every visit, so welcoming
 * whoever it hands back would mail somebody every single time they signed in —
 * which is the fastest way to be marked as spam by the people who liked you
 * enough to make an account.
 */
assert(
  /created: false/.test(server) && /created: true/.test(server),
  "the Google path no longer distinguishes a new account from a returning one",
);

/*
 * And a sign-up must not fail, or stall, because a mail provider did. The
 * account exists either way and the person is standing in front of the screen.
 */
assert(
  /welcomeEmail\(user\)\.catch\(/.test(server),
  "a failed welcome can now break or delay a registration",
);

/* Transactional, so no unsubscribe of its own: there is nothing to
   unsubscribe from until they say yes to something. */
const mailer = fs.readFileSync(path.join(__dirname, "..", "src", "mailer.js"), "utf8");
const welcome = /const welcomeEmail = [\s\S]*?\n\}\);/.exec(mailer);
assert(welcome, "the welcome email moved out of src/mailer.js");
assert(
  !/unsubscribeUrl/.test(welcome[0]),
  "the welcome carries an unsubscribe for a list nobody is on yet",
);
/* The ask that makes the email worth sending at all. */
assert(
  /#subscribe/.test(welcome[0]),
  "the welcome no longer invites the one person most likely to say yes",
);

console.log("Welcome email checks passed: both sign-up paths, first time only, never blocking.");
