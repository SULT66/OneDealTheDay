const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {needsRecalculation} = require('../src/catalogRecalculation');
const {SCORE_MODEL} = require('../src/ranker');
const {TAXONOMY_VERSION} = require('../src/catalogTaxonomy');
const db = new Database(':memory:');
db.exec(`CREATE TABLE products(status TEXT,score_breakdown TEXT,evidence_confidence REAL,commerce_quality REAL,
  average_30_day_price REAL,ranking_score REAL,landed_cost REAL,current_price REAL,shipping_cost REAL,
  normalized_category TEXT,taxonomy_version TEXT,product_key TEXT)`);
db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('published',JSON.stringify({model:SCORE_MODEL}),
  70,0.5,0,60,null,20,null,'Electronics',TAXONOMY_VERSION,'');
assert.equal(needsRecalculation(db),false,'Unknown delivery cost is valid missing evidence, not a reason to rescore the entire database on every restart');
db.exec('UPDATE products SET shipping_cost=0');
assert.equal(needsRecalculation(db),true,'Known shipping with a missing landed cost still needs repair');
db.exec('UPDATE products SET landed_cost=20');
assert.equal(needsRecalculation(db),false);
db.exec('UPDATE products SET average_30_day_price=NULL');
assert.equal(needsRecalculation(db),false,'A current scored import with no stored price average must not trigger a full historical catalogue rebuild');
db.exec("UPDATE products SET score_breakdown='{}'");
assert.equal(needsRecalculation(db),true,'Old score models must still migrate');
db.close();
console.log('Startup recalculation: valid missing delivery/history metadata no longer causes perpetual catalogue rebuilds');
