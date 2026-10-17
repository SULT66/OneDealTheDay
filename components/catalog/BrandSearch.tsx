"use client";

import {useNavigationProgress} from "@/components/site/NavigationProgress";
import {useCopy} from "@/components/site/CopyProvider";

export function BrandSearch({market, query}: {market: string; query: string}) {
  const {pending, navigate} = useNavigationProgress();
  const tr = useCopy();
  return <form role="search" aria-busy={pending} action={"/" + market + "/brands"} onSubmit={event => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    navigate("/" + market + "/brands" + (q ? "?q=" + encodeURIComponent(q) : ""));
  }} className="my-6 flex gap-3">
    <input name="q" defaultValue={query} key={query} aria-label={tr("app.brands.search")}
      placeholder={tr("app.brands.search")} className="min-w-0 flex-1 rounded-full border border-border bg-surface px-5 py-3"/>
    <button disabled={pending} className="rounded-full bg-lime px-5 py-3 font-semibold text-ink">
      {tr("app.card.searchButton")}
    </button>
  </form>;
}
