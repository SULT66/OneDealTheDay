// Count tracked application source, tests and styling without node_modules,
// lockfiles, binaries, data, generated output or third-party bundles.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const paths = execFileSync("git", ["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
const isCode = path => /\.(?:js|jsx|mjs|ts|tsx|css|html)$/.test(path) &&
  !/\.min\.(?:js|css)$/.test(path);
const sections = { backend:0, frontend:0, tests_and_scripts:0, styles_and_html:0, other:0 };
let files = 0;
for (const path of paths.filter(isCode)) {
  if (!fs.existsSync(path)) continue;
  const content = fs.readFileSync(path, "utf8");
  const lines = content ? (content.match(/\n/g) || []).length + Number(!content.endsWith("\n")) : 0;
  const section = path.startsWith("scripts/") ? "tests_and_scripts"
    : /\.(?:css|html)$/.test(path) ? "styles_and_html"
    : path.startsWith("app/") || path.startsWith("components/") || path.startsWith("lib/") ? "frontend"
    : path.startsWith("src/") || path === "app.js" ? "backend" : "other";
  sections[section] += lines;
  files++;
}
const total = Object.values(sections).reduce((sum, n) => sum+n, 0);
console.log(JSON.stringify({files, total, sections}, null, 2));
