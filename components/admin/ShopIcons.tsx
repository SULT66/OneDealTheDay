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

/* FileReader hands back a data URL; the part after the comma is the base64
   the server wants. Reading it in the browser keeps the upload as ordinary
   JSON rather than adding multipart handling to the server for one field. */
const asBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });

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
  const [file, setFile] = useState<File | null>(null);
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
      body: JSON.stringify(
        /* An uploaded file wins over a pasted link. Most logo pages will not
           give you a link to the image at all, and the file is already on the
           machine by the time somebody has looked. */
        file ? { host, icon_data: await asBase64(file) } : { host, icon_url: iconUrl },
      ),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    if (response?.ok) {
      setMessage(`Set for ${result.host}.`);
      setHost("");
      setIconUrl("");
      setFile(null);
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
                Logo file
              </span>
              <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-fg-subtle">
                Download the logo, then pick it here. PNG, SVG or ICO, under 64KB.
              </span>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp,image/gif,.ico"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-1.5 w-full text-sm text-fg-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg"
              />
            </label>

            <label className="block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Link to the logo
              </span>
              {/* The usual mistake is pasting the address bar of a search
                  results page, so the field says what is wanted before the
                  server has to explain what went wrong. */}
              <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-fg-subtle">
                Or paste a direct link to the image file. A link to a page showing
                the logo will not work.
              </span>
              <input
                type="url"
                value={iconUrl}
                onChange={(event) => setIconUrl(event.target.value)}
                placeholder="https://.../logo.png"
                title="A link straight to the image file, not to a page showing it"
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full border border-border px-6 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
          >
            {file ? "Upload icon" : "Set icon"}
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
