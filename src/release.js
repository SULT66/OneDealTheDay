const fs = require("fs");
const path = require("path");

/**
 * Identifies the running release.
 *
 * This used to be a hand-edited constant, which made the production check that
 * compares it worthless: the value had not changed in days, so it matched
 * whatever was deployed and could never catch a package that failed to swap —
 * the exact failure the deploy workflow warns about. The deploy now writes the
 * commit it is shipping into `.release-sha`, and the constant below is only the
 * fallback for a local run or a checkout deployed by hand.
 */
const FALLBACK_RELEASE_ID = "2026-08-15-public-taxonomy-v2";

function readDeployedSha() {
  try {
    const value = fs.readFileSync(path.join(__dirname, "..", ".release-sha"), "utf8").trim();
    return /^[0-9a-f]{7,40}$/i.test(value) ? value : "";
  } catch {
    return "";
  }
}

const RELEASE_ID = readDeployedSha() || FALLBACK_RELEASE_ID;

module.exports = { RELEASE_ID, FALLBACK_RELEASE_ID };
