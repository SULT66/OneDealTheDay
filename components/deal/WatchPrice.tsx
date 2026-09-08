"use client";

import { useState } from "react";
import { BellRinging } from "@phosphor-icons/react";

/*
 * The one thing to offer somebody who is interested and not ready today.
 *
 * Every page on this site had exactly one outcome for a visitor who was not
 * going to buy: leave, and never be heard from again. Search traffic lands on
 * product pages, not on the homepage, and the homepage was the only place with
 * anywhere to put an email — so the pages that actually receive people had no
 * way to keep them.
 *
 * No account, on purpose. Asking somebody to register before they can be told
 * about a price is asking for the thing they came here to avoid, and the
 * address alone is enough to keep the only promise being made.
 */
export function WatchPrice({ dealId, price }: { dealId: string; price: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/price-watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, product_id: Number(dealId) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "That did not go through.");
      setState("done");
      setMessage(body.message || "We will email you if the price drops.");
    } catch (error) {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    }
  }

  if (state === "done") {
    return (
      <p className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <BellRinging size={17} weight="bold" aria-hidden="true" />
        Tell me if this gets cheaper
      </p>
      {/* The comparison is named, because "cheaper" with nothing to compare
          against is an advertisement and this is meant to be information. */}
      <p className="mt-1 text-xs text-fg-muted">
        We will watch it against today&rsquo;s {price} and email you once, if it drops.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="watch-price-email" className="sr-only">
          Email address
        </label>
        <input
          id="watch-price-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-sm text-fg outline-none focus:border-border-strong"
        />
        <button
          type="submit"
          disabled={state === "sending" || !email}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-surface-inverse px-5 text-sm font-semibold text-fg-on-inverse transition-opacity hover:opacity-88 disabled:opacity-55"
        >
          {state === "sending" ? "Saving…" : "Watch it"}
        </button>
      </div>
      {state === "failed" && <p className="mt-2 text-xs text-danger">{message}</p>}
      <p className="mt-2 text-xs text-fg-subtle">
        One email about this product. Nothing else, and no account needed.
      </p>
    </form>
  );
}
