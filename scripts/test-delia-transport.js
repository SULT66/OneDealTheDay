const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");
const filename = path.join(__dirname, "../lib/delia.ts");
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText, filename);
const {askAssistant} = loaded.exports;
const enc = new TextEncoder();
const result = {message: "Finished", recommendations: [], partial_offers: []};

(async () => {
  let stream;
  const previews = [];
  let finished = false;
  global.fetch = async () => new Response(new ReadableStream({start(controller) {stream = controller;}}));
  const pending = askAssistant("question", {
    market: "us", productId: 1, onPreview: r => previews.push(r)
  }, () => {}).then(r => {finished = true; return r;});
  await new Promise(setImmediate);
  const preview = JSON.stringify({type: "preview", result: {...result, message: "Catalogue facts"}}) + "\n";
  stream.enqueue(enc.encode(preview.slice(0, 12)));
  stream.enqueue(enc.encode(preview.slice(12)));
  await new Promise(setImmediate);
  assert.equal(previews.length, 1);
  assert.equal(finished, false, "preview must precede the external comparison");
  stream.enqueue(enc.encode(JSON.stringify({type: "result", result}) + "\n"));
  stream.close();
  assert.equal((await pending).message, "Finished");

  let calls = 0;
  const controller = new AbortController();
  global.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(options.signal.reason), {once: true}));
  };
  const cancelled = askAssistant("question", {market: "us", signal: controller.signal}, () => {});
  controller.abort();
  await assert.rejects(cancelled);
  assert.equal(calls, 1, "cancellation must not repeat the request");

  for (const mode of ["error", "empty"]) {
    calls = 0;
    global.fetch = async () => {
      calls++;
      return mode === "error" ? new Response("Unavailable", {status: 503}) : new Response("", {status: 200});
    };
    await assert.rejects(askAssistant("question", {market: "us"}, () => {}));
    assert.equal(calls, 1, "failed or completed streams must not repeat the search");
  }
  calls = 0;
  global.fetch = async (_url, options) => {
    assert(options.signal);
    calls++;
    return calls === 1 ? new Response("", {status: 404}) : Response.json(result);
  };
  assert.equal((await askAssistant("question", {market: "us"}, () => {})).message, "Finished");
  assert.equal(calls, 2, "unsupported streaming retains the plain-endpoint fallback");
  console.log("Delia transport: split-chunk previews, cancellation, bounded signals, failures and no duplicate searches passed.");
})().catch(error => {console.error(error); process.exitCode = 1;});
