# Selected Awin merchants — prepared, not activated

The publisher selected these five programs. Joining the programs and activating
their signed feed URLs remain pending; these definitions do not reuse the Awin
key automatically and therefore cannot enable an unaccepted invitation.

| Retailer | Advertiser | Market | Feed setting | Observed feed |
| --- | --- | --- | --- | --- |
| Rowabi | 46127 | US / USD | `AFFILIATE_FEED_ROWABI_US_URL` | Legacy 102653; stale, raw import prohibited |
| Dima Eyewear | 128033 | US / USD | `AFFILIATE_FEED_DIMA_EYEWEAR_US_URL` | Google F4005 |
| PersonalHour | 96347 | US / USD | `AFFILIATE_FEED_PERSONALHOUR_US_URL` | Resolve after program acceptance |
| Brookwood Med | 124250 | US / USD | `AFFILIATE_FEED_BROOKWOOD_MED_US_URL` | Google F2671 |
| Lunzo DE | 69786 | DE / EUR | `AFFILIATE_FEED_LUNZO_DE_URL` | Select the German-language German-market feed |

Never commit signed URLs or feed credentials. Confirm the destination host,
currency, tracked link, availability, product variant and delivered cost before
activation. No additional ten-product cap is introduced. Existing importer
limits and the public catalog's deduplication and editorial gates still apply.
These safeguards do not independently prove product quality or buyer demand.

## Rowabi comparison, November 23, 2026 (New York)

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

Rowabi is `curatedOnly`: a configured feed URL alone cannot import the stale
rows. Populate individually checked storefront selections only after program
acceptance, with the exact size, shade-only/install-kit configuration and fresh
price/availability. Do not imply a shade-only price includes wiring.

Published returns terms observed: 45 days for eligible unused, uninstalled goods
in original packaging; buyer pays ordinary return shipping; final-sale and custom
orders are excluded. Rowabi prepaid return labels range from $29 to $169 per
pendant. Shipping is free above $200 in the contiguous US; below that the charge
depends on the package. Do not invent a flat shipping cost.

## Next activation checks

1. Accept each selected program only after action-time confirmation of terms.
2. Resolve PersonalHour and German Lunzo feed IDs; configure URLs in hosting.
3. Preview normalized records and compare selected exact variants to storefronts.
4. Keep out-of-stock, expired, service-only and unverified stale offers out.
5. Check PersonalHour model-specific freight timing and return eligibility.
6. Refresh and verify public store tiles and product cards in each market.
