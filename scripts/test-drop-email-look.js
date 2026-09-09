/*
 * What a Live Drop email actually contains.
 *
 * They were a heading, the product's name as bare text and an orange button —
 * orange, on a site whose accent has been lime for months — and nothing showed
 * the thing being sold. An email announcing a ten minute event for one product,
 * with no picture of the product, asks somebody to care on trust.
 *
 * The one thing that must never appear is the drop price. Hiding it until the
 * reveal is the mechanic the whole format rests on: the page does not send it
 * beforehand, and neither may the mail. That is easy to break by adding a field
 * to a template in a hurry, so it is asserted on every one of them.
 */

const assert = require("assert");
const Module = require("module");

/* Capture what would be sent, without a network and without a key. */
const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).includes("api.sendgrid.com")) {
    sent.push(JSON.parse(options.body));
    return new Response("", { status: 202 });
  }
  return realFetch(url, options);
};

process.env.SENDGRID_API_KEY = "SG.test-key";
process.env.EMAIL_FROM = "info@onedailydrop.com";

const {
  liveDropAnnouncementEmail,
  liveDropSaveTheDateEmail,
  liveDropStartingSoonEmail,
} = require("../src/mailer");

const product = {
  title: "Pet Lodge Automatic Dog Feeder, 25 lb",
  brand: "Pet Lodge",
  retailerName: "eBay",
  imageUrl: "https://i.ebayimg.com/images/g/abc/s-l500.jpg",
  retailPrice: "219.99",
  currency: "USD",
  market: "us",
};

/* The number that must never leave the server before the reveal. */
const DROP_PRICE = "59.99";

const bodyOf = (message) => String(message.content[0].value);

(async () => {
  await liveDropAnnouncementEmail({
    ...product,
    email: "a@example.com",
    startsAt: "Wed, 09 Sep 2026 21:00:00 GMT",
    unsubscribeUrl: "https://www.onedailydrop.com/unsubscribe?token=abc",
  });
  await liveDropSaveTheDateEmail({
    ...product,
    email: "b@example.com",
    startsAt: "Wed, 09 Sep 2026 21:00:00 GMT",
    unsubscribeUrl: "https://www.onedailydrop.com/unsubscribe?token=abc",
  });
  await liveDropStartingSoonEmail({ ...product, email: "c@example.com", minutes: 45 });

  assert.strictEqual(sent.length, 3, "all three drop emails were built");

  for (const message of sent) {
    const html = bodyOf(message);

    /* The product, visible. */
    assert.match(html, /Pet Lodge Automatic Dog Feeder/, "the product is named");
    assert.match(html, /i\.ebayimg\.com/, "the picture is in the email");
    assert.match(html, /Sold and shipped by eBay/, "the shop is named");
    assert.match(html, /219\.99/, "the usual price is shown");

    /* The site's own colour, not the orange these used to carry. */
    assert.match(html, /#b8ec44/i, "the call to action is in the site's accent");
    assert.doesNotMatch(html, /#ff6b00/i, "the old orange is gone");

    /*
     * The mechanic. A drop email that leaks the price has given away the only
     * reason to turn up at a particular minute.
     */
    assert.doesNotMatch(
      html,
      new RegExp(DROP_PRICE.replace(".", "\\.")),
      "a drop email must never carry the drop price",
    );

    /* Mail clients: a stylesheet is stripped and flexbox is not understood, so
       the layout has to survive on tables and inline styles alone. */
    assert.doesNotMatch(html, /<style/i, "no stylesheet — Gmail removes it");
    assert.doesNotMatch(html, /display:\s*flex/i, "no flexbox — Outlook ignores it");
    assert.match(html, /<table/i, "laid out with a table");

    /* Every link is absolute: a relative href in an email goes nowhere. */
    for (const href of html.match(/href="([^"]+)"/g) || []) {
      assert.match(href, /href="https?:\/\//, `a relative link cannot work in an email: ${href}`);
    }
  }

  /* Marketing carries the way out; a reminder that was asked for does not
     pretend to be a subscription.
     Asserted on the link rather than the word: the starting-soon note says
     "nothing else to unsubscribe from", which is the opposite of offering
     one and would pass a search for the word either way. */
  const unsubscribeLink = /href="[^"]*\/unsubscribe/i;
  const [announcement, saveTheDate, startingSoon] = sent.map(bodyOf);
  assert.match(announcement, unsubscribeLink, "the announcement is marketing and offers a way out");
  assert.match(saveTheDate, unsubscribeLink);
  assert.doesNotMatch(startingSoon, unsubscribeLink, "a requested reminder has nothing to leave");

  /* And it still works for a drop with no picture, which is allowed. */
  sent.length = 0;
  await liveDropAnnouncementEmail({
    email: "d@example.com",
    title: "A drop with no photo",
    market: "us",
    startsAt: "Wed, 09 Sep 2026 21:00:00 GMT",
  });
  const bare = bodyOf(sent[0]);
  assert.match(bare, /A drop with no photo/);
  assert.doesNotMatch(bare, /<img/i, "no image tag when there is no image");
  assert.doesNotMatch(bare, /usual price/i, "no price line when there is no price");

  console.log("drop email look: ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
