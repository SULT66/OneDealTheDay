"use client";

import Link from "next/link";
import {useNavigationProgress} from "./NavigationProgress";
import {useEffect,useId,useMemo,useRef,useState} from "react";
import {ClockCounterClockwise,MagnifyingGlass,ArrowUpRight} from "@phosphor-icons/react";
import {useCopy,useLanguage} from "./CopyProvider";
import {autocompleteTerms,autocompleteSelection} from "@/src/searchAutocomplete";

type Term = {term:string;count:number};
const RECENT_KEY="odd_recent_searches";
const vocabularyCache=new Map<string,{terms:Term[];expires:number}>();
const messages={
  en:{loading:"Loading suggestions…",unavailable:"Suggestions are unavailable. Press Enter to search."},
  es:{loading:"Cargando sugerencias…",unavailable:"No hay sugerencias disponibles. Pulsa Intro para buscar."},
  fr:{loading:"Chargement des suggestions…",unavailable:"Suggestions indisponibles. Appuyez sur Entrée pour rechercher."},
  de:{loading:"Vorschläge werden geladen…",unavailable:"Vorschläge nicht verfügbar. Drücke Enter zum Suchen."},
};
function readRecent():string[]{
  try {const rows=JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");return Array.isArray(rows)?rows.filter(x=>typeof x==="string").slice(0,5):[];}catch{return [];}
}

export function SearchBox({market,label,action,className}:{market:string;label:string;action:string;className?:string}) {
  const {pending,navigate}=useNavigationProgress();
  const copy=useCopy();
  const language=useLanguage();
  const message=messages[language as keyof typeof messages]||messages.en;
  const listId=useId();
  const rootRef=useRef<HTMLDivElement>(null);
  const [value,setValue]=useState("");
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const [recent,setRecent]=useState<string[]>([]);
  const [vocabulary,setVocabulary]=useState<Term[]>([]);
  const [loading,setLoading]=useState(false);
  const [failed,setFailed]=useState(false);
  const typed=value.trim();
  useEffect(()=>setRecent(readRecent()),[]);

  // One small vocabulary request on focus. Typing itself has no network
  // round trip, debounce or full-catalog ranking job to wait for.
  useEffect(()=>{
    if(!open) return;
    const key=`${market}:${language}`;
    const saved=vocabularyCache.get(key);
    if(saved&&saved.expires>Date.now()){setVocabulary(saved.terms);setLoading(false);setFailed(false);return;}
    const controller=new AbortController();
    setLoading(true);setFailed(false);
    fetch(`/api/search/vocabulary?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`,{
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]),headers:{Accept:"application/json"},
    }).then(async response=>{
      if(!response.ok) throw new Error("Vocabulary unavailable");
      const body=await response.json();
      if(!Array.isArray(body.terms)) throw new Error("Invalid vocabulary");
      const terms:Term[]=body.terms.filter((x:Term)=>typeof x?.term==="string"&&Number.isFinite(x.count));
      if(controller.signal.aborted) return;
      vocabularyCache.set(key,{terms,expires:Date.now()+300000});setVocabulary(terms);
    }).catch(()=>{if(!controller.signal.aborted)setFailed(true);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[open,market,language]);

  const options=useMemo(()=>{
    const terms:Term[]=typed?autocompleteTerms(vocabulary,typed,8):recent.map(term=>({term,count:0}));
    return terms.map(item=>({...item,href:`/${market}/search?q=${encodeURIComponent(item.term)}`}));
  },[typed,vocabulary,recent,market]);
  const showDropdown=open&&(Boolean(typed)||options.length>0);
  const optionId=(index:number)=>`${listId}-option-${index}`;
  const close=()=>{setOpen(false);setActive(-1);};
  const remember=(query:string)=>{
    if(!query.trim()) return;
    const next=[query,...recent.filter(term=>term!==query)].slice(0,5);
    setRecent(next);try{localStorage.setItem(RECENT_KEY,JSON.stringify(next));}catch{}
  };
  const choose=(term:string,href:string)=>{remember(term);close();navigate(href);};
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node)){setOpen(false);setActive(-1);}};
    document.addEventListener("pointerdown",outside);
    return ()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  useEffect(()=>{
    if(open&&active>=0) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({block:"nearest"});
  },[active,open,listId]);

  return <div ref={rootRef} className={`relative z-50 ${className||""}`}>
    <form role="search" aria-busy={pending} action={`/${market}/search`} method="get" onSubmit={event=>{
      event.preventDefault();remember(typed);close();navigate(typed?`/${market}/search?q=${encodeURIComponent(typed)}`:`/${market}/search`);
    }}>
      <div className="flex h-12 items-center gap-2 rounded-full border border-border bg-surface pl-4 pr-1.5 transition-colors focus-within:border-fg-subtle">
        <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-fg-subtle" aria-hidden="true"/>
        <label htmlFor={`${listId}-input`} className="sr-only">{label}</label>
        <input id={`${listId}-input`} name="q" type="search" value={value}
          onChange={event=>{setValue(event.target.value);setOpen(true);setActive(-1);}}
          onFocus={()=>setOpen(true)} onKeyDown={event=>{
            if(event.key==="Escape"){event.preventDefault();close();return;}
            if((event.key==="ArrowDown"||event.key==="ArrowUp")&&options.length){
              event.preventDefault();setOpen(true);
              const step=event.key==="ArrowDown"?1:-1;
              setActive(current=>autocompleteSelection(current,step,options.length));return;
            }
            if(event.key==="Enter"&&open&&active>=0&&options[active]){
              event.preventDefault();choose(options[active].term,options[active].href);
            }
          }} placeholder={label} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          role="combobox" aria-expanded={showDropdown} aria-controls={showDropdown?listId:undefined}
          aria-autocomplete="list" aria-activedescendant={showDropdown&&active>=0?optionId(active):undefined}
          className="focus-self h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-subtle"/>
        <button type="submit" disabled={pending} className="hidden h-9 cursor-pointer items-center rounded-full bg-surface-inverse px-4 text-sm font-medium text-fg-on-inverse transition-opacity hover:opacity-88 sm:inline-flex">{action}</button>
      </div>
    </form>
    {showDropdown&&<div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface py-2 shadow-xl">
      <ul id={listId} role="listbox" aria-label={copy("app.search.suggestions")}>
        {!typed&&<li aria-hidden="true" className="px-4 pb-2 text-xs font-semibold text-fg-subtle">{copy("app.search.recent")}</li>}
        {options.map((option,index)=>{
          const position=typed?option.term.toLowerCase().indexOf(typed.toLowerCase()):-1;
          const Icon=typed?MagnifyingGlass:ClockCounterClockwise;
          return <li key={option.term}><Link href={option.href} prefetch={false} id={optionId(index)} role="option"
            aria-selected={active===index} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)}
            onClick={()=>{remember(option.term);close();}} onNavigate={event=>{event.preventDefault();navigate(option.href);}}
            className={`flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2 ${active===index?"bg-surface-2":""}`}>
            <Icon size={17} className="shrink-0 text-fg-subtle" aria-hidden="true"/>
            <span className="min-w-0 flex-1 truncate">{position<0?option.term:<><strong>{option.term.slice(0,position)}</strong>{option.term.slice(position,position+typed.length)}<strong>{option.term.slice(position+typed.length)}</strong></>}</span>
            <ArrowUpRight size={15} className="shrink-0 text-fg-subtle" aria-hidden="true"/>
          </Link></li>;
        })}
      </ul>
      {typed&&options.length===0&&<p role="status" className="px-4 py-3 text-sm text-fg-subtle">{loading?message.loading:failed?message.unavailable:copy("app.search.noneYet",{query:typed})}</p>}
    </div>}
  </div>;
}
