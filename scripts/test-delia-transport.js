const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");
const filename = path.join(__dirname, "../lib/delia.ts");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
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

  // A product comparison must outlive the server's complete search budget.
  const originalTimeout = AbortSignal.timeout;
  let requestedTimeout;
  AbortSignal.timeout = ms => { requestedTimeout = ms; return new AbortController().signal; };
  try {
    await askAssistant("question", {market:"us", productId:1});
    const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
    const serverDeadline = Number(/SHOPPING_ASSISTANT_HARD_TIMEOUT_MS = (\d+)/.exec(server)[1]);
    assert(requestedTimeout > serverDeadline, "Product questions must not be cut off before the server");
    assert(!server.includes("preview ? 25000"), "A catalogue preview must not shorten the external search");
  } finally { AbortSignal.timeout = originalTimeout; }

  for (const mode of ["disconnect", "empty", "error"]) {
    calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response(new ReadableStream({start(controller) {
        controller.enqueue(enc.encode(JSON.stringify({type:"preview",result:{...result,partial:true,recommendations:[{title:"Known product"}]}}) + "\n"));
        setImmediate(() => {
          if (mode === "disconnect") controller.error(new TypeError("Network interrupted"));
          else {
            if (mode === "error") controller.enqueue(enc.encode(JSON.stringify({type:"error",error:"Comparison failed"}) + "\n"));
            controller.close();
          }
        });
      }}));
    };
    const recovered = await askAssistant("question", {market:"us", language:"es"}, () => {});
    assert.equal(recovered.recommendations[0].title, "Known product", mode);
    assert.equal(recovered.partial, true, mode);
    assert.match(recovered.message, /comparación/, "Recovery must use the interface language");
    assert.equal(calls, 1, "Recovery must not repeat a potentially billed search");
  }

  const cancelAfterPreview = new AbortController();
  global.fetch = async () => new Response(new ReadableStream({start(controller) {
    controller.enqueue(enc.encode(JSON.stringify({type:"preview",result:{...result,recommendations:[{title:"Known"}]}}) + "\n"));
    setImmediate(() => { cancelAfterPreview.abort(); controller.error(cancelAfterPreview.signal.reason); });
  }}));
  await assert.rejects(askAssistant("question", {market:"us",signal:cancelAfterPreview.signal}, () => {}),
    {name:"AbortError"}, "Explicit cancellation must not turn into a completed answer");
  console.log("Delia transport: split-chunk previews, cancellation, bounded signals, failures and no duplicate searches passed.");
})().catch(error => {console.error(error); process.exitCode = 1;});
