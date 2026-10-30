"use client";

import { useCallback, useEffect, useState } from "react";

type Refresh = { status: string; found: number; at: string | null; message: string };
type Merchant = {
  id: string; name: string; network: string; feed_configured: boolean; source: string;
  published: number; complete: number; last_price_check: string | null;
  outbound_clicks_30d: number; refresh: Refresh | null;
};
type Health = {
  market: string; as_of: string; period_days: number; stores: Merchant[];
  totals: { configured: number; with_products: number; published: number; complete: number };
};
const dateLabel = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
const refreshLate = (value: string | null) =>
  !value || !Number.isFinite(Date.parse(value)) || Date.now() - Date.parse(value) > 36 * 3600000;

export function MerchantHealth({ adminKey }: { adminKey: string }) {
  const [market, setMarket] = useState("us");
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/merchant-health?market=${encodeURIComponent(market)}`, {
        headers: { "X-Admin-Key": adminKey },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Admin key not accepted." : `Could not load merchant health (HTTP ${response.status}).`);
      setHealth((await response.json()) as Health);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load merchant health.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [adminKey, market]);
  useEffect(() => { void load(); }, [load]);

  const stores = [...(health?.stores || [])].sort((a, b) =>
    Number(b.feed_configured) - Number(a.feed_configured) ||
    b.published - a.published || a.name.localeCompare(b.name));
  const total = health?.totals.published || 0;
  const largest = stores.reduce((best, row) => Math.max(best, row.published), 0);
  const largestShare = total ? Math.round(largest / total * 100) : 0;

  return (
    <section aria-label="Merchant health" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-fg">Merchant Control Center</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Actual catalog imports, not affiliate approvals. Refreshes are run by the existing catalog scheduler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted" htmlFor="merchant-market">Market</label>
          <select id="merchant-market" value={market} onChange={event => setMarket(event.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-fg">
            {["us","ca","uk","fr","de"].map(code=><option key={code} value={code}>{code.toUpperCase()}</option>)}
          </select>
          <button type="button" onClick={() => void load()} disabled={!adminKey || loading}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg disabled:opacity-50">
            {loading ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {health && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Import sources", health.totals.configured],
              ["Stores with products", health.totals.with_products],
              ["Published products", total],
              ["Complete listings", health.totals.complete],
            ].map(([name, number]) => (
              <div key={name} className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-xs text-fg-muted">{name}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-fg">{Number(number).toLocaleString()}</p>
              </div>
            ))}
          </div>
          {largestShare >= 40 && (
            <p className="rounded-xl border border-border px-4 py-3 text-sm text-fg-muted">
              Catalog concentration: one source supplies {largestShare}% of published listings.
              This is a catalog-wide share, not the homepage mix. The discovery shelf has separate diversity limits.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[740px] text-left text-xs">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  {["Merchant", "Product feed", "Published", "Complete", "Clicks 30d", "Latest refresh"].map(heading=>
                    <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stores.map(row => {
                  const status = !row.feed_configured ? "No feed configured"
                    : row.refresh?.status === "failed" ? "Refresh failed"
                    : row.refresh && refreshLate(row.refresh.at) ? "Refresh overdue"
                    : row.published === 0 ? "No live listings"
                    : row.complete === 0 ? "Missing product data"
                    : row.refresh?.status === "success" ? "Import running" : "No refresh history";
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-3">
                        <strong className="block text-sm text-fg">{row.name}</strong>
                        <span className="text-fg-muted">{row.network}</span>
                      </td>
                      <td className="px-3 py-3 text-fg-muted">{row.feed_configured ? "Configured" : "Not configured"}</td>
                      <td className="px-3 py-3 font-semibold tabular-nums text-fg">{row.published.toLocaleString()}</td>
                      <td className="px-3 py-3 tabular-nums text-fg">{row.complete.toLocaleString()}</td>
                      <td className="px-3 py-3 tabular-nums text-fg">{row.outbound_clicks_30d.toLocaleString()}</td>
                      <td className="px-3 py-3 text-fg-muted">
                        <span className={row.refresh?.status === "failed" ? "font-semibold text-danger" : "font-medium text-fg"}>{status}</span>
                        <span className="mt-1 block">{dateLabel(row.refresh?.at || null)}</span>
                        {row.refresh?.status === "failed" && row.refresh.message &&
                          <span className="mt-1 block break-words">{row.refresh.message.slice(0, 200)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">
            "Complete" means published with a price, descriptive title, image and affiliate link. It does not certify
            customer satisfaction. Clicks are tracked product-to-store departures, not orders or commissions.
            A store without a feed can still have a valid affiliate relationship and storefront link.
            Data checked: {dateLabel(health.as_of)}.
          </p>
        </>
      )}
    </section>
  );
}
