"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shop icons, and setting one by hand.
 *
 * Most shops hand over their favicon when asked. A few refuse an automated
 * request outright, and rather than dress the fetcher up as a browser to get
 * past that, somebody points us at the image once. A pinned icon is never
 * replaced by a later fetch, because the reason it was pinned is that fetching
 * does not work for that shop.
 *
 * The list is also the diagnosis: a row showing no bytes is a shop we asked
 * about and got nothing from, which is exactly the row worth pinning.
 */

type ShopIcon = {
  host: string;
  content_type: string;
  size: number;
  pinned: boolean;
  checked_at: string;
};

export function ShopIcons({ adminKey }: { adminKey: string }) {
  const [icons, setIcons] = useState<ShopIcon[] | null>(null);
  const [host, setHost] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!adminKey) return;
    const response = await fetch("/api/admin/retailer-icons", {
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({}));
    setIcons(body.icons || []);
  }, [adminKey]);

  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const pin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/retailer-icons", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
      body: JSON.stringify({ host, icon_url: iconUrl }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    if (response?.ok) {
      setMessage(`Set for ${result.host}.`);
      setHost("");
      setIconUrl("");
    } else {
      setMessage(result?.error || "That did not go through.");
    }
    load();
  };

  const forget = async (target: string) => {
    setBusy(true);
    await fetch(`/api/admin/retailer-icons/${encodeURIComponent(target)}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    setBusy(false);
    /* Forgetting rather than blanking: the next shopper who sees that shop
       causes a fresh attempt instead of inheriting the old answer. */
    setMessage(`Forgot ${target}. It will be looked up again next time.`);
    load();
  };

  return (
    <>
      <form onSubmit={pin} className="mt-5">
        <fieldset disabled={!adminKey || busy} className="border-0 p-0 disabled:opacity-55">
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <label className="block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Shop address
              </span>
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="kroger.com"
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
            <label className="block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Link to the logo
              </span>
              <input
                type="url"
                value={iconUrl}
                onChange={(event) => setIconUrl(event.target.value)}
                placeholder="https://.../logo.png"
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full border border-border px-6 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
          >
            Set icon
          </button>
        </fieldset>
      </form>

      {message && (
        <p className="mt-3 text-sm font-medium text-fg" role="status">
          {message}
        </p>
      )}

      <div className="mt-6 space-y-1.5">
        {icons === null && <p className="text-sm text-fg-subtle">Enter the admin key to load icons.</p>}
        {icons?.length === 0 && (
          <p className="text-sm text-fg-subtle">No shop has been looked up yet.</p>
        )}
        {(icons || []).map((icon) => (
          <div
            key={icon.host}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border px-3 py-2"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
              {icon.size > 0 && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/retailer-icon?host=${encodeURIComponent(icon.host)}`}
                  alt=""
                  width={20}
                  height={20}
                  className="h-full w-full object-contain"
                />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{icon.host}</span>
            <span className="text-xs text-fg-subtle tnum">
              {icon.size > 0 ? `${Math.round(icon.size / 102.4) / 10}KB` : "no icon"}
              {icon.pinned ? " · set by hand" : ""}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => forget(icon.host)}
              className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-55"
            >
              Forget
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
