# OneDailyDrop implementation roadmap

## Completed
- Homepage collections, search, categories, responsive UI and dark mode
- Product detail pages and affiliate click redirects
- Amazon/Walmart comparison grouping
- Trust and disclosure pages
- SEO slugs, category pages, canonical metadata, Open Graph, Twitter cards
- Product, Offer, Breadcrumb and ItemList structured data
- Dynamic robots.txt and sitemap.xml
- Multi-retailer automation for all target stores and five markets
- Independent API/feed health monitoring and stale-offer handling
- Nightly unique Top 10, six-hour offer checks and distribution content queue
- Mooncool registered as an Awin retailer for market-specific US/Canada feeds
- Current-score ordering keeps the visible `Today's #1` honest during offer checks
- Additional daily cards continue the ranking from `#2` through `#10`
- Buyer-risk eligibility blocks non-sale titles and extreme delivery/no-return combinations
- Early homepage and status routes receive Helmet headers and hide Express

## Current sprint: partner readiness

### Mooncool launch
- Add the signed Awin Create-a-Feed URLs to Azure as
  `AFFILIATE_FEED_MOONCOOL_US_URL` and/or `AFFILIATE_FEED_MOONCOOL_CA_URL`
- Refresh each configured market and confirm Mooncool appears in `/api/status`
- Verify currency, stock, image quality and `aw_deep_link` tracking before publish
- Launch Mooncool inside a focused E-bikes & Trikes collection instead of mixing
  unreviewed products into the generic daily ranking

### Ranking and catalog blockers
- Reject malformed/mixed-language titles before publishing
- Prevent unbranded products from becoming the primary daily pick
- Continue calibrating penalties for weak seller evidence and low customer ratings
- Keep localization complete across navigation, score labels and generated briefs

### Partner-facing blockers
- Publish a `Partner With Us` page with publisher type, active markets,
  promotional methods, brand-safety rules and verified audience/performance data
- Replace incomplete product promises such as alerts being "prepared" before
  presenting those features as available
- Add clear business/legal contact information for advertiser review

## Next
1. Collect 30–60 days of eBay + Mooncool traffic, click and conversion evidence
2. Reapply selectively to relevant advertisers with category-specific URLs
3. Brand pages and brand extraction
4. Organization/WebSite/SearchAction schema
5. Admin analytics dashboard
