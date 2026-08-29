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
Tribesigns, Mooncool, AO.com, Fnac, Cdiscount, Darty, MediaMarkt, Saturn, OTTO, ALTERNATE and Samsung
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

### Tribesigns, Mooncool, Giftlab and King Koil through Awin

Tribesigns (US), Mooncool (US and Canada), Giftlab (US), and King Koil (US) are built-in Awin retailers. In
Awin, create a separate market/currency feed for each storefront. Google-format
feeds should include at least `id`, `title`, `description`,
`google_product_category`, `brand`, `price`, `sale_price`, `image_link`,
`aw_deep_link` and `availability`. Store the signed URLs only as:

- `AFFILIATE_FEED_TRIBESIGNS_US_URL`
- `AFFILIATE_FEED_MOONCOOL_US_URL`
- `AFFILIATE_FEED_MOONCOOL_CA_URL`
- `AFFILIATE_FEED_GIFTLAB_US_URL`
- `AFFILIATE_FEED_KING_KOIL_US_URL`

The importer accepts Awin comma-, tab- or pipe-delimited CSV and gzip responses.
It uses `sale_price` before `price` and `aw_deep_link` before the untracked
merchant URL. Large feeds are filtered against Delia's current shopping query
before the per-source limit is applied.
Giftlab's lingerie category and explicit adult-themed titles are excluded at
import time. Its built-in catalog limit is 3,000 products, which retains the
current safe US assortment; Delia balances matching results across retailers
after catalog search so the larger feed cannot occupy every recommendation.
King Koil imports only the `Mattresses` category. When Awin supplies several
variant rows with the same product title, the public catalog's product-family
deduplication prevents repeated cards while retaining the tracked variant URLs.

The ranking compares landed price, product evidence, seller reliability, demand signals, delivery and returns. A public score appears only after an offer clears the editorial gate; no-return listings, unknown delivery costs and disproportionate shipping charges are excluded from the Daily Drop. Previous products are archived and the best qualified offers are published.

## AI Shopping Assistant

The assistant uses the OpenAI Responses API with web search plus two server-side catalog tools: qualified regional product search and tracked price history. It keeps the API key on the server, does not persist conversations through the API, and never exposes unqualified catalog scores.

Set these values only in the hosting provider's encrypted app settings:

- `OPENAI_API_KEY`: production OpenAI API key;
- `OPENAI_SHOPPING_MODEL`: optional model override (defaults to `gpt-5.6-luna`).

Without `OPENAI_API_KEY`, the site remains usable and the assistant endpoint reports that the connection is pending.

## OneDailyDrop Live AI host

The Tavus `get_product_details` tool calls:

`POST https://www.onedailydrop.com/api/integrations/tavus/get-product-details`

Configure Tavus API delivery with bearer authentication. Store the same strong
random value as `TAVUS_TOOL_SECRET` in Azure App Settings and in the Tavus tool
authentication field; never reuse `ADMIN_KEY`. The request body may contain a
market (`us`, `ca`, `uk`, `fr` or `de`) and an optional published `drop_key`.
The response withholds the deal price, scarcity and buy URL until the server's
Live Drop state is actually live, and it omits facts the database cannot verify.

To embed Chloe on `/:market/live`, set the server-only `TAVUS_API_KEY` and the
Chloe `TAVUS_PAL_ID` in Azure App Settings. The browser calls the OneDailyDrop
backend, the backend creates a Tavus conversation, and only Tavus's short-lived
`conversation_url` is returned to the iframe. A conversation starts only after
the shopper presses **Talk to Chloe** and is ended when they leave the page.

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
