// Next's client-side navigations request Flight rather than HTML. Keep a short
// in-process copy for anonymous public pages, isolated by the exact router
// request. Never publish these payloads to a browser/shared HTTP cache.
const { createHash } = require('node:crypto');
const { CACHEABLE_PATH } = require('./htmlCache');
const TTL_MS = 60_000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_ENTRIES = 64;
const ROUTER_HEADERS = ['next-router-state-tree', 'next-url', 'accept-encoding'];
const RESPONSE_HEADERS = ['content-type', 'content-encoding', 'vary', 'content-language',
  'x-nextjs-stale-time', 'x-nextjs-rewritten-path', 'x-nextjs-rewritten-query'];

function rscCache({ now = Date.now } = {}) {
  const entries = new Map();
  const middleware = (req, res, next) => {
    if (req.method !== 'GET' || req.headers.rsc !== '1' || !CACHEABLE_PATH.test(req.path) ||
        /\/daily-drop\/?$/.test(req.path) || /(?:^|;\s*)odd_session=/.test(req.headers.cookie || '') ||
        req.headers.authorization || res.getHeader('set-cookie') || req.headers['next-action'] || req.headers['next-router-prefetch'] ||
        req.headers['next-router-segment-prefetch'] || req.headers['next-hmr-refresh']) return next();
    const fingerprint = JSON.stringify([req.language || 'en', req.originalUrl,
      ...ROUTER_HEADERS.map(name => req.headers[name] || '')]);
    const key = createHash('sha256').update(fingerprint).digest('hex');
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) {
      entries.delete(key); entries.set(key, hit);
      for (const [name, value] of Object.entries(hit.headers)) res.setHeader(name, value);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-ODD-RSC-Cache', 'HIT');
      return res.status(200).end(hit.body);
    }
    if (hit) entries.delete(key);

    const chunks = [];
    let bytes = 0;
    let collecting = true;
    const collect = (chunk, encoding) => {
      if (!collecting || chunk == null || typeof chunk === 'function') return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
      bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) { collecting = false; chunks.length = 0; return; }
      chunks.push(buffer);
    };
    const write = res.write.bind(res);
    const end = res.end.bind(res);
    res.write = (chunk, encoding, callback) => {
      collect(chunk, encoding);
      return write(chunk, encoding, callback);
    };
    res.end = (chunk, encoding, callback) => {
      collect(chunk, encoding);
      res.write = write; res.end = end;
      if (collecting && res.statusCode === 200 && !res.getHeader('set-cookie') &&
          !res.getHeader('x-nextjs-postponed') &&
          /^text\/x-component(?:;|$)/i.test(String(res.getHeader('content-type') || ''))) {
        const body = Buffer.concat(chunks);
        // Decode only for validation. Replay the original bytes and encoding.
        try {
          const zlib = require('node:zlib');
          const encoding = res.getHeader('content-encoding');
          const decoded = encoding === 'gzip' ? zlib.gunzipSync(body)
            : encoding === 'br' ? zlib.brotliDecompressSync(body)
            : encoding === 'deflate' ? zlib.inflateSync(body) : body;
          const text = decoded.toString('utf8');
          // Flight reports rendering failures as error records, sometimes
          // after a successful HTTP status has already left the socket.
          if (body.length && !/(?:^|\n)[0-9a-f]+:E\{/.test(text) &&
              !/"data-odd-transient"\s*:\s*"1"/.test(text)) {
            const headers = {};
            for (const name of RESPONSE_HEADERS) {
              const value = res.getHeader(name);
              if (value) headers[name] = value;
            }
            if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
            entries.set(key, { body, headers, expiresAt: now() + TTL_MS });
          }
        } catch { /* An incomplete/unknown encoding is served, never cached. */ }
      }
      return end(chunk, encoding, callback);
    };
    return next();
  };
  middleware.clear = () => entries.clear();
  return middleware;
}
module.exports = { rscCache };
