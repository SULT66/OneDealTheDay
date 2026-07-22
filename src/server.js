const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const db = require("./db");
const c = require("./config");
const { refreshProducts } = require("./refresh");

const app = express();
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(publicDir));

const trustPages = {
  "/about": "about.html",
  "/contact": "contact.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/affiliate-disclosure": "affiliate-disclosure.html",
  "/editorial-policy": "editorial-policy.html",
  "/how-we-select-deals": "how-we-select-deals.html",
  "/price-disclaimer": "price-disclaimer.html"
};

Object.entries(trustPages).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(pagesDir, file)));
});

const admin = (req, res, next) =>
  (req.headers["x-admin-key"] || req.query.key) === c.adminKey
    ? next()
    : res.status(401).json({ error: "Unauthorized" });

app.get("/api/products", (req, res) =>
  res.json(
    db.prepare(
      "SELECT * FROM products WHERE status='published' ORDER BY score DESC, updated_at DESC"
    ).all()
  )
);

app.get("/api/status", (req, res) =>
  res.json({
    provider: c.provider,
    products: db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n,
    clicks: db.prepare("SELECT COUNT(*) n FROM clicks").get().n,
    lastRun: db.prepare("SELECT * FROM refresh_runs ORDER BY id DESC LIMIT 1").get()
  })
);

app.post("/api/admin/refresh", admin, async (req, res) => {
  try {
    res.json(await refreshProducts(c));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/go/:id", (req, res) => {
  const product = db
    .prepare("SELECT * FROM products WHERE id=? AND status='published'")
    .get(req.params.id);

  if (!product) return res.sendStatus(404);

  db.prepare(
    "INSERT INTO clicks(product_id,clicked_at,referrer,user_agent) VALUES(?,?,?,?)"
  ).run(
    product.id,
    new Date().toISOString(),
    req.get("referer") || "",
    req.get("user-agent") || ""
  );

  res.redirect(302, product.affiliate_url);
});

app.get("/admin", (req, res) =>
  res.sendFile(path.join(publicDir, "admin.html"))
);

cron.schedule(
  c.refreshCron,
  () => refreshProducts(c).catch((error) => console.error(error.message)),
  { timezone: c.timezone }
);

(async () => {
  if (!db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n) {
    await refreshProducts(c).catch(console.error);
  }

  app.listen(c.port, () => console.log(`http://localhost:${c.port}`));
})();
