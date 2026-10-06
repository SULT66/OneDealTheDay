"use client";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { DealFilter } from "@/lib/types";
import { useCopy } from "@/components/site/CopyProvider";

export function PriceRange({ filter, bounds, currency, market, onApply }: { filter: DealFilter; bounds: {min: number; max: number}; currency: string; market: string; onApply: (patch: Partial<DealFilter>) => void }) {
  const tr = useCopy();
  const [min, setMin] = useState(String(filter.minPrice ?? bounds.min));
  const [max, setMax] = useState(String(filter.maxPrice ?? bounds.max));
  const [error, setError] = useState("");
  useEffect(() => { setMin(String(filter.minPrice ?? bounds.min)); setMax(String(filter.maxPrice ?? bounds.max)); setError(""); }, [filter.minPrice, filter.maxPrice, bounds.min, bounds.max]);
  const low = Number(min); const high = Number(max);
  const trackMin = Math.min(bounds.min, low || 0);
  const trackMax = Math.max(bounds.max, high || 0, trackMin + 1);
  const span = trackMax - trackMin;
  function apply() {
    if (!min || !max || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) { setError(tr("app.filter.invalidPrice")); return; }
    setError("");
    onApply({ minPrice: low <= bounds.min ? undefined : low, maxPrice: high >= bounds.max ? undefined : high });
  }
  return <form onSubmit={event => { event.preventDefault(); apply(); }}>
    <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">{tr("app.filter.priceRange")}</h3>
    <p className="mt-2 text-lg font-bold tnum">{formatPrice(low, currency, market)} – {formatPrice(high, currency, market)}{!filter.query && !filter.retailer && high >= bounds.max ? "+" : ""}</p>
    <div className="relative mt-3 h-11">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
      <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lime" style={{left: `${Math.max(0, (low-trackMin)/span*100)}%`, right: `${Math.max(0,100-(high-trackMin)/span*100)}%`}} />
      <input type="range" aria-label={tr("app.filter.minimumPrice")} min={trackMin} max={trackMax} step="any" value={low} onChange={event => setMin(String(Math.min(Number(event.target.value), high)))} className="range-thumb pointer-events-none absolute inset-0 h-11 w-full cursor-pointer" />
      <input type="range" aria-label={tr("app.filter.maximumPrice")} min={trackMin} max={trackMax} step="any" value={high} onChange={event => setMax(String(Math.max(Number(event.target.value), low)))} className="range-thumb pointer-events-none absolute inset-0 h-11 w-full cursor-pointer" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-fg-muted">{tr("app.filter.minimumPrice")}<input type="number" min="0" step="0.01" required value={min} onChange={event => setMin(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg" /></label>
      <label className="text-xs text-fg-muted">{tr("app.filter.maximumPrice")}<input type="number" min="0" step="0.01" required value={max} onChange={event => setMax(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg" /></label>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <button type="submit" className="mt-3 h-10 w-full cursor-pointer rounded-full border border-border px-4 text-sm font-semibold">{tr("app.filter.applyPrice")}</button>
  </form>;
}
