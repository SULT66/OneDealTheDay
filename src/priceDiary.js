/*
 * The Black Friday price diary: ten listings we started watching in October.
 *
 * On 27 November every shop on the internet will show a crossed-out price. The
 * only answer to that worth publishing is a price somebody wrote down before
 * the shop had a reason to flatter it, which is why this list is fixed in the
 * repository rather than chosen on the day. Swapping an entry in November
 * would quietly destroy the thing the page is for.
 *
 * Chosen by scripts/choose-price-diary.js on 16 October 2026 from the US
 * catalogue: one per category where November actually discounts, each with at
 * least a fortnight of our own observations behind it already.
 *
 * If a listing disappears before the 27th, the page says so for that row. An
 * empty row is a true reading — a shop withdrawing an item three weeks before
 * Black Friday is itself worth seeing — and it is not a reason to substitute
 * a fresher product with no history.
 */
const PRICE_DIARY = {
  market: 'us',
  startedAt: '2026-10-16',
  eventKey: 'black-friday',
  entries: [
    { id: '222102', bucket: 'Storage', note: 'USB 4.0 four-bay drive enclosure' },
    { id: '219964', bucket: 'Kitchen', note: '12-cup drip coffee maker' },
    { id: '225990', bucket: 'Outdoors', note: 'Inflatable 4–6 person tent' },
    { id: '228130', bucket: 'Monitors', note: '27-inch 4K 240Hz monitor' },
    { id: '223011', bucket: 'Headphones', note: 'Wired gaming headset' },
    { id: '217532', bucket: 'Tools', note: 'Cordless hammer drill and impact driver' },
    { id: '275312', bucket: 'Vacuums', note: 'Self-emptying robot vacuum' },
    { id: '372186', bucket: 'Toys', note: 'LEGO Icons set' },
    { id: '233724', bucket: 'Laptops', note: '14-inch 2-in-1 laptop' },
    { id: '221627', bucket: 'Storage', note: '2.5-inch external drive enclosure' },
  ],
};

module.exports = { PRICE_DIARY };
