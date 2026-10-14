import {redirect} from 'next/navigation';

export default async function HalloweenPage({params,searchParams}:{params:Promise<{market:string}>,searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {market}=await params, search=await searchParams;
  const query=new URLSearchParams();
  for(const [oldKey,key] of [['q','halloween_q'],['sort','halloween_sort'],['page','halloween_page'],['lang','lang']]) {
    const value=search[oldKey];
    if(typeof value==='string') query.set(key,value);
  }
  redirect(`/${market}${query.size?'?'+query:''}#halloween-products`);
}
