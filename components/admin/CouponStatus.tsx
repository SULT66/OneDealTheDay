"use client";
import { useCallback, useEffect, useState } from "react";
type Source = {status:string; configured:boolean; active?:number; lastAttemptAt?:string;lastSuccessAt?:string;nextAttemptAt?:string;errorCode?:string;sourceResults?:{source:string;status:string;httpStatus?:number;offers:number}[]};
type Status = {active?:number;sources:Record<string,Source>};
export function CouponStatus({adminKey,active}:{adminKey:string;active:boolean}) {
  const [data,setData]=useState<Status|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    if(!adminKey)return;
    try{
      const response=await fetch('/api/admin/coupons',{headers:{'X-Admin-Key':adminKey}});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Could not load coupon status.');
      setData(body);
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load coupon status.');}
  },[adminKey]);
  useEffect(()=>{if(active)void load();},[active,load]);
  async function refresh(){
    setBusy(true);setMessage('Checking coupon sources…');
    try{
      const response=await fetch('/api/admin/coupons/refresh',{method:'POST',headers:{'X-Admin-Key':adminKey}});
      if(!response.ok)throw new Error('Coupon refresh did not finish.');
      const body=await response.json();
      const unavailable=Object.values(body.sources || {}).some((source:unknown)=>(source as Source).status!=='success');
      setMessage(unavailable?'Check finished. Some sources need attention; see their status below.':'Coupon sources updated.');
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Coupon refresh failed.');}
    finally{setBusy(false);}
  }
  const time=(value?:string)=>value?new Date(value).toLocaleString():'Not yet';
  return <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
    <h2 className="text-xl font-bold text-fg">Coupons</h2>
    <p className="mt-2 text-sm text-fg-muted">Sources are checked every six hours, with hourly retries after failures. Expired or stale codes disappear automatically.</p>
    {data && <p className="mt-3 text-sm font-semibold">{data.active ?? 0} active coupons on the US page</p>}
    <button type="button" disabled={!adminKey || busy} onClick={refresh} className="mt-4 rounded-full border border-border px-5 py-3 text-sm font-semibold disabled:opacity-50">{busy?'Checking…':'Refresh coupons now'}</button>
    {message && <p role="status" className="mt-3 text-sm text-fg-muted">{message}</p>}
    {data && <div className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(data.sources).map(([name,source])=><div key={name} className="rounded-xl border border-border p-4 text-sm">
      <h3 className="font-bold">{name==='awin'?'Awin partner codes':'Official public offers'}</h3>
      <p className="mt-2">Status: {source.status.replaceAll('_',' ')}</p>
      <p>Active: {source.active ?? 0}</p><p>Last attempt: {time(source.lastAttemptAt)}</p><p>Last successful check: {time(source.lastSuccessAt)}</p><p>Next attempt: {time(source.nextAttemptAt)}</p>
      {!source.configured && <p className="mt-2">The Awin API token is missing. Add AWIN_API_TOKEN to the app settings to enable partner-code updates.</p>}
      {source.sourceResults?.map(item=><p className="mt-2 break-all" key={item.source}>{new URL(item.source).hostname}: {item.status}{item.httpStatus?` (HTTP ${item.httpStatus})`:''} · {item.offers} codes</p>)}
    </div>)}</div>}
  </section>;
}
