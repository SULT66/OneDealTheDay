/*
 * That a named /go route can actually be reached.
 *
 * /go/web shipped correct and dead. The redirect worked, the signing was
 * tested from every angle, and nothing ever reached it: app.js is mounted
 * before src/server.js and registers its own `/go/:id` guard, which answered
 * /go/web by looking up a product called "web", finding none, and returning
 * 404. Every test passed, because every test called the module rather than the
 * URL.
 *
 * So this drives real express over real HTTP, in the order the two files are
 * actually mounted, and asks for the path a visitor would ask for.
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: urlPath }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location }));
    }).on("error", reject);
  });
}

async function withServer(build, run) {
  const app = express();
  build(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/*
 * The two layers, in the order app.js and src/server.js are mounted. The guard
 * is the shape app.js uses: it exists to hide unpublished products, and it
 * knows a product by its numeric id.
 */
const mountBothLayers = (app) => {
  app.get("/go/:id", (req, res, next) => {
    if (!/^[0-9]+$/.test(String(req.params.id || ""))) return next();
    /* Stands in for the published-product lookup. */
    return req.params.id === "404404" ? res.sendStatus(404) : next();
  });
  app.get("/go/web", (req, res) => res.redirect(302, "https://example.com/found"));
  app.get("/go/:id", (req, res) => res.redirect(302, `https://example.com/product/${req.params.id}`));
};

(async () => {
  await withServer(mountBothLayers, async (port) => {
    /* The bug, as a request. */
    const web = await get(port, "/go/web");
    assert.strictEqual(web.status, 302, "/go/web is being swallowed before its own route runs");
    assert.strictEqual(web.location, "https://example.com/found");

    /* And the guard still does its job for the ids it is there for. */
    const product = await get(port, "/go/218985");
    assert.strictEqual(product.status, 302);
    assert.strictEqual(product.location, "https://example.com/product/218985");

    const hidden = await get(port, "/go/404404");
    assert.strictEqual(hidden.status, 404, "the guard stopped hiding unpublished products");
  });

  /*
   * The model above is only worth something if the real guard has the same
   * shape, so the source is checked for it too. A behavioural test of a
   * reconstruction plus a structural test of the original is the closest this
   * gets to the real thing without booting a server that wants a database, an
   * eBay client and five API keys.
   */
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const guard = appSource.slice(appSource.indexOf(`app.get("/go/:id"`));
  assert.ok(
    /^[\s\S]{0,900}?\/\^\[0-9\]\+\$\/\.test\(String\(req\.params\.id/.test(guard),
    "app.js's /go/:id guard no longer lets named routes through",
  );

  console.log("Go route order passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
