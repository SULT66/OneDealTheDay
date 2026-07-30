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

- `amazon-manual` for original editorial pages with SiteStripe links;
- `amazon-creators-api` or `amazon-pa-api` after official Amazon API access;
- `bestbuy-products-api` after official Best Buy API access.

Legacy scraping providers and demo catalogs are not enabled.

The ranking uses search position, rating, review volume, discount and popularity badges. Previous products are archived and the best ten are published.

Before public launch, use HTTPS, protect `.env`, add Privacy/Terms/Contact pages, and comply with Amazon Associates and product-data provider rules. Do not scrape Amazon directly.
