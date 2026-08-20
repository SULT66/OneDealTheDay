"use client";

import { useEffect, useState } from "react";

/** Next drop lands at midnight UTC — the same cadence the live site uses. */
function msUntilNextDrop(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: String(Math.floor(total / 3600)).padStart(2, "0"),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, "0"),
    s: String(total % 60).padStart(2, "0"),
  };
}

/**
 * Ticking countdown.
 *
 * Renders a stable placeholder on the server and starts counting after mount:
 * the server and the visitor's clock never agree to the second, and rendering
 * a live time on both sides would guarantee a hydration mismatch.
 */
export function NextDropCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextDrop(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const { h, m, s } = parts(remaining ?? 0);
  const ready = remaining !== null;

  return (
    <div>
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-ink/70">
        Next drop in
      </p>
      <p
        className="mt-1 flex items-baseline gap-1 text-4xl font-bold tabular-nums text-ink sm:text-5xl"
        aria-live="off"
      >
        {ready ? (
          <>
            <span className="tnum">{h}</span>
            <span className="text-2xl">h</span>
            <span className="tnum">{m}</span>
            <span className="text-2xl">m</span>
            <span className="tnum">{s}</span>
            <span className="text-2xl">s</span>
          </>
        ) : (
          <span className="tnum opacity-40">--h --m --s</span>
        )}
      </p>
    </div>
  );
}
