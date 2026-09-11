"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * Adding and maintaining an Amazon product by hand.
 *
 * By hand is not a shortcut, it is the only lawful route until three qualifying
 * sales open the Product Advertising API: Amazon's agreement allows their
 * price, availability and images to be shown only when they come from it.
 * Nothing in this panel — or on the server behind it — fetches anything from
 * Amazon. The name, the note and the price are typed.
 *
 * Which makes the price the one field that rots. It is stamped with the moment
 * it was entered and shown on the site with that date, never as today's price,
 * and this panel says out loud how old each one is — because the only thing
 * worse than no price is a confident wrong one.
 *
 * The link is stored exactly as pasted. It carries the associate tag, and a
 * link that has lost it looks identical and earns nothing, which is the same
 * failure the store links had for months.
 */

type Pick = {
  id: number;
  market: string;
  title: string;
  category: string;
  url: string;
  asin: string;
  note: string;
  price: number | null;
  currency: string;
  price_checked_at: string | null;
  link_status: string;
  link_checked_at: string | null;
};

const daysSince = (iso: string | null) => {
  if (!iso) return null;
  const when = Date.parse(iso);
  return Number.isNaN(when) ? null : Math.floor((Date.now() - when) / 86_400_000);
};

/* How old a price may be before it is worth retyping. Not enforced — the site
   always prints the date beside it — but a nudge here is what stops the whole
   list drifting months out of date. */
const PRICE_STALE_DAYS = 7;

export function AmazonPicks({ adminKey }: { adminKey: string }) {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [form, setForm] = useState({ title: "", url: "", category: "", note: "", price: "", currency: "USD" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!adminKey) return;
    const response = await fetch("/api/admin/amazon-picks", {
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    if (!response?.ok) return setPicks(null);
    const body = await response.json();
    setPicks(body.picks || []);
  }, [adminKey]);

  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/amazon-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not go through.");
      setMessage(body.asin ? `Added. Amazon calls it ${body.asin}.` : "Added.");
      setForm({ title: "", url: "", category: "", note: "", price: "", currency: "USD" });
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const updatePrice = async (pick: Pick, price: string) => {
    setBusy(true);
    await fetch(`/api/admin/amazon-picks/${pick.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
      body: JSON.stringify({ price }),
    }).catch(() => null);
    setBusy(false);
    load();
  };

  const remove = async (id: number) => {
    setBusy(true);
    await fetch(`/api/admin/amazon-picks/${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    setBusy(false);
    load();
  };

  const checkLinks = async () => {
    setBusy(true);
    setMessage("Checking every link…");
    try {
      const response = await fetch("/api/admin/amazon-picks/check", {
        method: "POST",
        headers: { "X-Admin-Key": adminKey },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not go through.");
      setMessage(
        `Checked ${body.checked}: ${body.ok} alive, ${body.dead} dead, ${body.unknown} could not be told.`,
      );
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to manage these.</p>;

  return (
    <div className="mt-5">
      <form onSubmit={add}>
        <fieldset disabled={busy} className="border-0 p-0 disabled:opacity-55">
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <Field
              label="Name — you write it, nothing is fetched"
              required
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              placeholder="Anker 20W USB-C charger"
            />
            <Field
              label="Category (optional)"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              placeholder="Electronics"
            />
          </div>
          <Field
            label="SiteStripe link"
            required
            type="url"
            value={form.url}
            onChange={(v) => setForm({ ...form, url: v })}
            placeholder="https://amzn.to/..."
          />
          <Field
            label="Why it is worth a look — your words, not Amazon's copy"
            value={form.note}
            onChange={(v) => setForm({ ...form, note: v })}
            placeholder="Keeps ice for two days. The lid actually seals."
          />
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <Field
              label="Price today (optional)"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(v) => setForm({ ...form, price: v })}
              placeholder="45.00"
            />
            <Field
              label="Currency"
              value={form.currency}
              onChange={(v) => setForm({ ...form, currency: v })}
            />
          </div>
          {/* Said here rather than discovered later on the live page. */}
          <p className="mt-1 text-xs text-fg-subtle">
            The site shows a price with the day you entered it &mdash; never as
            today&rsquo;s. Amazon moves prices often, and their rules only allow a
            live price through the API, which opens after three sales.
          </p>

          <button
            type="submit"
            className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full bg-surface-inverse px-6 text-sm font-semibold text-fg-on-inverse transition-opacity hover:opacity-88"
          >
            Add
          </button>
        </fieldset>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={checkLinks}
          className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
        >
          Check every link now
        </button>
        {/* What it covers, said here rather than inferred from a green tick.
            Amazon serves a missing product as a normal 200 page, so no status
            code can tell us a thing has been delisted — only that the link
            itself still resolves. */}
        <span className="text-xs text-fg-subtle">
          Runs on its own once a night. It catches a broken or expired link,
          not a product Amazon has stopped selling — their page answers the
          same either way until the API opens.
        </span>
      </div>

      {message && (
        <p className="mt-3 text-sm font-medium text-fg" role="status">
          {message}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {picks?.length === 0 && <li className="text-sm text-fg-subtle">Nothing added yet.</li>}
        {(picks || []).map((pick) => {
          const priceAge = daysSince(pick.price_checked_at);
          const dead = pick.link_status === "dead";
          return (
            <li key={pick.id} className="rounded-2xl border border-border px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{pick.title}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {[pick.market.toUpperCase(), pick.category, pick.asin].filter(Boolean).join(" · ")}
                  </span>
                  {/* A dead link is marked and stops being offered, rather than
                      deleted: the name and note were written by hand, and the
                      product may come back. */}
                  {dead && (
                    <span className="mt-1 block text-xs font-semibold text-danger">
                      This link is dead — it is no longer shown on the site.
                    </span>
                  )}
                  {pick.link_status === "unknown" && (
                    <span className="mt-1 block text-xs text-fg-subtle">
                      Amazon would not answer the last check. Still shown.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(pick.id)}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-55"
                >
                  Remove
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-fg-muted">
                  {pick.price
                    ? `${pick.currency} ${pick.price.toFixed(2)} · entered ${priceAge === 0 ? "today" : `${priceAge}d ago`}`
                    : "No price"}
                </span>
                {priceAge !== null && priceAge >= PRICE_STALE_DAYS && (
                  <span className="font-semibold text-fg">Worth retyping</span>
                )}
                <PriceUpdate busy={busy} onSave={(value) => updatePrice(pick, value)} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PriceUpdate({ busy, onSave }: { busy: boolean; onSave: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="new price"
        aria-label="New price"
        className="h-8 w-24 rounded-full border border-border bg-surface-2 px-3 text-xs text-fg outline-none focus:border-border-strong"
      />
      <button
        type="button"
        disabled={busy || !value}
        onClick={() => {
          onSave(value);
          setValue("");
        }}
        className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
      >
        Update
      </button>
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</span>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
      />
    </label>
  );
}
