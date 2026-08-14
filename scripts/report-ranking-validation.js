const fs = require("fs");
const path = require("path");
const db = require("../src/db");
const { sourceSql } = require("../src/publicCatalog");
const { rankingValidationReport } = require("../src/rankingValidation");

const outputIndex = process.argv.indexOf("--out");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
const products = db.prepare(`
  SELECT * FROM products
  WHERE status='published' AND ${sourceSql()}
  ORDER BY market,COALESCE(ranking_score,score) DESC,updated_at DESC
`).all();
const serialized = `${JSON.stringify(rankingValidationReport(products), null, 2)}\n`;
if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), {recursive:true});
  fs.writeFileSync(path.resolve(output), serialized);
}
process.stdout.write(serialized);
