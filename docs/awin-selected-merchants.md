# Selected Awin merchants — prepared, not activated

All four memberships were confirmed Joined in Awin on November 24, 2026.
Dima, PersonalHour and Brookwood have current Google feeds available to this
publisher and reuse its existing server-side product-data credential. Lunzo DE
is Joined but absent from both Create-a-Feed and the publisher feed-list download;
its German feed remains unconfigured until access is available. Rowabi is excluded.

| Retailer | Advertiser | Market | Feed setting | Observed feed |
| --- | --- | --- | --- | --- |
| Dima Eyewear | 128033 | US / USD | `AFFILIATE_FEED_DIMA_EYEWEAR_US_URL` | Google F4005 |
| PersonalHour | 96347 | US / USD | `AFFILIATE_FEED_PERSONALHOUR_US_URL` | Google F3280 |
| Brookwood Med | 124250 | US / USD | `AFFILIATE_FEED_BROOKWOOD_MED_US_URL` | Google F2671 |
| Lunzo DE | 69786 | DE / EUR | `AFFILIATE_FEED_LUNZO_DE_URL` | Select the German-language German-market feed |

Never commit signed URLs or feed credentials. Confirm the destination host,
currency, tracked link, availability, product variant and delivered cost before
activation. The three US feeds were downloaded (254 Dima, 412 PersonalHour, 520 Brookwood rows).
Three exact variants from each store were compared against the storefront product
API; all nine prices and availability values matched. This is a spot check, not
verification of every item. PersonalHour made-to-order, preorder and service-only
rows are excluded. No additional ten-product cap is introduced. Existing importer
limits and the public catalog's deduplication and editorial gates still apply.
These safeguards do not independently prove product quality or buyer demand.

## Excluded: Rowabi

The publisher explicitly excluded Rowabi. It has no retailer/feed definition and
will not be connected or imported. The observations below explain the decision.

### Comparison, November 23, 2026 (New York)

Downloaded legacy feed 102653 contained 151 variant rows across 42 product URLs.
The Awin profile reports its last update as May 15, 2026. These spot checks are
not a verification of all 151 rows:

| Feed listing | Feed | Live page observation |
| --- | --- | --- |
| Calista, MLC1003B | $440; in_stock=1 | Same URL now titled Liora Black Three Light Pendant; $390; Sold out |
| Abandon Lace, RLC1058-14 | $165; in_stock=1 | Same URL now titled Ellie Rattan Pendant Light; 14-inch Lampshade Only $115.50 |
| Aurelia, RLC1037-18 | $209 | Live default 18-inch Lampshade Only $210 |

Source URLs:
- https://www.rowabi.com/products/calista-pendant-light
- https://www.rowabi.com/products/abandon-lace-rattan-light-pendant-80086
- https://www.rowabi.com/products/aurelia-rattan-pendant-light-bundle
- https://www.rowabi.com/pages/returns-exchanges
- https://www.rowabi.com/pages/shipping-delivery

Published returns terms observed: 45 days for eligible unused, uninstalled goods
in original packaging; buyer pays ordinary return shipping; final-sale and custom
orders are excluded. Rowabi prepaid return labels range from $29 to $169 per
pendant. Shipping is free above $200 in the contiguous US; below that the charge
depends on the package. Do not invent a flat shipping cost.

## Next activation checks

1. Membership acceptance is complete for all four selected programs.
2. Resolve access to the German Lunzo feed before activating it.
3. Preview normalized records and compare selected exact variants to storefronts.
4. Keep out-of-stock, expired, service-only and unverified stale offers out.
5. Check PersonalHour model-specific freight timing and return eligibility.
6. Refresh and verify public store tiles and product cards in each market.
