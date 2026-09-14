/*
 * Drop photos and videos uploaded as files (src/dropMedia.js).
 *
 * Run through a real HTTP server, because the whole job is reading a request
 * body off the wire: size limits, a file that lies about its type, an upload
 * cut off halfway.
 */
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { isUploadedMedia, isVideoFile, saveUpload, sniff } = require("../src/dropMedia");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-media-"));

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(4000, 3)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(100, 3)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(100, 3)]);
const html = Buffer.from("<html><script>alert(1)</script></html>");

assert.deepStrictEqual(sniff(jpeg), { kind: "image", ext: "jpg" });
assert.deepStrictEqual(sniff(png), { kind: "image", ext: "png" });
assert.deepStrictEqual(sniff(mp4), { kind: "video", ext: "mp4" });
assert.deepStrictEqual(sniff(mov), { kind: "video", ext: "mov" });
assert.deepStrictEqual(sniff(webm), { kind: "video", ext: "webm" });
assert.strictEqual(sniff(html), null);

assert.ok(isUploadedMedia("/media/uploads/0123456789abcdef01234567.mp4"));
assert.ok(!isUploadedMedia("/media/uploads/../../site.db"));
assert.ok(!isUploadedMedia("/media/uploads/evil.html"));
assert.ok(isVideoFile("/media/uploads/0123456789abcdef01234567.mov"));
assert.ok(!isVideoFile("https://player.example.com/embed/123"));

const server = http.createServer(async (req, res) => {
  const kind = new URL(req.url, "http://x").searchParams.get("kind");
  try {
    const saved = await saveUpload(req, { kind, directory });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(saved));
  } catch (error) {
    res.writeHead(error.status || 500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (kind, body, headers = {}) =>
    fetch(`${base}/?kind=${kind}`, { method: "POST", body, headers }).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));

  /* A real photo and a real video land, named by id, never by the uploader. */
  const photo = await send("image", jpeg, { "content-type": "image/jpeg" });
  assert.strictEqual(photo.status, 200, JSON.stringify(photo.body));
  assert.ok(isUploadedMedia(photo.body.url), photo.body.url);
  assert.ok(photo.body.url.endsWith(".jpg"));
  assert.deepStrictEqual(fs.readFileSync(path.join(directory, path.basename(photo.body.url))), jpeg, "the file was altered on the way in");

  const video = await send("video", mp4, { "content-type": "video/mp4" });
  assert.strictEqual(video.status, 200);
  assert.ok(video.body.url.endsWith(".mp4"));

  /* A file that lies about what it is. */
  const disguised = await send("image", html, { "content-type": "image/jpeg" });
  assert.strictEqual(disguised.status, 415, "an HTML page was accepted as a photo");
  /* A video in the photo slot, and the other way round. */
  assert.strictEqual((await send("image", mp4)).status, 415);
  assert.strictEqual((await send("video", jpeg)).status, 415);
  /* Nothing, and a slot that does not exist. */
  assert.strictEqual((await send("image", Buffer.alloc(0))).status, 400);
  assert.strictEqual((await send("script", jpeg)).status, 400);

  /* Too big, refused from the declared size before a byte is written. */
  const huge = await new Promise((resolve) => {
    const request = http.request(`${base}/?kind=image`, {
      method: "POST",
      headers: { "content-length": String(16 * 1024 * 1024) },
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", () => resolve(413));
    request.end();
  });
  assert.strictEqual(huge, 413);

  /* No half-written files are left behind by any of the refusals. */
  const leftovers = fs.readdirSync(directory).filter((name) => name.endsWith(".part"));
  assert.deepStrictEqual(leftovers, [], "a refused upload left a partial file");
  assert.strictEqual(fs.readdirSync(directory).length, 2, "a refused file was kept");

  server.close();
  console.log("Drop media uploads passed.");
})().catch((error) => {
  server.close();
  console.error(error);
  process.exit(1);
});
