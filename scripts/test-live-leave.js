// Run the real provider and page heartbeat effects with browser/Daily fakes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const noop = () => {};
const settle = async () => { for (let i=0;i<15;i++) await Promise.resolve(); };
function compile(file, require, globals={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module:mod,exports:mod.exports,require,console,...globals});
  return mod.exports;
}
// Minimal hook runner: dependencies and cleanups behave as on a React rerender.
function hooks() {
  const slots=[]; let cursor=0; const pending=[];
  const react={
    createContext:()=>({Provider:'provider'}),useContext:noop,
    useState(value) { const i=cursor++; slots[i] ??= {value}; return [slots[i].value, next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}]; },
    useRef(value) { const i=cursor++; return slots[i] ??= {current:value}; },
    useCallback:fn=>fn,
    useEffect(fn,deps) {const i=cursor++; const old=slots[i]; if(!old || deps.some((v,k)=>v!==old.deps[k])) {pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
  };
  return {react,render(fn){cursor=0; const result=fn(); while(pending.length) pending.shift()();return result;},unmount(){slots.forEach(x=>x?.cleanup?.());}};
}
(async()=>{
  const h=hooks(), intervals=new Map(), timeouts=new Map(), listeners=new Map(), requests=[];
  let dropState="live", hostPhase="answering";
  let timerId=0, stopped=0, closed=0;
  const window={localStorage:{getItem:()=>null,setItem:noop}, AudioContext:class {resume(){return Promise.resolve();} close(){closed++; return Promise.resolve();}},
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:event=>listeners.get(event.type)?.(event)};
  const daily={createCallObject:()=>({on:noop,participants:()=>({}),join:()=>Promise.resolve(),leave:()=>Promise.resolve(),destroy:noop})};
  const jsx=(type,props)=>({type,props});
  const require=name=>name==='react'?h.react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='@daily-co/daily-js'?{default:daily}:
    name==='next/navigation'?{usePathname:()=>'/us/live'}:name.includes('analyticsSession')?{analyticsSessionId:()=> 'stable-viewer-session'}:
    name.includes('stageMusic')?{startStageMusic:()=>({stop(){stopped++;},setEnabled:noop,setTalking:noop})}:name.includes('CopyProvider')?{useCopy:()=>x=>x}:{};
  const broadcast=compile('components/live/LiveBroadcast.tsx',require,{window,document:{addEventListener:noop,removeEventListener:noop},navigator:{sendBeacon:()=>false},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},Blob,
    fetch:async(url,options)=>{if(url.startsWith('/api/live/current'))return {ok:true,json:async()=>({drop:{drop_key:'drop1',state:dropState,seconds_until_end:180}})};if(url.startsWith('/api/live/chat'))return {ok:true,json:async()=>({phase:hostPhase})};requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({watching:options.body.includes('leaving')?0:1})};},
    setTimeout:(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,ms});return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),performance:{now:()=>10000}});
  const render=()=>h.render(()=>broadcast.LiveBroadcastProvider({market:'us',children:null})).props.value;
  let value=render();
  value.join({conversationUrl:'https://example.test/room',dropKey:'drop1',market:'us',title:'Test'});
  value=render(); await settle();
  assert.equal(requests.at(-1).leaving,undefined);
  assert([...intervals.values()].some(x=>x.ms===20000),'joined viewers need a heartbeat');
  value.leave();
  assert.equal(stopped,1,'Leave must silence music synchronously');
  assert.equal(closed,1,'Leave must close the audio context');
  value=render();await settle();
  assert.equal(value.session,null);assert.equal(value.leftDropKey,'drop1');
  assert.equal(requests.at(-1).leaving,true,'Leave on the LIVE page must delete presence');
  assert(![...intervals.values()].some(x=>x.ms===20000),'Leave must cancel the broadcast heartbeat');
  // The page must not recreate presence after the provider has left.
  const pageHooks=hooks(); let broadcastValue=value;
  const page=compile('components/live/LiveDropPanel.tsx',name=>name==='react'?pageHooks.react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:
    name.includes('CopyProvider')?{useCopy:()=>x=>x}:name.includes('LiveBroadcast')?{useLiveBroadcast:()=>broadcastValue,sendPresence:broadcast.sendPresence}:
    name.includes('analyticsSession')?{recordLiveDropEvent:noop,analyticsSessionId:()=> 'stable-viewer-session'}:name.includes('/format')?{formatPrice:()=>'$1'}:{},
    {window,document:{addEventListener:noop,removeEventListener:noop},navigator:{sendBeacon:()=>false},Blob,fetch:async()=>({ok:true,json:async()=>({drop:null})}),
      setInterval:(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout:()=>1,clearTimeout:noop});
  const initialDrop={drop_key:'drop1',state:'live',watching:0,seconds_until_start:0,seconds_until_end:60,currency:'USD'};
  const before=requests.length;
  pageHooks.render(()=>page.LiveDropPanel({market:'us',initialDrop,serverChecked:true}));await settle();
  assert.equal(requests.length,before,'the page must not send another heartbeat after Leave');
  assert(![...intervals.values()].some(x=>x.ms===20000));
  value.join({conversationUrl:'https://example.test/room',dropKey:'drop1',market:'us',title:'Test'});
  value=render();await settle();
  assert.equal(value.leftDropKey,'');assert.equal(requests.at(-1).leaving,undefined,'rejoining restores presence');

  // Expiry keeps the room for the sign-off, then fades before disconnecting.
  dropState='live';value.join({conversationUrl:'https://example.test/room',dropKey:'drop1',market:'us',title:'Test'});
  value=render();await settle();
  dropState='ended';
  await [...intervals.values()].find(x=>x.ms===5000).fn();await settle();value=render();
  assert.equal(value.closing,true);assert(value.session,'room disconnected before goodbye');
  assert.equal(value.fading,false);
  const closingStage=broadcast.SwapStage({host:null,talking:false,closing:true,productVideo:'/portrait.mp4',productAlt:'Test'});
  assert.equal(closingStage.props.children[1].props.style.width,'100%','Chloe did not take the whole stage');
  assert.equal(closingStage.props.children[0].props.style.opacity,0,'product did not fade away');
  hostPhase='closed';await [...intervals.values()].find(x=>x.ms===5000).fn();await settle();value=render();
  assert.equal(value.fading,true);assert(value.session,'room disconnected before fade');
  [...timeouts.values()].find(x=>x.ms===900).fn();value=render();await settle();
  assert.equal(value.session,null,'room stayed open after goodbye and fade');
  h.unmount();pageHooks.unmount();await settle();

  // The actual product stage has a muted cover backdrop and full-size foreground.
  const stage=broadcast.SwapStage({host:null,talking:false,productVideo:'/portrait.mp4',productAlt:'Test'});
  const productElement=stage.props.children[0].props.children;
  const videoPair=productElement.type(productElement.props).props.children;
  const [backdrop,foreground]=videoPair;
  assert(backdrop.props.muted && foreground.props.muted,'the backdrop must never duplicate audio');
  assert(backdrop.props.className.includes('object-cover') && backdrop.props.className.includes('blur-2xl'));
  assert(foreground.props.className.includes('object-contain'),'the portrait video must remain uncropped');
  const backgroundVideo={currentTime:0,paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
  backdrop.props.ref.current=backgroundVideo;
  foreground.props.onTimeUpdate({currentTarget:{currentTime:5,paused:false}});
  assert.equal(backgroundVideo.currentTime,5);assert.equal(backgroundVideo.paused,false);
  foreground.props.onPause({currentTarget:{currentTime:5,paused:true}});
  assert.equal(backgroundVideo.paused,true);

  // Real synthesizer: immediate, idempotent stop, even with future notes queued.
  let disconnected=0, oscillatorStops=0; const nodes=[];
  const param=()=>({value:0,setValueAtTime:noop,setTargetAtTime:noop,linearRampToValueAtTime:noop,cancelScheduledValues:noop});
  const node=()=>{const n={gain:param(),frequency:param(),delayTime:param(),connect(){return this;},disconnect(){disconnected++;},start:noop,stop(){oscillatorStops++;}};nodes.push(n);return n;};
  const context={currentTime:0,destination:{},createGain:node,createBiquadFilter:node,createDelay:node,createOscillator:node};
  const musicModule=compile('components/live/stageMusic.ts',()=>({}),{setInterval:()=>1,clearInterval:noop});
  const music=musicModule.startStageMusic(context);music.stop();const stops=oscillatorStops,disconnects=disconnected;
  music.stop();music.setTalking(true);music.setEnabled(true);
  assert.equal(oscillatorStops,stops);assert.equal(disconnected,disconnects);assert(stops>0);
  const ids=compile('lib/analyticsSession.ts',()=>({}),{sessionStorage:{getItem(){throw Error('blocked');}},crypto:globalThis.crypto});
  assert.equal(ids.analyticsSessionId(),ids.analyticsSessionId(),'blocked storage must keep the same presence identity');
  console.log('LIVE Leave: music stops, presence disappears, page stays left, rejoin and storage fallback pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
