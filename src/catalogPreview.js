const { canonicalCategory, PUBLIC_CATEGORIES, FALLBACK_CATEGORY } = require("./catalogTaxonomy");
const { createEbayClient, candidateIsUsable, normalizeItem } = require("./providers/ebay");
const rakutenNewegg = require("./providers/rakutenNewegg");
const affiliateFeed = require("./providers/affiliateFeed");

/**
 * What every connected shop could give us, category by category, without
 * publishing anything.
 *
 * The question this exists to answer is "how many products per category would
 * we actually have", and the honest answer to it was: nobody knows, because
 * the catalogue is whatever a list of search terms happens to drag back. The
 * alternative to measuring was quoting a number I had estimated, which is the
 * one thing that must not happen to a figure somebody is about to plan around.
 *
 * Nothing here writes to the database and nothing here publishes. It runs the
 * same searches the refresh runs, counts what comes back, and throws it away.
 *
 * The eBay half is deliberately search-only. A refresh spends a second call per
 * candidate to fetch its full detail, which is where the daily allowance
 * actually goes; a search summary already carries the two things this needs —
 * whether eBay recognises the item as a catalogue product, and enough title to
 * classify it. So a full preview of forty-seven keywords costs forty-seven
 * calls out of five thousand, rather than several hundred.
 */

const EMPTY_CATEGORIES = () =>
  Object.fromEntries([...PUBLIC_CATEGORIES, FALLBACK_CATEGORY].map((name) => [name, 0]));

function classify(keyword, title) {
  /* The same classifier the catalogue uses, fed the same two things it would
     get at import: the search term as the source category, and the title. */
  return canonicalCategory({ category: keyword, title });
}

function summarise({ id, name, kind, note }) {
  return {
    id,
    name,
    kind,
    note: note || "",
    offered: 0,
    usable: 0,
    withIdentity: 0,
    withRating: 0,
    categories: EMPTY_CATEGORIES(),
    apiCalls: 0,
    error: "",
  };
}

function record(summary, { category, identity, rating }) {
  summary.usable += 1;
  if (identity) summary.withIdentity += 1;
  if (rating) summary.withRating += 1;
  if (summary.categories[category] == null) summary.categories[category] = 0;
  summary.categories[category] += 1;
}

/*
 * eBay, one search per keyword and no detail calls.
 *
 * `epid` is eBay's own catalogue id: it means eBay has matched this listing to
 * a product it knows, which is where ratings and review counts come from. A
 * listing without one is a seller's own description of something, and no
 * amount of refreshing will give it evidence. That is the number worth
 * counting here — 40% of what the current keywords bring back.
 */
async function previewEbay(config, market, { keywords, fetchImpl, signal }) {
  const summary = summarise({
    id: "ebay",
    name: "eBay Browse API",
    kind: "search",
    note: "one API call per keyword; no detail calls are made",
  });
  const client = createEbayClient({
    clientId: config.ebayClientId,
    clientSecret: config.ebayClientSecret,
    campaignId: config.ebayCampaignId,
    fetchImpl,
    signal,
  });

  for (const keyword of keywords) {
    if (signal?.aborted) break;
    let items = [];
    try {
      items = await client.search(keyword, market);
      summary.apiCalls += 1;
    } catch (error) {
      summary.error = summary.error || error.message;
      continue;
    }
    summary.offered += items.length;
    for (const item of items) {
      if (!candidateIsUsable(item)) continue;
      const product = normalizeItem(item, keyword, 1, market);
      record(summary, {
        category: classify(keyword, product.title),
        identity: Boolean(item.epid || product.gtin || product.upc),
        rating: Number(product.rating) > 0,
      });
    }
  }
  return summary;
}

/*
 * Newegg through Rakuten. Counted for completeness and for one fact worth
 * seeing in a table rather than being told: its product search returns no
 * review data at all, for any item, so withRating is structurally zero here
 * however many listings it offers.
 */
async function previewNewegg(config, market, { keywords, fetchImpl }) {
  const summary = summarise({
    id: "newegg",
    name: "Newegg via Rakuten Product Search",
    kind: "search",
    note: "Rakuten's product search carries no review data for any listing",
  });
  try {
    const products = await rakutenNewegg.searchProducts({
      clientId: config.rakutenClientId,
      clientSecret: config.rakutenClientSecret,
      publisherSid: config.rakutenPublisherSid,
      mid: config.rakutenNeweggMid,
      keywords,
      market,
      fetchImpl,
    });
    summary.apiCalls = keywords.length;
    summary.offered = products.length;
    for (const product of products) {
      record(summary, {
        category: classify(product.category, product.title),
        identity: Boolean(product.gtin || product.upc || product.mpn),
        rating: Number(product.rating) > 0,
      });
    }
  } catch (error) {
    summary.error = error.message;
  }
  return summary;
}

/*
 * An affiliate feed, and the part of it we currently throw away.
 *
 * These cost no allowance at all — the whole file is downloaded either way —
 * so the interesting number is not what the shop offers but what our own rules
 * discard. King Koil returns thirty products a run and publishes one, because
 * its policy keeps only the Mattresses leaf. Nobody looking at the site would
 * ever guess that.
 */
async function previewFeed(definition, market, { fetchImpl, signal }) {
  const summary = summarise({
    id: `feed-${definition.retailerId}`,
    name: `${definition.retailerName} ${definition.network} feed`,
    kind: "feed",
    note: "the whole feed is downloaded either way; no API allowance is spent",
  });
  try {
    const map = Object.fromEntries(
      Object.entries(JSON.parse(definition.fieldMapJson || "{}")).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
    const downloaded = await affiliateFeed.download(definition, fetchImpl, 0, signal);
    const records = affiliateFeed.parseRecords(downloaded, definition.format);
    summary.offered = records.length;

    for (const [index, raw] of records.entries()) {
      const product = affiliateFeed.normalize(raw, definition, market, index, map);
      if (!product?.title || !(product.current_price > 0)) continue;
      /* Counted only if our own feed policy would let it through, so the
         difference between `offered` and `usable` is exactly what our rules
         remove rather than what the shop failed to send. */
      if (!affiliateFeed.allowedByFeedPolicy(product, definition)) continue;
      record(summary, {
        category: classify(product.category, product.title),
        identity: Boolean(product.gtin || product.upc || product.ean || product.mpn),
        rating: Number(product.rating) > 0,
      });
    }
    if (definition.maxProducts && summary.usable > definition.maxProducts) {
      summary.note = `${summary.note}; capped at ${definition.maxProducts} on import`;
    }
  } catch (error) {
    summary.error = error.message;
  }
  return summary;
}

/**
 * Every connected shop for one market, counted and thrown away.
 */
async function previewMarket(config, market, { fetchImpl = global.fetch, signal, keywordLimit = 0 } = {}) {
  const sources = [];
  const ebayKeywords = keywordLimit
    ? (market.searchKeywords || []).slice(0, keywordLimit)
    : market.searchKeywords || [];

  if (config.ebayClientId && config.ebayClientSecret && ebayKeywords.length) {
    sources.push(await previewEbay(config, market, { keywords: ebayKeywords, fetchImpl, signal }));
  }
  if (
    market.code === "us" &&
    config.rakutenClientId &&
    config.rakutenClientSecret &&
    config.rakutenPublisherSid
  ) {
    const keywords = keywordLimit
      ? config.rakutenNeweggKeywords.slice(0, keywordLimit)
      : config.rakutenNeweggKeywords;
    sources.push(await previewNewegg(config, market, { keywords, fetchImpl }));
  }
  for (const definition of config.affiliateFeeds || []) {
    if (!definition.markets.includes(market.code)) continue;
    sources.push(await previewFeed(definition, market, { fetchImpl, signal }));
  }

  /* The whole point of the exercise: one row per category with every shop's
     contribution to it, so an empty shelf is visible as an empty shelf. */
  const byCategory = {};
  for (const name of [...PUBLIC_CATEGORIES, FALLBACK_CATEGORY]) {
    byCategory[name] = Object.fromEntries(
      sources.map((source) => [source.id, source.categories[name] || 0]),
    );
    byCategory[name].total = Object.values(byCategory[name]).reduce((sum, n) => sum + n, 0);
  }

  return {
    market: market.code,
    generatedAt: new Date().toISOString(),
    apiCallsSpent: sources.reduce((sum, source) => sum + source.apiCalls, 0),
    sources: sources.map(({ categories, ...rest }) => rest),
    byCategory,
  };
}

module.exports = { previewMarket };
