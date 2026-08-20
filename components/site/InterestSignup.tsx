"use client";

import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Interest picker plus email, submitted to the backend's real subscribe
 * endpoint (via the same-origin /api/subscribe proxy, since the backend has
 * no CORS headers for a direct browser call).
 */
export function InterestSignup({
  categories,
  market,
}: {
  categories: Category[];
  market: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function toggle(slug: string) {
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, categories: picked, market }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
        return;
      }
      setStatus("done");
      setMessage(data.message || "You're subscribed.");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Try again.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-card bg-surface-inverse p-6 text-fg-on-inverse sm:p-10"
    >
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] opacity-60">
        Make it your daily check
      </p>
      <h2 className="mt-2 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
        One useful drop, in the categories you care about.
      </h2>
      <p className="mt-3 max-w-xl text-sm opacity-70">
        Choose your interests and get the best new pick without searching
        through endless sale pages.
      </p>

      <fieldset className="mt-6">
        <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] opacity-60">
          What do you shop for?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = picked.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => toggle(c.slug)}
                aria-pressed={on}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                  on
                    ? "bg-lime text-ink"
                    : "border border-white/25 text-fg-on-inverse hover:border-white/60",
                )}
              >
                {/* The checkmark carries the state as well as the colour. */}
                {on && <Check size={14} weight="bold" aria-hidden="true" />}
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col gap-3 sm:max-w-lg sm:flex-row">
        <div className="flex-1">
          <label htmlFor="drop-email" className="sr-only">
            Email address
          </label>
          <input
            id="drop-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="h-14 w-full rounded-full border border-white/25 bg-transparent px-5 text-base outline-none transition-colors placeholder:text-current/50 focus:border-white/70"
          />
        </div>
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-14 cursor-pointer items-center justify-center rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 disabled:opacity-60 active:scale-[0.98]"
        >
          {status === "sending" ? "Sending…" : "Get my Daily Drop"}
        </button>
      </div>

      <p className="mt-3 text-xs opacity-60" role="status">
        {message ?? "We'll only use this for your Daily Drop email."}
      </p>
    </form>
  );
}
