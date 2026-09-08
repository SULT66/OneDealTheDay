/*
 * The HTML cache, tested where the last one failed.
 *
 * Its predecessor was correct-looking code that never ran: wrong paths, and a
 * capture hook (`res.send`) that Next never calls. Both would have passed a
 * test that called the middleware's internals directly. So this drives a real
 * express app over real HTTP with a handler that writes to the socket the way
 * Next does — res.write + res.end, never res.send — and asserts on what comes
 * back over the wire.
 */

const assert = require("assert");
const http = require("http");
const express = require("express");
const zlib = require("zlib");
const { htmlCache } = require("../src/htmlCache");

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    }).on("error", reject);
  });
}

async function withServer(build, run) {
  const app = express();
  build(app);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  try {
    await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  /* --- The core claim: a page is rendered once and served twice. --- */
  let renders = 0;
  let clock = 0;
  const cache = htmlCache({ now: () => clock });

  await withServer(
    app => {
      app.use((req, res, next) => { req.language = req.query.lang || "en"; next(); });
      app.use(cache);
      /* Writes to the socket exactly as Next does. If the cache hooked
         res.send it would capture nothing here — which is the bug this whole
         file exists to prevent coming back. */
      app.use((req, res) => {
        renders += 1;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.write("<html><body>");
        res.write(`render ${renders} of ${req.originalUrl}`);
        res.end("</body></html>");
      });
    },
    async port => {
      const first = await get(port, "/us/daily-drop");
      assert.strictEqual(first.status, 200);
      assert.strictEqual(first.headers["x-odd-cache"], "MISS");
      assert.strictEqual(renders, 1);

      const second = await get(port, "/us/daily-drop");
      assert.strictEqual(second.headers["x-odd-cache"], "HIT");
      assert.strictEqual(renders, 1, "the second request must not reach the renderer");
      assert.strictEqual(second.body.toString(), first.body.toString(), "byte-identical to what was served first");
      assert.match(second.headers["content-type"], /text\/html/);

      /* A market-prefixed path is the whole point: the old cache matched only
         bare URLs and so never fired on this site at all. */
      const bare = await get(port, "/about");
      assert.strictEqual(bare.headers["x-odd-cache"], "MISS");
      assert.strictEqual((await get(port, "/about")).headers["x-odd-cache"], "HIT");

      /* Different URL, different page. */
      await get(port, "/us/deal/228434");
      assert.strictEqual(renders, 3);

      /* Language changes the whole document, so it must not be served across. */
      const en = await get(port, "/us/about?lang=en");
      const fr = await get(port, "/us/about?lang=fr");
      assert.strictEqual(en.headers["x-odd-cache"], "MISS");
      assert.strictEqual(fr.headers["x-odd-cache"], "MISS", "another language is another page");

      /* Private pages are never cached, whatever the clock says. */
      for (const path of ["/us/account", "/us/saved", "/us/live", "/admin"]) {
        assert.strictEqual((await get(port, path)).headers["x-odd-cache"], undefined, `${path} must not be cached`);
        assert.strictEqual((await get(port, path)).headers["x-odd-cache"], undefined, `${path} must not be cached on repeat`);
      }

      /* Expiry: past the TTL the page is rendered again rather than served stale. */
      const before = renders;
      clock += 10 * 60 * 1000 + 1;
      assert.strictEqual((await get(port, "/us/daily-drop")).headers["x-odd-cache"], "MISS");
      assert.strictEqual(renders, before + 1);

      /* Search lives a shorter life than the rest, because it follows a query
         rather than the daily catalogue refresh. */
      await get(port, "/us/search?q=desk");
      assert.strictEqual((await get(port, "/us/search?q=desk")).headers["x-odd-cache"], "HIT");
      clock += 2 * 60 * 1000 + 1;
      assert.strictEqual((await get(port, "/us/search?q=desk")).headers["x-odd-cache"], "MISS", "search expires at two minutes");
      /* Rendered just after the ten-minute jump above, so it is two minutes
         old here — expired if it shared search's life, live on its own. */
      assert.strictEqual((await get(port, "/us/daily-drop")).headers["x-odd-cache"], "HIT", "…and other pages do not");

      /* clear() is what a catalogue refresh calls; a page quoting yesterday's
         price is worse than a slow one. */
      cache.clear();
      assert.strictEqual((await get(port, "/us/daily-drop")).headers["x-odd-cache"], "MISS");
    },
  );

  /* --- A POST is not a page. --- */
  await withServer(
    app => {
      app.use(htmlCache());
      app.use((req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<html>x</html>"); });
    },
    async port => {
      await new Promise((resolve, reject) => {
        const request = http.request({ port, path: "/us/about", method: "POST" }, res => {
          assert.strictEqual(res.headers["x-odd-cache"], undefined, "POST is never cached");
          res.resume();
          res.on("end", resolve);
        });
        request.on("error", reject);
        request.end();
      });
    },
  );

  /* --- Things that must never be handed to the next visitor. --- */
  await withServer(
    app => {
      app.use(htmlCache());
      app.get("/us/about", (req, res) => {
        /* A response carrying a cookie is carrying something about this one
           visitor, whatever the body looks like. */
        res.setHeader("Set-Cookie", "session=abc; Path=/");
        res.setHeader("Content-Type", "text/html");
        res.end("<html>personal</html>");
      });
      app.get("/us/contact", (req, res) => {
        res.status(500).setHeader("Content-Type", "text/html");
        res.end("<html>broken</html>");
      });
      app.get("/us/terms", (req, res) => {
        /* Not HTML: an RSC payload or a JSON error is not a page. */
        res.setHeader("Content-Type", "application/json");
        res.end('{"not":"html"}');
      });
    },
    async port => {
      for (const path of ["/us/about", "/us/contact", "/us/terms"]) {
        await get(port, path);
        assert.notStrictEqual((await get(port, path)).headers["x-odd-cache"], "HIT", `${path} must never be served from cache`);
      }
    },
  );

  /* --- Compressed bodies keep the header that describes them. ---
     Next compresses its own output, so what reaches the socket is usually
     gzip. Replaying those bytes without Content-Encoding hands the visitor
     binary labelled as text. */
  await withServer(
    app => {
      app.use(htmlCache());
      app.use((req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.setHeader("Content-Encoding", "gzip");
        res.end(zlib.gzipSync("<html><body>compressed</body></html>"));
      });
    },
    async port => {
      const first = await get(port, "/us/about", { "accept-encoding": "gzip" });
      const second = await get(port, "/us/about", { "accept-encoding": "gzip" });
      assert.strictEqual(second.headers["x-odd-cache"], "HIT");
      assert.strictEqual(second.headers["content-encoding"], "gzip", "the cached copy still says it is gzip");
      assert.strictEqual(zlib.gunzipSync(second.body).toString(), "<html><body>compressed</body></html>");
      assert.strictEqual(first.body.length, second.body.length);

      /* A client that cannot take gzip gets a fresh render instead of bytes it
         would render as garbage. */
      const plain = await get(port, "/us/about", { "accept-encoding": "identity" });
      assert.notStrictEqual(plain.headers["x-odd-cache"], "HIT");
    },
  );

  console.log("html cache: ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
