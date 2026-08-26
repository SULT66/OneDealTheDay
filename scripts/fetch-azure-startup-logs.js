const https = require("https");

const profileXml = String(process.env.AZURE_WEBAPP_PUBLISH_PROFILE || "");
if (!profileXml) throw new Error("AZURE_WEBAPP_PUBLISH_PROFILE is unavailable");

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

const profiles = [...profileXml.matchAll(/<publishProfile\b([^>]*)>/g)].map((match) => {
  const attributes = {};
  for (const attribute of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[attribute[1]] = decodeXml(attribute[2]);
  }
  return attributes;
});

const profile = profiles.find((candidate) =>
  /scm\./i.test(candidate.publishUrl || "") &&
  /^(?:ZipDeploy|MSDeploy)$/i.test(candidate.publishMethod || ""),
);
if (!profile?.userName || !profile?.userPWD || !profile?.publishUrl) {
  throw new Error("No Kudu deployment profile was found");
}

const hostname = profile.publishUrl
  .replace(/^https?:\/\//i, "")
  .split("/")[0]
  .replace(/:443$/, "");
const authorization = `Basic ${Buffer.from(`${profile.userName}:${profile.userPWD}`).toString("base64")}`;

function redact(value) {
  return String(value)
    .replaceAll(profile.userName, "[deployment-user]")
    .replaceAll(profile.userPWD, "[deployment-password]")
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, "$1[redacted]");
}

function get(pathOrUrl) {
  const url = new URL(pathOrUrl, `https://${hostname}`);
  if (url.hostname !== hostname) throw new Error(`Refusing unexpected log host: ${url.hostname}`);

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { Authorization: authorization } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Kudu ${url.pathname} returned HTTP ${response.statusCode}: ${redact(body).slice(-2000)}`));
          return;
        }
        resolve(body);
      });
    });
    request.setTimeout(20000, () => request.destroy(new Error(`Kudu ${url.pathname} timed out`)));
    request.on("error", reject);
  });
}

async function main() {
  const indexBody = await get("/api/logs/docker");
  let entries;
  try {
    entries = JSON.parse(indexBody);
  } catch {
    console.log(redact(indexBody).slice(-30000));
    return;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.log("Kudu returned no container log files.");
    return;
  }

  const latest = entries
    .filter((entry) => entry?.href)
    .sort((left, right) => String(left.lastUpdated || "").localeCompare(String(right.lastUpdated || "")))
    .slice(-3);

  for (const entry of latest) {
    console.log(`--- ${entry.name || entry.href} ---`);
    const log = await get(entry.href);
    console.log(redact(log).slice(-30000));
  }
}

main().catch((error) => {
  console.error(redact(error.stack || error));
  process.exitCode = 1;
});
