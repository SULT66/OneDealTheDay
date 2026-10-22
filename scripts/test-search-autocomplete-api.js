const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const Database=require('better-sqlite3');
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'odd-autocomplete-api-'));
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  let output='';
  const child=spawn(process.execPath,['app.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,
    PORT:String(port),DATA_DIR:temp,MEDIA_DIR:path.join(temp,'media'),WEBSITE_SITE_NAME:'autocomplete-test',
    ONEDAILYDROP_DATABASE_URL:'',EBAY_CLIENT_ID:'test-client',EBAY_CLIENT_SECRET:'test-secret',EBAY_CAMPAIGN_ID:'5339179772',
    SUPPORTED_MARKETS:'us',WARM_PATHS:'/us',
  },stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const get=async route=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200,output);return {body:await response.json(),headers:response.headers};};
  try{
    let ready=false;for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw Error(output);
      try{const r=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }assert(ready,output);
    const db=new Database(path.join(temp,'site.db'));
    const insert=db.prepare(`INSERT INTO products(id,external_id,market,title,brand,category,normalized_category,description,source,status,currency,current_price,score,availability,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(let id=1;id<=100;id++)insert.run(id,'auto-'+id,'us',`Brand${id} Wireless Headphones Bluetooth`,'Brand'+id,'Electronics','Electronics','large retailer description '.repeat(1000),'ebay','published','USD',20+id,85,'In stock',new Date().toISOString());
    db.prepare("UPDATE products SET image_url='https://example.com/headphones.jpg',affiliate_url='https://www.ebay.com/itm/123456789012'").run();
    db.close();
    const start=performance.now();
    const vocabulary=await get('/api/search/vocabulary?market=us');
    assert(vocabulary.body.terms.some(x=>x.term==='headphones'));
    assert(!JSON.stringify(vocabulary.body).includes('large retailer description'));
    assert(vocabulary.headers.get('cache-control').includes('max-age=300'));
    const repeated=await get('/api/search/vocabulary?market=us');assert.equal(repeated.headers.get('x-odd-cache'),'HIT');
    const found=await get('/api/search?q=headphones&market=us&catalog=1');
    assert(found.body.products.length>0,JSON.stringify(found.body));
    for(const item of found.body.products){assert(!('description' in item));assert(item.current_price>0);assert.equal(item.public_category,'Electronics');assert('display_score' in item);}
    const legacy=await get('/api/search?q=headphones&market=us&limit=100');
    assert(legacy.body.products[0].description.includes('large retailer description'),'Compact responses must not contaminate the full API cache');
    console.log(`Search API integration passed: vocabulary, cache and compact results (${Math.round(performance.now()-start)}ms total locally).`);
  }finally{
    if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
