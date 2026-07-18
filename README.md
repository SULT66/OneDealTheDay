# OneDealTheDay Auto

Finished MVP that automatically finds, scores and publishes exactly 10 products.

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

The first start loads demo products.

## Turn on live product discovery
Edit `.env`:
```env
PRODUCT_PROVIDER=rainforest
RAINFOREST_API_KEY=YOUR_KEY
AFFILIATE_TAG=YOUR_AMAZON_TAG
ADMIN_KEY=YOUR_PRIVATE_PASSWORD
```
Restart with `npm start`. Daily refresh is 6:15 AM New York time. Manual refresh is available in `/admin`.

The ranking uses search position, rating, review volume, discount and popularity badges. Previous products are archived and the best ten are published.

Before public launch, use HTTPS, protect `.env`, add Privacy/Terms/Contact pages, and comply with Amazon Associates and product-data provider rules. Do not scrape Amazon directly.
