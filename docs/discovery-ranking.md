# Recommendations and public Scores

Recommendations now have their own order. A missing product rating is neutral;
we do not create ratings or confer verified merchant status from a shop name.
The public OneDailyDrop Score keeps its existing evidence gates.

Initial recommendation inputs: price context 30%, general browsing usefulness
25%, seller feedback 20%, delivery/returns 15%, Bayesian product feedback 10%.
Unknown signals use 0.5 rather than zero. Price context uses matching offers
or recorded 30/90-day prices, enriched once per cached market. Seller list
prices and affiliate commission do not contribute. Usefulness is an initial
heuristic (descriptive title, accessible price, lower prominence for printer
consumables and installation parts), not measured consumer demand.

The first 12 recommendations limit a retailer to four places when alternatives
qualify, a category to three and a recognized product type to one. A per-shop
repeat penalty gives other qualifying shops earlier exposure. The shelf does
not pad with stale, known low-rated, unavailable or preorder products. A short
shelf is permitted. All remaining catalog items remain reachable, with stable
pagination; explicit score, price and rating sorts are preserved.

The homepage requests a diverse candidate pool from the whole backend catalog
before applying its shelf filters, so the old first-300 score cutoff cannot
silently exclude direct merchants. General catalog browsing defaults to
Recommended. Text searches retain relevance priority (75%), with recommendation
quality at 20% and evidence coverage at 5%. Daily Drop eligibility is unchanged.

This is an initial rules release. It does not implement behavioral learning,
manual pin management or an A/B experiment. Assess recommendation-to-merchant
click rate, confirmed orders and revenue per visitor with equivalent placements
before tuning weights. Never label these picks as bestsellers without evidence.
