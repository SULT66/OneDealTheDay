const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");
const { prepareRuntime } = require("./runtime-bootstrap");

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "odd-runtime-test-"));
  let child;
  let output = "";
  try {
    // Exercise immutable extraction and restart reuse without any application
    // dependencies, including an archive containing a missing entry point.
    const fixture = path.join(temporary, "fixture");
    const payload = path.join(temporary, "payload");
    fs.mkdirSync(fixture); fs.mkdirSync(payload);
    fs.writeFileSync(path.join(payload, "app.js"), "module.exports = 'first release';");
    execFileSync("tar", ["-czf", path.join(fixture, "runtime.tar.gz"), "-C", payload, "."]);
    const first = prepareRuntime(fixture, temporary);
    assert.equal(prepareRuntime(fixture, temporary), first);
    fs.writeFileSync(path.join(payload, "app.js"), "module.exports = 'second release';");
    execFileSync("tar", ["-czf", path.join(fixture, "runtime.tar.gz"), "-C", payload, "."]);
    assert.notEqual(prepareRuntime(fixture, temporary), first);
    assert.match(fs.readFileSync(path.join(first, "app.js"), "utf8"), /first release/);
    fs.rmSync(path.join(payload, "app.js"));
    execFileSync("tar", ["-czf", path.join(fixture, "runtime.tar.gz"), "-C", payload, "."]);
    assert.throws(()=>prepareRuntime(fixture, temporary), /entry point is missing/);
    if (!process.argv[2]) return;
    const packaged = path.resolve(process.argv[2]);
    const extracted = prepareRuntime(packaged, temporary);
    const geoData = path.join(extracted, "node_modules/geoip-lite/data");
    for (const name of ["geoip-city.dat","geoip-city6.dat","geoip-city-names.dat"]) {
      assert(!fs.existsSync(path.join(geoData,name)), "unused city data still ships in production");
    }
    const countryProbe = JSON.parse(execFileSync(process.execPath,["-e",`
      const geo=require(${JSON.stringify(path.join(extracted,"node_modules/geoip-lite"))});
      console.log(JSON.stringify({country:geo.lookup('8.8.8.8').country,external:process.memoryUsage().external}));
    `],{encoding:"utf8"}));
    assert.equal(countryProbe.country,"US");
    assert(countryProbe.external<20*1024*1024,"country lookup still loads the full city dataset");
    const probe = net.createServer();
    await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));
    const port = probe.address().port;
    await new Promise(resolve=>probe.close(resolve));
    child = spawn(process.execPath, [path.join(packaged,"app.js")], {
      env:{...process.env,TMPDIR:temporary,NODE_ENV:"production",PORT:String(port),DATA_DIR:path.join(temporary,"data"),LIVE_REFRESH_ENABLED:"false",ONEDAILYDROP_DATABASE_URL:"",DATABASE_URL:"",WEBSITE_SITE_NAME:"odd-runtime-smoke",MEDIA_DIR:path.join(temporary,"media"),WARM_PATHS:"/us"},
      stdio:["ignore","pipe","pipe"],
    });
    child.stdout.on("data",chunk=>{output+=chunk;}); child.stderr.on("data",chunk=>{output+=chunk;});
    const deadline = Date.now()+45000;
    let status;
    while(Date.now()<deadline) {
      if(child.exitCode!==null) throw new Error(`Packaged server exited: ${output}`);
      try {const response=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(1000)}); if(response.ok){status=await response.json();break;}} catch {}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert(status,`Packaged server did not become healthy: ${output}`);
    const stamp=path.join(packaged,".release-sha");
    if(fs.existsSync(stamp)) assert.equal(status.releaseId,fs.readFileSync(stamp,"utf8").trim());
    const page=await fetch(`http://127.0.0.1:${port}/us`,{signal:AbortSignal.timeout(20000)});
    assert.equal(page.status,200,`Packaged Next homepage failed: ${output}`);
    assert.match(await page.text(),/OneDailyDrop/);
    console.log("Packaged production server: health, release stamp and Next homepage passed.");
  } finally {
    if(child&&child.exitCode===null){child.kill("SIGTERM");await new Promise(resolve=>child.once("exit",resolve));}
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
main().then(()=>console.log("Runtime archive: extraction, restart reuse, release isolation and invalid archive checks passed.")).catch(error=>{console.error(error);process.exitCode=1;});
