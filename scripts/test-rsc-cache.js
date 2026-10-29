const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const { rscCache } = require('../src/rscCache');
const { htmlCache } = require('../src/htmlCache');
const get = (port, path, headers = {}) => new Promise((resolve, reject) => {
  http.get({ port, path, headers }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks), status: response.statusCode }));
  }).on('error', reject);
});
(async () => {
  let clock = 0, renders = 0;
  let fault = '', cookie = false, large = false;
  const cache = rscCache({ now: () => clock });
  const html = htmlCache({ onClear: cache.clear });
  const app = express();
  app.use((req, res, next) => { req.language = req.headers['x-test-language'] || 'en'; next(); });
  app.use(cache); app.use(html);
  app.use((req, res) => {
    renders++;
    if (cookie) res.setHeader('Set-Cookie', 'private=value; HttpOnly');
    res.setHeader('Cache-Control', 'private, no-store');
    const flight = req.headers.rsc === '1';
    res.setHeader('Content-Type', flight ? 'text/x-component' : 'text/html');
    const text = fault || (flight ? `0:{"render":${renders},"language":"${req.language}"}\n` : `<html>${renders}</html>`);
    const body = Buffer.from(text + (large ? 'x'.repeat(600_000) : ''));
    if (req.headers['accept-encoding'] === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(body));
    } else { res.write(body.subarray(0, 5)); res.end(body.subarray(5)); }
  });
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const headers = { RSC: '1', 'Next-Router-State-Tree': 'home-tree', 'Next-Url': '/us' };
  try {
    const path = '/us/category/electronics?_rsc=one';
    const first = await get(port, path, headers);
    const second = await get(port, path, headers);
    assert.equal(renders, 1, 'Repeat anonymous navigation must reuse the render');
    assert.equal(second.headers['x-odd-rsc-cache'], 'HIT');
    assert.deepEqual(second.body, first.body);
    assert.match(second.headers['content-type'], /text\/x-component/);
    assert.match(second.headers['cache-control'], /private, no-store/);

    for (const changed of [
      { 'Next-Router-State-Tree': 'product-tree' }, { 'Next-Url': '/us/search?q=desk' },
      { 'x-test-language': 'es' }, { 'Accept-Encoding': 'gzip' },
    ]) {
      const count = renders;
      await get(port, path, { ...headers, ...changed });
      assert.equal(renders, count + 1, 'Router context, language and encoding must be isolated');
    }
    const gzipped = await get(port, path, { ...headers, 'Accept-Encoding': 'gzip' });
    assert.equal(gzipped.headers['x-odd-rsc-cache'], 'HIT');
    assert.match(zlib.gunzipSync(gzipped.body).toString(), /"render"/);
    const document = await get(port, '/us/category/electronics');
    assert.match(document.headers['content-type'], /text\/html/);
    assert.equal(document.headers['x-odd-rsc-cache'], undefined);

    for (const extra of [{ Cookie: 'odd_session=account-token' }, { Authorization: 'Bearer test' },
      { 'Next-Router-Prefetch': '1' }, { 'Next-Router-Segment-Prefetch': '/_tree' },
      { 'Next-Hmr-Refresh': '1' }, { 'Next-Action': 'action' }]) {
      const count = renders;
      await get(port, path, { ...headers, ...extra });
      await get(port, path, { ...headers, ...extra });
      assert.equal(renders, count + 2, 'Private/action/prefetch requests must bypass the cache');
    }
    for (const privatePath of ['/us/account', '/us/saved', '/us/live', '/us/daily-drop', '/admin']) {
      const count = renders;
      await get(port, privatePath, headers); await get(port, privatePath, headers);
      assert.equal(renders, count + 2, privatePath + ' must stay live/private');
    }
    html.clear();
    const count = renders;
    await get(port, path, headers);
    assert.equal(renders, count + 1, 'Catalog invalidation must clear Flight and HTML together');
    clock = 60_001;
    await get(port, path, headers);
    assert.equal(renders, count + 2, 'Flight entries must expire after one minute');

    for (const mode of ['cookie', 'error', 'transient', 'large']) {
      cache.clear(); cookie = mode === 'cookie'; large = mode === 'large';
      fault = mode === 'error' ? '0:E{"digest":"render-error"}\n'
        : mode === 'transient' ? '0:{"data-odd-transient":"1"}\n' : '';
      const before = renders;
      await get(port, path, headers); await get(port, path, headers);
      assert.equal(renders, before + 2, 'Do not cache ' + mode + ' responses');
    }
    console.log('Flight cache: byte-preserving reuse, router/language/encoding isolation, privacy, expiry and shared invalidation passed.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
