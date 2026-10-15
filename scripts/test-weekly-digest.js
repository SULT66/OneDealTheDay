/*
 * The Sunday digest: who may receive it, what goes in it, and what stops it.
 *
 * Built on the real schema from src/db.js, the way test-page-views.js is, so a
 * query naming a column that does not exist fails here rather than quietly
 * sending nobody anything on a Sunday morning.
 *
 * The assertion this file exists for is the first one under "the promise".
 * The signup form says "Only Live Drop emails"; a digest reaching somebody who
 * only ever agreed to that is not a bug to be fixed next week, it is a spam
 * report against the domain, and every other email we send lands in Promotions
 * afterwards.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

class TestDatabase {
  constructor(filename) { this.database = new DatabaseSync(filename); }
  pragma(value) { this.database.exec(`PRAGMA ${value}`); }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => statement.run(...params),
    };
  }
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-digest-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const {
  chooseDigestItems,
  digestEvidence,
  unconfirmedDiscountCount,
} = require("../src/digestSelection");
const {
  editionFor,
  isDigestDay,
  recentlySentIds,
  sendDigestInvitations,
  sendWeeklyDigest,
} = require("../src/weeklyDigest");

/* ------------------------------------------------------------- the clock */

/*
 * The server runs on UTC and the readers are in New York, so "Sunday" is a
 * question about a timezone. 02:00 UTC on Sunday is still Saturday evening
 * there — sending then is a Saturday email — and in March and November the
 * offset is not even the same one.
 */
assert.strictEqual(isDigestDay(Date.parse("2026-10-18T14:00:00Z")), true, "Sunday afternoon in New York is not Sunday");
assert.strictEqual(isDigestDay(Date.parse("2026-10-18T02:00:00Z")), false, "Saturday evening in New York counted as Sunday");
assert.strictEqual(isDigestDay(Date.parse("2026-10-19T03:00:00Z")), true, "Sunday evening in New York stopped counting as Sunday");
assert.strictEqual(editionFor(Date.parse("2026-10-19T03:00:00Z")), "2026-10-18", "the edition key crossed midnight early");
/* Across the November clock change, when the offset moves from -4 to -5. */
assert.strictEqual(editionFor(Date.parse("2026-11-02T04:30:00Z")), "2026-11-01", "the clock change moved the edition");

/* -------------------------------------------------------------- the pick */

const listing = (id, score, category, extra = {}) => ({
  id,
  title: `Listing ${id}`,
  deal_url: `/us/deal/${id}`,
  image_url: `https://example.test/${id}.jpg`,
  current_price: 19.99,
  currency: "USD",
  public_category: category,
  display_score: score,
  rating: 4.8,
  review_count: 40,
  tracked_drop_percent: 0,
  ...extra,
});

/* The floor is a floor, not a ranking: 79 does not get in because it is the
   best thing left. */
assert.deepStrictEqual(
  chooseDigestItems([listing(1, 79, "Office"), listing(2, 78, "Tools")]).map((item) => item.id),
  [],
  "a listing below the Score floor was sent because nothing better was available",
);

assert.strictEqual(
  chooseDigestItems([listing(1, 86, "Office"), listing(2, 90, "Tools")])[0].id,
  2,
  "the listings were not ordered by Score",
);

/* Three items when there are three. A weekly email that always finds exactly
   five things has stopped looking. */
assert.strictEqual(
  chooseDigestItems([listing(1, 88, "Office"), listing(2, 86, "Tools"), listing(3, 84, "Pet Supplies")]).length,
  3,
  "a thin week was padded out to five",
);

/* No category may fill the email while other categories are waiting. */
const lopsided = [
  listing(1, 95, "Toys & Games"), listing(2, 94, "Toys & Games"), listing(3, 93, "Toys & Games"),
  listing(4, 92, "Toys & Games"), listing(5, 91, "Toys & Games"), listing(6, 82, "Office"),
  listing(7, 81, "Tools"),
];
const spread = chooseDigestItems(lopsided);
assert.strictEqual(
  spread.filter((item) => item.public_category === "Toys & Games").length,
  2,
  "one category filled the digest while others were available",
);
assert.strictEqual(spread.length, 4, "the cap was abandoned to fill the last slot");

/* And the cap holds even when it is the only thing standing between the
   reader and five of the same. A short email is the better answer. */
assert.strictEqual(
  chooseDigestItems(lopsided.slice(0, 5)).length,
  2,
  "a week whose eligible listings are all one category sent five of them",
);

/* Last week's five are used up. */
assert.deepStrictEqual(
  chooseDigestItems(
    [listing(1, 95, "Office"), listing(2, 94, "Tools"), listing(3, 93, "Pet Supplies")],
    { recentlySent: new Set(["1", "2"]) },
  ).map((item) => item.id),
  [3],
  "a listing sent in a recent digest was sent again",
);

/* A listing with nowhere to go, or nothing to show, is not a card. */
assert.strictEqual(
  chooseDigestItems([
    { ...listing(1, 95, "Office"), image_url: "" },
    { ...listing(2, 94, "Tools"), deal_url: "" },
  ]).length,
  0,
  "a listing with no picture or no link was put in the email anyway",
);

/* The evidence line says only what was measured. */
assert.ok(
  !digestEvidence(listing(1, 86, "Office")).some((reason) => /below/.test(reason)),
  "a fall was claimed for a listing with no recorded fall",
);
assert.ok(
  digestEvidence(listing(1, 86, "Office", { tracked_drop_percent: 12 }))
    .some((reason) => reason.includes("12% below the highest daily price we recorded")),
  "a recorded fall was not stated",
);

/* The closing count: a retailer discount our own observations cannot confirm. */
assert.strictEqual(
  unconfirmedDiscountCount([
    { original_price: 50, current_price: 25, tracked_drop_percent: 0 },
    { original_price: 50, current_price: 25, tracked_drop_percent: 9 },
    { original_price: 0, current_price: 25, tracked_drop_percent: 0 },
  ]),
  1,
  "the unconfirmed-discount count is counting the wrong listings",
);

/* ------------------------------------------------------------ the sending */

const now = Date.parse("2026-10-18T14:00:00Z"); // Sunday, 10:00 in New York
const iso = (value) => new Date(value).toISOString();

const addSubscriber = ({ email, digest = 0, token }) => {
  db.prepare(
    `INSERT INTO subscribers(email,categories,status,source,market,unsubscribe_token,
       digest_opt_in,digest_opt_in_at,created_at,updated_at)
     VALUES(?,'[]','active','homepage','us',?,?,?,?,?)`,
  ).run(email, token, digest, digest ? iso(now) : null, iso(now - 30 * 864e5), iso(now));
  return db.prepare("SELECT id FROM subscribers WHERE email = ?").get(email).id;
};

const catalogue = [
  listing(101, 91, "Electronics", { tracked_drop_percent: 20 }),
  listing(102, 90, "Toys & Games", { tracked_drop_percent: 16 }),
  listing(103, 90, "Toys & Games"),
  listing(104, 89, "Office"),
  listing(105, 88, "Tools & DIY"),
  listing(106, 87, "Pet Supplies"),
  { original_price: 60, current_price: 35, tracked_drop_percent: 0 },
];

async function main() {
  const onlyLiveDrops = addSubscriber({ email: "livedrop@example.test", token: "token_livedrop_0123456789" });
  const wantsSundays = addSubscriber({ email: "sunday@example.test", digest: 1, token: "token_sunday_0123456789ab" });

  const sentTo = [];
  const collect = async (message) => { sentTo.push(message); };

  const first = await sendWeeklyDigest({
    db,
    market: "us",
    products: catalogue,
    sendDigest: collect,
    now,
    unsubscribeUrlFor: (subscriber) => `https://example.test/digest/stop?token=${subscriber.unsubscribe_token}`,
  });

  /* --------------------------------------------------------- the promise */

  assert.strictEqual(first.status, "sent", `the digest did not send: ${JSON.stringify(first)}`);
  assert.deepStrictEqual(
    sentTo.map((message) => message.email),
    ["sunday@example.test"],
    "the Sunday digest reached somebody who only ever agreed to Live Drop emails",
  );
  assert.ok(
    !sentTo.some((message) => message.email === "livedrop@example.test"),
    "the form promised 'Only Live Drop emails' and this broke that promise",
  );

  assert.strictEqual(sentTo[0].items.length, 5, "the digest did not carry five listings");
  assert.strictEqual(sentTo[0].unconfirmed, 1, "the closing count did not reach the email");
  assert.ok(sentTo[0].unsubscribeUrl.includes("digest/stop"), "the digest carried no way off its own list");
  assert.ok(
    sentTo[0].items.every((item) => item.href.startsWith("https://")),
    "a listing link in the email is not absolute, so it cannot be opened from an inbox",
  );

  /* ----------------------------------------------------- and never twice */

  const again = await sendWeeklyDigest({ db, market: "us", products: catalogue, sendDigest: collect, now });
  assert.strictEqual(again.status, "already-sent", "the same Sunday was sent a second time");
  assert.strictEqual(sentTo.length, 1, "a restart sent the digest again");

  /* Next week does not repeat this week. */
  const nextWeek = now + 7 * 864e5;
  assert.strictEqual(
    recentlySentIds(db, { market: "us", now: nextWeek }).size,
    5,
    "the digest did not record what it used",
  );
  /*
   * Week one used five of the six eligible listings, so week two has exactly
   * one thing left to say — and says it, rather than padding or repeating.
   * This is the whole "fewer when that is all there is" rule, end to end.
   */
  const second = [];
  const nextResult = await sendWeeklyDigest({
    db,
    market: "us",
    products: catalogue,
    sendDigest: async (message) => second.push(message),
    now: nextWeek,
  });
  assert.strictEqual(nextResult.status, "sent", "the second week did not go out");
  assert.strictEqual(second[0].items.length, 1, "the second week repeated or padded the first");
  assert.strictEqual(
    second[0].items[0].id,
    106,
    "the one listing the first week had not used was not the one sent",
  );

  /* And a week with nothing left sends nothing at all, rather than an empty
     email or last week's five again. */
  const emptyWeek = [];
  const nothing = await sendWeeklyDigest({
    db,
    market: "us",
    products: catalogue,
    sendDigest: async (message) => emptyWeek.push(message),
    now: nextWeek + 864e5,
    force: true,
  });
  assert.strictEqual(
    nothing.status,
    "nothing-cleared-the-floor",
    "a week with nothing new to say sent last week's listings again",
  );
  assert.strictEqual(emptyWeek.length, 0, "an email went out with nothing in it");

  /* A drop is the better email, and beats the digest that week. */
  const thirdWeek = nextWeek + 7 * 864e5;
  db.prepare(
    `INSERT INTO live_drops(drop_key,market,title,start_at,end_at,created_at,updated_at)
     VALUES('drop-test','us','A drop',?,?,?,?)`,
  ).run(
    iso(thirdWeek - 864e5),
    iso(thirdWeek - 864e5 + 6e5),
    iso(thirdWeek - 2 * 864e5),
    iso(thirdWeek - 2 * 864e5),
  );
  const dropId = db.prepare("SELECT id FROM live_drops WHERE drop_key = 'drop-test'").get().id;
  db.prepare("INSERT INTO live_drop_announcements(drop_id,subscriber_id,sent_at) VALUES(?,?,?)")
    .run(dropId, wantsSundays, iso(thirdWeek - 864e5));
  const third = await sendWeeklyDigest({
    db,
    market: "us",
    products: [listing(201, 93, "Fashion"), listing(202, 92, "Baby & Kids")],
    sendDigest: async () => { throw new Error("nobody should have been written to"); },
    now: thirdWeek,
  });
  assert.strictEqual(
    third.status,
    "nobody-opted-in",
    "somebody told about a Live Drop the day before was also sent the digest",
  );

  /* ------------------------------------------------------- the invitation */

  const invites = [];
  const askedOnce = await sendDigestInvitations({
    db,
    sendInvite: async (message) => { invites.push(message); },
    joinUrlFor: (subscriber) => `https://example.test/digest/join?token=${subscriber.unsubscribe_token}`,
    now,
  });
  assert.strictEqual(askedOnce, 1, "the Live Drop subscriber was not invited to the Sunday list");
  assert.deepStrictEqual(
    invites.map((message) => message.email),
    ["livedrop@example.test"],
    "the invitation went to somebody already on the Sunday list",
  );
  assert.ok(invites[0].joinUrl.includes("digest/join"), "the invitation carried no way to accept it");

  const askedTwice = await sendDigestInvitations({
    db,
    sendInvite: async () => { throw new Error("nobody should be asked twice"); },
    joinUrlFor: () => "",
    now: now + 864e5,
  });
  assert.strictEqual(askedTwice, 0, "a subscriber was asked twice, which is a newsletter nobody agreed to");

  /* And an address that left is asked nothing at all. */
  db.prepare("UPDATE subscribers SET status = 'unsubscribed', digest_invited_at = NULL WHERE id = ?")
    .run(onlyLiveDrops);
  const afterLeaving = await sendDigestInvitations({
    db,
    sendInvite: async () => { throw new Error("an unsubscribed address was written to"); },
    joinUrlFor: () => "",
    now,
  });
  assert.strictEqual(afterLeaving, 0, "somebody who unsubscribed was invited to a second list");

  console.log("Weekly digest checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
