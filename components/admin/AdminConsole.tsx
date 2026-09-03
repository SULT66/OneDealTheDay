"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ShopIcons } from "./ShopIcons";

/**
 * The admin console: scheduling a Live Drop, and the catalogue refresh.
 *
 * The key is held in React state and nothing else. Not localStorage, not a
 * cookie: it is the one credential that can publish to the live site, and a
 * value kept in storage outlives the person who typed it.
 *
 * Everything renders as text through React, so a product title someone typed
 * is a product title and never markup.
 */

type AdminDrop = {
  drop_key: string;
  market: string;
  title: string;
  brand: string;
  retailer_name: string;
  currency: string;
  retail_price: number | null;
  drop_price: number | null;
  quantity_total: number;
  quantity_remaining: number;
  state: "upcoming" | "waiting" | "live" | "sold_out" | "ended";
  start_at: string;
  published: boolean;
  reminders: number;
  funnel: Record<string, number>;
};

const BLANK = {
  title: "",
  brand: "",
  retailer_name: "",
  market: "us",
  retail_price: "",
  drop_price: "",
  currency: "USD",
  quantity_total: "20",
  start_at: "",
  duration_minutes: "10",
  member_early_access_seconds: "0",
  image_url: "",
  affiliate_url: "",
  video_url: "",
  stream_embed_url: "",
  terms: "",
};

type FormState = typeof BLANK;

/* A datetime-local field speaks local wall clock and the server speaks ISO
   with an offset. The same drop is watched from five markets, so 20:00 on its
   own means five different moments. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
const readable = (iso: string) => new Date(iso).toLocaleString();

export function AdminConsole() {
  const [adminKey, setAdminKey] = useState("");
  const [drops, setDrops] = useState<AdminDrop[] | null>(null);
  const [markets, setMarkets] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(BLANK);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshOutput, setRefreshOutput] = useState("");

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "X-Admin-Key": adminKey }),
    [adminKey],
  );

  const load = useCallback(async () => {
    if (!adminKey) return;
    const response = await fetch("/api/admin/live-drops", {
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setDrops(null);
      setMessage(body?.error || "That key was not accepted.");
      return;
    }
    setMarkets(body.markets || ["us"]);
    setDrops(body.drops || []);
    setMessage("");
    setForm((current) =>
      current.market && (body.markets || []).includes(current.market)
        ? current
        : { ...current, market: (body.markets || ["us"])[0] },
    );
  }, [adminKey]);

  /* Loading is what proves the key, so it happens on entry rather than behind
     a button somebody would have to know to press. */
  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    const response = await fetch(url, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    setMessage(response?.ok ? "Done." : result?.error || "That did not go through.");
    load();
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/live-drops", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...form, start_at: toIso(form.start_at) }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    if (response?.ok) {
      setMessage(`Drafted ${result.drop_key}. Nobody can see it until you publish it.`);
      setForm({ ...BLANK, market: form.market });
    } else {
      setMessage(result?.error || "That did not go through.");
    }
    load();
  };

  const runRefresh = async () => {
    setRefreshOutput("Searching...");
    const response = await fetch("/api/admin/refresh", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setRefreshOutput(JSON.stringify(result, null, 2));
  };

  const unlocked = drops !== null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">Admin</h1>

      <Card className="mt-6">
        <Legend>Admin key</Legend>
        <p className="mt-1 text-sm text-fg-muted">
          ADMIN_KEY from the environment. Kept in this tab only, never stored.
        </p>
        <input
          type="password"
          autoComplete="off"
          value={adminKey}
          onChange={(event) => setAdminKey(event.target.value)}
          placeholder="Paste the key to unlock"
          aria-label="Admin key"
          className="mt-4 h-12 w-full max-w-md rounded-full border border-border bg-surface-2 px-5 text-sm text-fg outline-none transition-colors focus:border-border-strong"
        />
      </Card>

      <Card className="mt-6">
        <Legend>Live Drops</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          A drop is saved as a draft. Publishing is a separate, deliberate step, because
          writing a drop and announcing it are different decisions and this site is live.
          Times are in the timezone of this computer.
        </p>

        <form onSubmit={create} className="mt-6">
          <fieldset disabled={!unlocked || busy} className="border-0 p-0 disabled:opacity-55">
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Product title" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
              <Field label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
              <Field label="Retailer" value={form.retailer_name} onChange={(v) => setForm({ ...form, retailer_name: v })} />

              <label className="block py-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Market</span>
                <select
                  value={form.market}
                  onChange={(event) => setForm({ ...form, market: event.target.value })}
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
                >
                  {(markets.length ? markets : [form.market]).map((market) => (
                    <option key={market} value={market}>
                      {market.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <Field label="Normal price" type="number" step="0.01" value={form.retail_price} onChange={(v) => setForm({ ...form, retail_price: v })} />
              <Field label="Drop price" type="number" step="0.01" value={form.drop_price} onChange={(v) => setForm({ ...form, drop_price: v })} />
              <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
              <Field label="Units" type="number" required value={form.quantity_total} onChange={(v) => setForm({ ...form, quantity_total: v })} />
              <Field label="Starts" type="datetime-local" required value={form.start_at} onChange={(v) => setForm({ ...form, start_at: v })} />
              <Field label="Minutes open" type="number" required value={form.duration_minutes} onChange={(v) => setForm({ ...form, duration_minutes: v })} />
              <Field label="Member head start (seconds)" type="number" value={form.member_early_access_seconds} onChange={(v) => setForm({ ...form, member_early_access_seconds: v })} />
              <Field label="Image URL" type="url" value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
              <Field label="Buy link" type="url" value={form.affiliate_url} onChange={(v) => setForm({ ...form, affiliate_url: v })} />
              {/* The recording is the show, and these labels said otherwise.
                  "Product demo video (optional)" described a small extra
                  beside an AI host who took the stage — which is how the drop
                  ended up as a private call each rather than one broadcast.
                  The recording is what an audience watches together: no
                  ceiling, no per-viewer cost, one message. A live stream still
                  outranks it when there is one. */}
              <Field label="Chloe's recorded presentation (video URL)" type="url" value={form.video_url} onChange={(v) => setForm({ ...form, video_url: v })} />
              <Field label="Live stream embed URL (only for a real broadcast)" type="url" value={form.stream_embed_url} onChange={(v) => setForm({ ...form, stream_embed_url: v })} />
            </div>

            <label className="mt-2 block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Terms</span>
              <textarea
                rows={2}
                value={form.terms}
                onChange={(event) => setForm({ ...form, terms: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>

            <button
              type="submit"
              className="mt-4 inline-flex h-12 cursor-pointer items-center rounded-full bg-lime px-7 text-sm font-bold text-ink transition-opacity hover:opacity-88 disabled:opacity-60"
            >
              Create draft
            </button>
          </fieldset>
        </form>

        {message && (
          <p className="mt-4 text-sm font-medium text-fg" role="status">
            {message}
          </p>
        )}

        <div className="mt-8 space-y-3">
          {!unlocked && (
            <p className="text-sm text-fg-subtle">Enter the admin key to load the schedule.</p>
          )}
          {unlocked && !drops.length && <p className="text-sm text-fg-subtle">Nothing scheduled yet.</p>}
          {(drops || []).map((drop) => (
            <DropRow key={drop.drop_key} drop={drop} busy={busy} act={act} />
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <Legend>Shop icons</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Most shops hand over their logo when asked. A few refuse an automated
          request, and dressing our fetcher up as a browser to get around that is
          not worth doing, so point us at the image once instead. An icon set here
          is never replaced by a later lookup. A row reading no icon is a shop that
          gave us nothing, which is the one worth setting.
        </p>
        <ShopIcons adminKey={adminKey} />
      </Card>

      <Card className="mt-6">
        <Legend>Catalogue refresh</Legend>
        <p className="mt-1 text-sm text-fg-muted">Run discovery now and publish the top ten.</p>
        <button
          type="button"
          disabled={!adminKey}
          onClick={runRefresh}
          className="mt-4 inline-flex h-12 cursor-pointer items-center rounded-full border border-border px-6 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
        >
          Find and publish Top 10
        </button>
        {refreshOutput && (
          <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-fg-muted">
            {refreshOutput}
          </pre>
        )}
      </Card>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card border border-border bg-surface p-6 sm:p-8", className)}>
      {children}
    </section>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-fg">{children}</h2>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</span>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none transition-colors focus:border-border-strong"
      />
    </label>
  );
}

function DropRow({
  drop,
  busy,
  act,
}: {
  drop: AdminDrop;
  busy: boolean;
  act: (url: string, body: unknown, method?: string) => void;
}) {
  const [stock, setStock] = useState(String(drop.quantity_remaining));
  /* A published drop shows where it is in its own life. An unpublished one is
     a draft whatever the clock says, because nobody can see it. */
  const state = drop.published ? drop.state : "draft";
  const live = drop.published && drop.state === "live";

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.1em]",
            live ? "bg-danger/10 text-danger" : "bg-surface-2 text-fg-muted",
          )}
        >
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />}
          {state.replace(/_/g, " ")}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{drop.title}</h3>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        {drop.market.toUpperCase()} · {readable(drop.start_at)} ·{" "}
        <span className="tnum">
          {drop.quantity_remaining}/{drop.quantity_total}
        </span>{" "}
        left ·{" "}
        {drop.drop_price ? (
          <span className="tnum">
            {drop.currency} {drop.drop_price}
          </span>
        ) : (
          "no price set"
        )}
        {drop.retailer_name ? ` · ${drop.retailer_name}` : ""}
      </p>

      {/* Whether it worked, next to the drop itself rather than on a second
          screen: waited, saw the price, went to buy. */}
      <p className="mt-1 text-xs text-fg-subtle tnum">
        {drop.funnel.waiting_room || 0} waited · {drop.funnel.reveal || 0} saw the reveal ·{" "}
        {drop.funnel.buy_click || 0} went to buy · {drop.reminders} reminders
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(`/api/admin/live-drops/${drop.drop_key}/publish`, { published: !drop.published })
          }
          className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
        >
          {drop.published ? "Unpublish" : "Publish"}
        </button>

        {drop.published ? (
          <>
            {/* Stock is the one number worth correcting while a drop runs, and
                setting it to zero is also how one is closed early and
                honestly. */}
            <input
              type="number"
              min={0}
              max={drop.quantity_total}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              aria-label={`Units left for ${drop.title}`}
              className="h-9 w-20 rounded-full border border-border bg-surface-2 px-3 text-xs text-fg outline-none focus:border-border-strong"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(`/api/admin/live-drops/${drop.drop_key}/stock`, {
                  quantity_remaining: Number(stock),
                })
              }
              className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
            >
              Set stock
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(`/api/admin/live-drops/${drop.drop_key}`, null, "DELETE")}
            className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-55"
          >
            Delete draft
          </button>
        )}

        <a
          href={`/${drop.market}/live`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center px-2 text-xs font-semibold text-fg-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Open the page
        </a>
      </div>
    </div>
  );
}
