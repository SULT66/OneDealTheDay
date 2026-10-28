// Execute the real pre-show, auto-join and browser playback effects. No paid calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const noop = () => {};
const jsx = (type, props) => ({type, props});
const settle = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
function hooks() {
  const slots=[]; let cursor=0; const pending=[];
  const react={
    createContext:()=>({Provider:'provider'}),useContext:noop,
    useState(initial) { const i=cursor++; if (!slots[i]) slots[i]={value:initial}; return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}]; },
    useRef(value) {const i=cursor++;return slots[i] ??= {current:value};},
    useCallback:fn=>fn,
    useEffect(fn,deps) {const i=cursor++;const old=slots[i];if(!old || deps.some((v,n)=>v!==old.deps[n]))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  return {react,render(fn){cursor=0;const view=fn();while(pending.length)pending.shift()();return view;},unmount(){slots.forEach(x=>x?.cleanup?.());}};
}
function compile(file,h,overrides={},globals={}) {
  const module={exports:{}};
  const require=name=>name==='react'?h.react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('CopyProvider')?{useCopy:()=>copy}:name.includes('/cn')?{cn:(...v)=>v.filter(Boolean).join(' ')}:overrides[name]||{};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module,exports:module.exports,require,console,AbortController,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:noop,...globals});
  return module.exports;
}
const copy=x=>x;
const find=(node,predicate)=>{if(!node || typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children,node.props?.host].flat(Infinity)){const match=find(child,predicate);if(match)return match;}return null;};
(async()=>{
  let requests=0, joins=[], retry, fail=false;
  const live={session:null,leftDropKey:'',captions:[],join:session=>{joins.push(session);}};
  const drop={drop_key:'scheduled',state:'waiting',title:'Product',video_url:'/demo.mp4',image_url:'/product.jpg',preroll_video_url:'/ad.mp4'};
  const h=hooks();
  const page=compile('components/live/LiveDropPanel.tsx',h,{
    './LiveBroadcast':{useLiveBroadcast:()=>live},'@/lib/analyticsSession':{recordLiveDropEvent:noop},
  },{fetch:async url=>{
    if(!url.startsWith('/api/live/host'))return {ok:true,json:async()=>({messages:[]})};
    requests++;
    return {ok:!fail,json:async()=>({drop_key:'scheduled',conversation_url:'https://example.test/shared'})};
  },setTimeout:(fn)=>{retry=fn;return 1;},clearTimeout:()=>{retry=null;}});
  const render=()=>h.render(()=>page.TavusHost({market:'us',drop}));
  render();await settle();assert.equal(requests,0,'pre-show consumed a viewer room');
  drop.state='live';render();await settle();assert.equal(requests,1);assert.equal(joins.length,1,'live visitor had to click Watch');
  assert.equal(joins[0].dropKey,'scheduled');
  live.session={dropKey:'scheduled'};render();await settle();
  live.session=null;live.leftDropKey='scheduled';render();await settle();assert.equal(requests,1,'Leave rejoined automatically');
  const resume=find(render(),n=>n.type==='button' && n.props.children==='app.live.watchChloe');
  assert(resume,'deliberately leaving must offer a way back');resume.props.onClick();render();await settle();assert.equal(requests,2);
  live.session={dropKey:'scheduled'};render();await settle();live.session=null;render();await settle();assert.equal(requests,2,'second Leave was ignored after resuming');
  live.leftDropKey='';fail=true;render();await settle();assert.equal(requests,3);assert(retry,'temporary errors need automatic retries');
  fail=false;await retry();await settle();assert.equal(joins.length,3);
  h.unmount();

  const p=hooks();const preroll=compile('components/live/LiveDropPanel.tsx',p,{'./LiveBroadcast':{useLiveBroadcast:()=>live}});
  let view=p.render(()=>preroll.PreShow({drop,untilStart:180}));
  assert(find(view,n=>n.props?.src==='/ad.mp4'),'dedicated ad source missing');
  assert(!find(view,n=>n.type==='button'),'pre-show unexpectedly asks for a click');
  // Waiting never mounts Tavus, and the live transition removes the ad.
  live.session=null;drop.state='waiting';view=p.render(()=>preroll.BroadcastStage({drop,market:'us',untilStart:1,untilEnd:601}));assert.equal(view.type,preroll.PreShow);
  drop.state='live';drop.tavus_available=true;view=p.render(()=>preroll.BroadcastStage({drop,market:'us',untilStart:0,untilEnd:600}));assert.equal(view.props.children.type,preroll.TavusHost);

  // Safari rejects audible autoplay: retry muted, with the video still playing.
  const v=hooks();const broadcast=compile('components/live/LiveBroadcast.tsx',v);
  let attempts=[],needs;
  const video={srcObject:null,muted:false,play(){attempts.push(this.muted);return this.muted?Promise.resolve():Promise.reject(new Error('NotAllowedError'));},pause:noop};
  let element;
  v.render(()=>{element=broadcast.BroadcastVideo({stream:{},label:'Chloe',onNeedsPlay:x=>{needs=x;}});element.props.ref.current=video;return element;});
  await settle();assert.deepEqual(attempts,[false,true]);assert.equal(needs,true);assert.equal(video.muted,true);
  v.unmount();
  console.log('Pre-show switches to live; automatic joining, retries, Leave/resume and Safari muted playback pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
