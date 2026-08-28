"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The LIVE tab, with a dot on it when something is actually happening.
 *
 * The dot is the whole point of the tab. A permanent red pulse on a page where
 * nothing is running is the sort of thing that teaches people to ignore it, so
 * this asks the server whether there is a drop and lights up only then.
 *
 * A long poll interval on purpose: this runs on every page of the site, and the
 * drop it is announcing lasts ten minutes. A minute of delay in lighting the
 * dot costs nothing; a request every five seconds from every open tab does.
 */
export function LiveNavLink({ market, label }: { market: string; label: string }) {
  const [state, setState] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const response = await fetch(`/api/live/current?market=${encodeURIComponent(market)}`).catch(
        () => null,
      );
      if (cancelled || !response || !response.ok) return;
      const body = (await response.json().catch(() => ({}))) as {
        drop?: { state?: string } | null;
      };
      if (!cancelled) setState(body.drop?.state || "");
    };
    check();
    const timer = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  const happening = state === "live" || state === "waiting";

  return (
    <Link
      href={`/${market}/live`}
      className={
        happening
          ? "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-danger transition-colors hover:bg-surface-2"
          : "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      }
    >
      {happening && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
      )}
      {label}
    </Link>
  );
}
