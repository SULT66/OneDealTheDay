"use client";

import { useCallback, useEffect, useState } from "react";

type Stage = { status: string; updated_at: number; details: { count?: number; reason?: string; gaps?: Array<{id: string; title: string}> } } | null;
type Snapshot = {
  enabled: boolean; researchEnabled: boolean;
  performance: {days: number; purchasesAvailable: boolean; shelves: Array<{placement: string; impressions: number; detailClicks: number}>};
  status: { stages: Record<string, Stage>; futureEvents: Array<{id: string; title: string; preparationAt?: string; startsAt: string}>;
    shelves: Array<{id: string; title: string; productCount: number}>;
    lastRun: {status: string; started_at: number} | null };
};
const ROLES = [
  { title: "1 · Holidays", stages: ["calendar"], description: "Plans regional occasions and promotion windows." },
  { title: "2 · Demand", stages: ["internal", "research"], description: "Compares site searches and checks cited external interest." },
  { title: "3 · Catalogue", stages: ["selection"], description: "Matches actual products and checks buying terms." },
  { title: "4 · Placement", stages: ["placement"], description: "Publishes shelves and removes expired offers." },
];

export function MerchandisingPanel({ adminKey, active }: { adminKey: string; active: boolean }) {
  const [market, setMarket] = useState("us");
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!adminKey) return;
    try {
      const response = await fetch(`/api/admin/merchandising?market=${market}`, {
        headers: { "X-Admin-Key": adminKey }, signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load agent status.");
      if (signal?.aborted) return;
      setData(body); setError("");
    } catch (problem) {
      if (signal?.aborted) return;
      setError(problem instanceof Error ? problem.message : "Could not load agent status.");
    }
  }, [adminKey, market]);
  useEffect(() => {
    if (!active || !adminKey) return;
    const controller = new AbortController();
    setData(null);
    void load(controller.signal);
    const timer = setInterval(() => { void load(controller.signal); }, 15000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [load, active, adminKey]);
  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/merchandising/run", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({market}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start the agents.");
      await load();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Could not start the agents."); }
    finally { setBusy(false); }
  };
  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to see the agents.</p>;
  return <section className="mt-6 rounded-card border border-border bg-surface p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-lg font-bold text-fg">Four merchandising agents</h2>
      <label className="text-sm text-fg-muted">Market <select value={market} onChange={event => setMarket(event.target.value)} className="ml-2 rounded-lg border border-border bg-surface-2 p-2">
        {["us", "ca", "uk", "fr", "de"].map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
      </select></label>
    </div>
    <p className="mt-2 text-sm text-fg-muted">Catalogue checks run hourly; the calendar refreshes weekly. Paid external research runs at most once per 24 hours in enabled markets.</p>
    {error && <p role="alert" className="mt-4 text-sm text-fg-muted">{error}</p>}
    {data && <>
      <p className="mt-3 text-xs text-fg-subtle">{data.enabled ? "Placement enabled" : "Placement disabled"} · {data.researchEnabled ? "External research configured for this market" : "External research disabled for this market"}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ROLES.map(role => <article key={role.title} className="rounded-xl border border-border p-4">
          <h3 className="font-semibold text-fg">{role.title}</h3>
          <p className="mt-1 text-xs text-fg-muted">{role.description}</p>
          {role.stages.map(name => {
            const stage = data.status.stages[name];
            return <p key={name} className="mt-2 text-xs text-fg-subtle">
              {name}: {stage?.status || "Not run yet"}
              {stage?.details.count != null ? ` · ${stage.details.count}` : ""}
              {stage?.details.reason ? ` · ${stage.details.reason.replaceAll("_", " ")}` : ""}
              {stage && <span className="block">{new Date(stage.updated_at).toLocaleString()}</span>}
            </p>;
          })}
        </article>)}
      </div>
      <h3 className="mt-6 font-semibold text-fg">Current shelves</h3>
      {data.status.shelves.length ? <ul className="mt-2 text-sm text-fg-muted">
        {data.status.shelves.map(shelf => <li key={shelf.id}>{shelf.title} · {shelf.productCount} products</li>)}
      </ul> : <p className="mt-2 text-sm text-fg-muted">No qualifying matches yet. Ordinary catalogue listings remain available.</p>}
      <h3 className="mt-6 font-semibold text-fg">Shelf response · last {data.performance.days} days</h3>
      <ul className="mt-2 text-sm text-fg-muted">{data.performance.shelves.map(shelf => <li key={shelf.placement}>
        {shelf.placement === "seasonal_card" ? "Seasonal" : "Interest"}: {shelf.impressions} impressions · {shelf.detailClicks} product opens
      </li>)}</ul>
      <p className="mt-2 text-xs text-fg-subtle">Owner visits are excluded. Product opens are interest signals; confirmed affiliate purchases are not connected to these shelves.</p>
      {data.status.stages.selection?.details.gaps?.length ? <details className="mt-4 text-sm text-fg-muted">
        <summary className="cursor-pointer">Occasions or trends without qualifying products</summary>
        <ul className="mt-2">{data.status.stages.selection.details.gaps.map(gap => <li key={gap.id}>{gap.title}</li>)}</ul>
      </details> : null}
      {data.status.futureEvents.length > 0 && <details className="mt-4 text-sm text-fg-muted">
        <summary className="cursor-pointer">Upcoming promotion windows</summary>
        <ul className="mt-2">{data.status.futureEvents.map(event => <li key={event.id}>
          {event.title} · promotion {new Date(event.startsAt).toLocaleDateString()}
          {event.preparationAt ? ` · prepare from ${new Date(event.preparationAt).toLocaleDateString()}` : ""}
        </li>)}</ul>
      </details>}
    </>}
    <button type="button" disabled={busy || !data?.enabled} onClick={run} className="mt-6 rounded-full border border-border px-5 py-3 text-sm font-semibold text-fg disabled:opacity-50">
      {busy ? "Starting…" : "Run checks now"}
    </button>
  </section>;
}
