"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useCopy, useLanguage } from "@/components/site/CopyProvider";

/*
 * Get told before every Live Drop.
 *
 * This replaces a form that promised "your Daily Drop, in the categories you
 * care about". No such email exists: the list it filled receives a welcome and
 * an announcement of each Live Drop, and nothing else, and the categories it
 * asked for were stored and never used. A form that promises one thing and
 * sends another is how a list learns to mark mail as spam, so it now promises
 * exactly what is sent.
 *
 * The same list and the same endpoint as before, so nobody already on it is
 * affected. When a drop is on the calendar the form names it, because "the
 * next drop is Thursday at 8 PM" is a much better reason to leave an address
 * than "drops happen".
 */

type NextDrop = { title: string; state: string; start_at: string } | null;

export function LiveDropSignup({
  market,
  variant = "band",
  source = "homepage",
}: {
  market: string;
  /* band: the large dark block on the homepage and listings.
     inline: a quiet block on the Live page when there is nothing to watch. */
  variant?: "band" | "inline";
  source?: string;
}) {
  const tr = useCopy();
  const language = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [next, setNext] = useState<NextDrop>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/live/current?market=${encodeURIComponent(market)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.drop && ["upcoming", "waiting", "live"].includes(body.drop.state)) setNext(body.drop);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [market]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, categories: [], market, source }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || tr("app.signup.wentWrong"));
        return;
      }
      setStatus("done");
      setMessage(tr("app.signup.onList"));
    } catch {
      setStatus("error");
      setMessage(tr("app.signup.wentWrong"));
    }
  }

  const when = next
    ? next.state === "live"
      ? tr("app.signup.onNow")
      : new Date(next.start_at).toLocaleString(`${language}-${market.toUpperCase()}`, {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        })
    : "";

  const dark = variant === "band";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "rounded-card",
        dark ? "bg-surface-inverse p-6 text-fg-on-inverse sm:p-10" : "border border-border bg-surface p-5 text-fg sm:p-6",
      )}
    >
      <p className={cn("text-[0.7rem] font-semibold uppercase tracking-[0.18em]", dark ? "opacity-60" : "text-fg-subtle")}>
        {tr("app.signup.eyebrow")}
      </p>
      <h2 className={cn("mt-2 max-w-xl font-bold tracking-tight", dark ? "text-2xl sm:text-3xl" : "text-xl")}>
        {tr("app.signup.title")}
      </h2>
      <p className={cn("mt-3 max-w-xl text-sm", dark ? "opacity-70" : "text-fg-muted")}>
        {tr("app.signup.lede")}
      </p>

      {next && (
        <p className={cn("mt-4 text-sm", dark ? "" : "text-fg")}>
          <span className="font-semibold">{tr("app.signup.nextDrop")}</span> {next.title} ·{" "}
          <Link href={`/${market}/live`} className="font-semibold underline underline-offset-4">
            {when}
          </Link>
        </p>
      )}

      {status === "done" ? (
        <p className={cn("mt-6 text-sm font-semibold", dark ? "" : "text-fg")} role="status">
          {message}
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:max-w-lg sm:flex-row">
            <div className="flex-1">
              <label htmlFor={`live-signup-${variant}`} className="sr-only">
                {tr("app.signup.email")}
              </label>
              <input
                id={`live-signup-${variant}`}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={tr("app.signup.email")}
                className={cn(
                  "h-14 w-full rounded-full border bg-transparent px-5 text-base outline-none transition-colors",
                  dark
                    ? "border-white/25 placeholder:text-current/50 focus:border-white/70"
                    : "border-border placeholder:text-fg-subtle focus:border-border-strong",
                )}
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 active:scale-[0.98] disabled:opacity-60"
            >
              {status === "sending" ? tr("app.signup.sending") : tr("app.signup.submit")}
            </button>
          </div>
          <p className={cn("mt-3 text-xs", dark ? "opacity-60" : "text-fg-subtle")} role="status">
            {message ?? tr("app.signup.fineprint")}
          </p>
        </>
      )}
    </form>
  );
}
