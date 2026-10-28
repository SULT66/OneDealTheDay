// Exercise the real console with delayed PAL arrival and the current Tavus
// speaking events. No provider calls or paid conversations are created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
}).outputText;
const protocol = {exports: {}};
vm.runInNewContext(compile('lib/liveHostProtocol.ts'), {module: protocol, exports: protocol.exports});
const {presenterSpeakingEvent, hostTurnFinished} = protocol.exports;
assert.equal(presenterSpeakingEvent({event_type:'conversation.started_speaking', properties:{role:'user'}}), null);
assert.equal(presenterSpeakingEvent({event_type:'conversation.started_speaking', properties:{role:'pal'}}), 'started');
assert.equal(presenterSpeakingEvent({event_type:'conversation.stopped_speaking', properties:{role:'replica'}}), 'stopped');
assert.equal(hostTurnFinished({now:60000,sentAt:1000,stoppedAt:0,speaking:true,sawEvents:true}), false);
assert.equal(hostTurnFinished({now:60000,sentAt:1000,stoppedAt:500,speaking:false,sawEvents:true}), true);

let now = 100000, cursor = 0, pendingEffects = [], view;
const slots = [], effects = [], timers = new Map(), handlers = {}, sent = [];
let timerId = 0, presenter = false;
const host = {state:'waiting', conversation_url:'https://tavus.daily.co/test', conversation_id:'c123test',
  intro_script:'First paragraph.\n\nSecond paragraph.', reveal_script:'The price is now open.',
  reveal_cue:'Reveal', idle_cue:'Idle', queued:0, messages:[]};
const react = {
  useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i], value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useRef(initial) {const i=cursor++; return slots[i] ||= {current:initial};},
  useCallback(fn) {cursor++; return fn;},
  useEffect(fn,deps) {const i=cursor++; const old=effects[i]; if(!old || deps.some((x,n)=>x!==old.deps[n])) pendingEffects.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
};
// Stable callbacks matter for the component's polling/scheduling effects.
react.useCallback = (fn,deps)=>{const i=cursor++;const old=slots[i];if(!old || deps.some((x,n)=>x!==old.deps[n]))slots[i]={fn,deps};return slots[i].fn;};
const call = {participants:()=>presenter?{pal:{local:false,tracks:{video:{persistentTrack:{id:'v'}},audio:{persistentTrack:{id:'a'}}}}}:{},
  on:(event,fn)=>{handlers[event]=fn;}, join:async()=>{}, leave:async()=>{}, destroy:()=>{},
  sendAppMessage:payload=>sent.push(payload)};
const mod={exports:{}};
const jsx=(type,props)=>({type,props});
const find=(node,predicate)=>{if(!node || typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const match=find(child,predicate);if(match)return match;}return null;};
const video={srcObject:null,muted:true,play:async()=>{}};
vm.runInNewContext(compile('components/admin/LiveHostConsole.tsx'), {
  module:mod,exports:mod.exports,console,
  require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='@daily-co/daily-js'?{default:{createCallObject:()=>call},__esModule:true}:protocol.exports,
  MediaStream:class {constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}},
  Date:class extends Date {static now(){return now;}},
  fetch:async url=>({ok:true,json:async()=>{
    if(url.endsWith('/next')) {host.queued=0;return {cue:'[ODD test] Is it refurbished?',questions:[{text:'Is it refurbished?'}]};}
    return {...host};
  }}),
  setInterval:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
  clearInterval:id=>timers.delete(id),
});
const render=()=>{cursor=0;pendingEffects=[];view=mod.exports.LiveHostConsole({adminKey:'test',dropKey:'test'});find(view,n=>n.type==='video').props.ref.current=video;for(const run of pendingEffects)run();};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();render();};
const tick=async(ms=2000)=>{now+=ms;for(const timer of [...timers.values()])if(timer.ms===2000)timer.fn();await settle();};
const speaking=(role,started)=>handlers['app-message']({data:{event_type:`conversation.${started?'started':'stopped'}_speaking`,properties:{role}}});
const refresh=async()=>{for(const timer of [...timers.values()])if(timer.ms===5000)await timer.fn();await settle();};
(async()=>{
  render();await settle();handlers['joined-meeting']();await settle();
  await tick();assert.equal(sent.length,0,'script sent before the presenter arrived');
  presenter=true;handlers['participant-updated']();await settle();
  assert.equal(video.srcObject.getTracks().map(t=>t.id).join(','),'v,a','host preview discarded the audio track');
  find(view,n=>n.type==='button' && n.props.children==='Listen to Chloe').props.onClick();await settle();
  assert.equal(video.muted,false,'preview could not be unmuted by a click');
  assert.equal(find(view,n=>n.type==='video').props.muted,false);
  await tick();assert.equal(sent[0].event_type,'conversation.echo');assert.equal(sent[0].properties.text,'First paragraph.');
  speaking('pal',true);await settle();
  host.queued=1;await refresh();await tick();assert.equal(sent.length,1,'question interrupted the script');
  speaking('pal',false);await settle();await tick();
  assert.equal(sent[1].event_type,'conversation.respond','question did not run between paragraphs');
  speaking('replica',true);await settle();await tick();assert.equal(sent.length,2);
  speaking('replica',false);await settle();await tick();
  assert.equal(sent[2].event_type,'conversation.echo');assert.equal(sent[2].properties.text,'Second paragraph.','script did not resume after the answer');
  speaking('pal',true);await settle();host.state='live';await refresh();await tick();assert.equal(sent.length,3,'price reveal interrupted a speaking turn');
  speaking('pal',false);await settle();await tick();assert.equal(sent[3].properties.text,'The price is now open.');
  console.log('Host console: waits for PAL, reads script, answers questions, resumes, and reveals without interruption: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
