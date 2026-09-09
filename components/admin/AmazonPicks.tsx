"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * Adding an Amazon product by hand.
 *
 * By hand is not a shortcut here, it is the only lawful route: Amazon's
 * agreement allows their price, availability and images to be shown only when
 * they come from the Product Advertising API, and that opens after three
 * qualifying sales. Nothing in this panel — or on the server behind it —
 * fetches anything from Amazon. The title is typed, and the link is the one
 * SiteStripe produced.
 *
 * The link is stored exactly as pasted. It carries the associate tag, and a
 * link that has lost it looks identical and earns nothing, which is the same
 * failure the store links had for months.
 */

type Pick = { id: number; market: string; title: string; category: string; url: string; asin: string };

export function AmazonPicks({ adminKey }: { adminKey: string }) {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
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
        body: JSON.stringify({ title, url, category }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not go through.");
      setMessage(body.asin ? `Added. Amazon calls it ${body.asin}.` : "Added.");
      setTitle("");
      setUrl("");
      setCategory("");
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
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

  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to manage these.</p>;

  return (
    <div className="mt-5">
      <form onSubmit={add}>
        <fieldset disabled={busy} className="border-0 p-0 disabled:opacity-55">
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <label className="block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Name — you write it, nothing is fetched
              </span>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Anker 20W USB-C charger"
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
            <label className="block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Category (optional)
              </span>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Electronics"
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          </div>
          <label className="block py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              SiteStripe link
            </span>
            <input
              required
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://amzn.to/..."
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
            />
          </label>
          <button
            type="submit"
            className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full bg-surface-inverse px-6 text-sm font-semibold text-fg-on-inverse transition-opacity hover:opacity-88"
          >
            Add
          </button>
        </fieldset>
      </form>

      {message && (
        <p className="mt-3 text-sm font-medium text-fg" role="status">
          {message}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {picks?.length === 0 && <li className="text-sm text-fg-subtle">Nothing added yet.</li>}
        {(picks || []).map((pick) => (
          <li key={pick.id} className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{pick.title}</span>
              <span className="block truncate text-xs text-fg-subtle">
                {[pick.market.toUpperCase(), pick.category, pick.asin].filter(Boolean).join(" · ")}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(pick.id)}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-55"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
