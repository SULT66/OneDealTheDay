// Execute the real polling effect with a changing API response and fake timers.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const source = fs.readFileSync('components/live/LiveDropPanel.tsx','utf8');
const effects = [];
const timers = [];
let current = {state:'upcoming', seconds_until_start:3600};
const noop = () => null;
const react = {
  useState: value => [value,noop], useRef:value => ({current:value}),
  useEffect:effect => effects.push(effect), useCallback:value => value,
};
const moduleObject = {exports:{}};
const context = {
  module:moduleObject,exports:moduleObject.exports,
  require:name => name === 'react' ? react : name === 'react/jsx-runtime' ? {jsx:noop,jsxs:noop} :
    name.includes('CopyProvider') ? {useCopy:() => value => value} :
    name.includes('LiveBroadcast') ? {useLiveBroadcast:() => ({session:null})} : {},
  fetch:async url => ({ok:true,json:async () => String(url).includes('/api/me') ? {user:null} : {drop:current}}),
  setTimeout:(callback,ms) => {timers.push({callback,ms});return timers.length;},clearTimeout:noop,
  setInterval:noop,clearInterval:noop,console,
};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
moduleObject.exports.LiveDropPanel({market:'us'});
(async () => {
  // Only the polling effect depends on the market and load callback.
  effects[1]();
  const settle = async () => {for(let i=0;i<10;i++) await Promise.resolve();};
  await settle();
  assert.strictEqual(timers.at(-1).ms,30000);
  current = {state:'waiting',seconds_until_start:120};
  await timers.at(-1).callback();
  assert.strictEqual(timers.at(-1).ms,5000,'waiting room must not retain the opening-page polling interval');
  current = {state:'live',seconds_until_start:0};
  await timers.at(-1).callback();
  assert.strictEqual(timers.at(-1).ms,5000);
  current = {state:'ended',seconds_until_start:0};
  await timers.at(-1).callback();
  assert.strictEqual(timers.at(-1).ms,60000);
  console.log('Live polling follows current API state: ok');
})().catch(error => {console.error(error);process.exitCode=1;});
