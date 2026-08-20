const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const config = read("src/config.js");
const appEntry = read("app.js");
const envExample = read(".env.example");
const server = read("src/server.js");
const i18n = read("src/i18n.js");
const cookieScript = read("public/cookie-consent.js");
const rootLayout = read("app/layout.tsx");
const ignore = read(".gitignore");

assert(!config.includes("change-this-private-key"), "Fallback admin password is still present in config");
assert(!envExample.includes("change-this-private-key"), "Fallback admin password is still present in .env.example");
assert(config.includes('String(process.env.ADMIN_KEY || "").trim()'), "ADMIN_KEY is not read safely");
assert(server.includes("crypto.timingSafeEqual"), "Admin key comparison is not timing-safe");
assert(!server.includes("req.query.key"), "Admin secret can still be supplied in a URL");
assert(server.includes("Admin access is not configured."), "Missing ADMIN_KEY does not disable admin access");
assert(appEntry.includes('app.disable("x-powered-by")'), "Early homepage/status routes still expose Express");
assert(appEntry.includes("app.use(helmet({ contentSecurityPolicy:false }))"), "Early homepage/status routes bypass security headers");
assert(appEntry.includes('res.set("X-Robots-Tag", "noindex, nofollow")'), "Early status route is crawlable");
assert(ignore.split(/\r?\n/).includes("data/"), "Runtime database directory is not ignored");
assert(server.includes('cookie-consent.css?v=20260730'), "Legal pages do not load consent styles");
assert(server.includes('cookie-consent.js?v=20260730'), "Legal pages do not load the consent controller");
assert(rootLayout.includes('cookie-consent.css?v=20260730'), "The Next.js frontend does not load consent styles");
assert(rootLayout.includes('cookie-consent.js?v=20260730'), "The Next.js frontend does not load the consent controller");
assert(cookieScript.includes('new Set(["fr", "de"])'), "European consent markets are not configured");
assert(cookieScript.includes('saved === "accepted"'), "Analytics is not gated behind affirmative consent");
assert(cookieScript.includes('saved !== "declined"'), "Declined consent is not respected");
assert(cookieScript.includes("data-cookie-settings"), "Visitors cannot reopen cookie settings");
assert(!i18n.includes("Unsubscribe anytime"), "The site still promises unsubscribe before email delivery exists");

console.log("Security readiness validation passed.");
