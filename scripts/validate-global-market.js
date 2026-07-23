const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'public/global-market.js',
  'public/global-market.css',
  'src/homepage-seo.js'
];

for (const relative of requiredFiles) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${relative}`);
  if (!fs.statSync(full).size) throw new Error(`Empty required file: ${relative}`);
}

const clientJs = fs.readFileSync(path.join(root, 'public/global-market.js'), 'utf8');
new vm.Script(clientJs, { filename: 'public/global-market.js' });

const homepageSeo = fs.readFileSync(path.join(root, 'src/homepage-seo.js'), 'utf8');
new vm.Script(homepageSeo, { filename: 'src/homepage-seo.js' });

const requiredMarkers = [
  'id="marketButton"',
  'id="marketOptions"',
  '/global-market.css',
  '/global-market.js',
  'onedailydrop:marketchange'
];

for (const marker of requiredMarkers) {
  const found = homepageSeo.includes(marker) || clientJs.includes(marker);
  if (!found) throw new Error(`Global market integration marker missing: ${marker}`);
}

const countryCodes = [...clientJs.matchAll(/code:\s*"([A-Z]{2})"/g)].map(match => match[1]);
if (countryCodes.length < 20) throw new Error(`Expected at least 20 markets, found ${countryCodes.length}`);
if (new Set(countryCodes).size !== countryCodes.length) throw new Error('Duplicate market country codes found');

console.log(`Global market validation passed for ${countryCodes.length} markets.`);