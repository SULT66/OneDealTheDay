/* Verify that requested event reminders stay separate from sales campaigns. */
const assert = require('assert');
const sent = [];
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).includes('api.sendgrid.com')) {
    sent.push(JSON.parse(options.body));
    return new Response('', {status: 202});
  }
  return originalFetch(url, options);
};
process.env.SENDGRID_API_KEY = 'SG.test-key';
process.env.EMAIL_FROM = 'info@onedailydrop.com';
const {
  liveDropAnnouncementEmail, liveDropSaveTheDateEmail, liveDropStartingSoonEmail,
  liveDropReminderEmail, liveDropLiveNowEmail,
} = require('../src/mailer');
const product = {
  email: 'test@example.com', title: 'Pet Lodge Automatic Dog Feeder, 25 lb',
  brand: 'Pet Lodge', retailerName: 'eBay', market: 'us',
  imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l500.jpg',
  retailPrice: '219.99', currency: 'USD', startsAt: 'Wed, 09 Sep 2026 21:00:00 GMT',
};
const unsubscribeUrl = 'https://www.onedailydrop.com/unsubscribe?token=test';
const htmlOf = m => m.content.find(p => p.type === 'text/html').value;
const textOf = m => m.content.find(p => p.type === 'text/plain').value;
(async () => {
  await liveDropAnnouncementEmail({...product, unsubscribeUrl});
  await liveDropSaveTheDateEmail({...product, unsubscribeUrl});
  await liveDropStartingSoonEmail({...product, minutes: 45});
  await liveDropReminderEmail({...product, minutes: 7});
  await liveDropLiveNowEmail({...product, asked: true});
  await liveDropLiveNowEmail({...product, asked: false, unsubscribeUrl});
  assert.strictEqual(sent.length, 6);
  for (const message of sent) {
    const html = htmlOf(message), text = textOf(message);
    assert.strictEqual(message.content[0].type, 'text/plain');
    assert.match(text, /Pet Lodge Automatic Dog Feeder/);
    assert.match(text, /https:\/\/www\.onedailydrop\.com\/us\/live/);
    assert.doesNotMatch(text, /<[a-z]|@media|email-product|<!doctype/i);
    assert.doesNotMatch(html, /59\.99/, 'the pre-reveal price must never leak');
    assert.strictEqual(message.from.email, 'info@onedailydrop.com', 'keep the configured sender');
    assert.strictEqual(message.tracking_settings.click_tracking.enable, false);
    assert.strictEqual(message.tracking_settings.open_tracking.enable, false);
    for (const href of html.match(/href="([^"]+)"/g) || []) {
      assert.match(href, /href="https?:\/\//, 'email links must be absolute');
    }
  }
  // Only actual requested reminders use the concise, factual event template.
  for (const i of [1, 2, 3, 4]) {
    const m = sent[i], html = htmlOf(m), text = textOf(m);
    assert.strictEqual(m.from.name, 'OneDailyDrop reminders');
    assert.match(text, /You asked OneDailyDrop to remind you/);
    assert.doesNotMatch(html, /<img|#b8ec44|219\.99|Available on|text-decoration:line-through/i);
    assert.doesNotMatch(text, /buy now|grab|ten minutes only|nothing to unsubscribe/i);
    assert.strictEqual((html.match(/href=/g) || []).length, i === 1 ? 2 : 1);
  }
  assert.match(sent[2].subject, /45 minutes/);
  assert.match(sent[3].subject, /7 minutes/);
  assert.match(textOf(sent[3]), /7 minutes/);
  assert.match(textOf(sent[1]), /Sep|September/);
  assert.match(sent[4].subject, /has started/);
  // Subscriber campaigns retain product details and working one-click opt-out.
  for (const i of [0, 5]) {
    assert.match(htmlOf(sent[i]), /219\.99/);
    assert.match(htmlOf(sent[i]), /i\.ebayimg\.com/);
    assert.match(htmlOf(sent[i]), /#b8ec44/i);
    assert.match(htmlOf(sent[i]), /Unsubscribe/);
    assert.strictEqual(sent[i].headers['List-Unsubscribe'], `<${unsubscribeUrl}>`);
    assert.strictEqual(sent[i].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  }
  assert.strictEqual(sent[1].headers['List-Unsubscribe'], `<${unsubscribeUrl}>`, 'preserve a supplied unsubscribe URL');
  // Site-uploaded photos need absolute URLs in campaigns that include imagery.
  await liveDropAnnouncementEmail({...product, imageUrl: '/media/uploads/backpack.png'});
  assert.match(htmlOf(sent.at(-1)), /src="https:\/\/www\.onedailydrop\.com\/media\/uploads\/backpack\.png"/);
  await liveDropAnnouncementEmail({...product, imageUrl: ''});
  assert.doesNotMatch(htmlOf(sent.at(-1)), /<img/i);
  await liveDropReminderEmail({...product, title: 'Backpack <script>alert(1)</script>', minutes: 7});
  assert.doesNotMatch(htmlOf(sent.at(-1)), /<script>/i, 'user-supplied titles must stay escaped');
  assert.match(htmlOf(sent.at(-1)), /&lt;script&gt;/);
  console.log('Drop emails: factual requested reminders, marketing opt-out, price secrecy and absolute media passed.');
})().catch(error => { console.error(error); process.exit(1); });
