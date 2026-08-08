# OneDealTheDay Auto

MVP for publishing original daily product selections from verified retailer sources.

## Start on Windows
1. Install Node.js 20+.
2. Extract the ZIP.
3. Open PowerShell in the folder.
4. Run:
```powershell
Copy-Item .env.example .env
npm install
npm start
```
5. Open http://localhost:8088
6. Admin: http://localhost:8088/admin

The site does not load demo products. Until verified products are added, visitors see an honest catalog update page with no sample prices, ratings or products.

## Product sources
Public products must use an explicitly approved source:

- `ebay` for Browse API product data and EPN-tracked links;
- `amazon-creators-api` or `amazon-pa-api` after official Amazon API access;
- `bestbuy-products-api` after official Best Buy API access.

Legacy scraping providers, demo catalogs and hand-entered Amazon products are not enabled.

### Full multi-retailer automation

OneDailyDrop runs every configured source at the same time. A failed store is
isolated, so successful stores still refresh. All valid offers are retained for
cross-store comparisons, while the daily Top 10 contains unique products.

Native adapters cover eBay, Amazon and Walmart. Approved affiliate feeds cover
Walmart, Target, Best Buy, Home Depot, Lowe's, Wayfair, AliExpress, Currys,
Mooncool, AO.com, Fnac, Cdiscount, Darty, MediaMarkt, Saturn, OTTO, ALTERNATE and Samsung
across the US, Canada, UK, France and Germany. Feeds may be JSON, CSV, TSV, XML
or gzip-compressed and are enabled only by their encrypted `AFFILIATE_FEED_*_URL`
setting. No retailer is scraped.

Stores outside the built-in catalog can be connected without a code change via
`AFFILIATE_FEEDS_JSON`, using the same normalized schema and safety checks.

Each market publishes a new Top 10 nightly and checks offers every six hours.
Source-level outcomes, stale offers and failures are recorded. Email and social
content packets are prepared in `distribution_queue`; external delivery remains
disabled until the relevant channel credentials are configured.

The optional `*_FIELD_MAP_JSON` setting maps unusual feed columns to the common
schema. Example: `{"title":"merchant_product_name","affiliate_url":"aw_deep_link"}`.
The optional `*_HEADERS_JSON` setting supplies feed authorization headers and
must be stored only in the hosting provider's encrypted app settings.

### Mooncool through Awin

Mooncool is a built-in Awin retailer for the US and Canada. In Awin, create a
separate market/currency feed for each storefront and include at least
`aw_product_id`, `product_name`, `description`, `merchant_category`,
`brand_name`, `search_price`, `rrp_price`, `currency`, `merchant_image_url`,
`aw_deep_link` and `in_stock`. Store the signed URLs only as:

- `AFFILIATE_FEED_MOONCOOL_US_URL`
- `AFFILIATE_FEED_MOONCOOL_CA_URL`

The importer accepts Awin comma-, tab- or pipe-delimited CSV and gzip responses.
It uses `aw_deep_link`, not the untracked merchant URL, for outbound clicks.

The ranking uses search position, rating, review volume, discount and popularity badges. Previous products are archived and the best ten are published.

Before public launch, use HTTPS, protect `.env`, add Privacy/Terms/Contact pages, and comply with Amazon Associates and product-data provider rules. Do not scrape Amazon directly.

## eBay account-deletion compliance

Production endpoint:

`https://www.onedailydrop.com/api/ebay/account-deletion`

Configure these values only in the hosting provider's encrypted app settings:

- `EBAY_VERIFICATION_TOKEN`: 32–80 characters using letters, numbers, `_` or `-`;
- `EBAY_CLIENT_ID`: production App ID/Client ID;
- `EBAY_CLIENT_SECRET`: production Cert ID/Client Secret;
- `EBAY_CAMPAIGN_ID`: the 10-digit eBay Partner Network campaign ID;
- `EBAY_ACCOUNT_DELETION_ENDPOINT`: the exact production URL above;
- `EBAY_ENVIRONMENT`: `production`.

The GET route answers eBay's endpoint challenge. The POST route validates
`X-EBAY-SIGNATURE` with eBay's public-key API before acknowledging a deletion
notification. OneDailyDrop does not store eBay member accounts; it records only
the notification ID and processing timestamps for idempotency, never the eBay
username, eBay user ID or full notification payload.

## eBay Browse API catalog

When the production Client ID, Client Secret and Campaign ID are configured,
eBay becomes an approved live catalog source automatically. OneDailyDrop searches
the US, Canada, Great Britain, France and Germany marketplaces, follows the best
candidates with item-detail requests, and publishes only new fixed-price listings
with EPN commission links and current offer data. Product-review evidence is used
when eBay provides it; otherwise the item must come from an established seller
with strong feedback, and the site does not invent or relabel a product rating.
The daily selection refreshes nightly and checks offers every six hours.
