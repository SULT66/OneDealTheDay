"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "@/components/site/CopyProvider";
import { measure } from "@/lib/measure";

/*
 * Join the Sunday list.
 *
 * The digest has always been a separate opt-in from the Live Drop alerts, and
 * until now it had no form: the only way in was the tokened link in the
 * day-seven welcome letter, which a visitor could not reach without first
 * joining the other list and waiting a week. So the list stood empty while
 * the site had nothing to offer somebody who wanted one email a week.
 *
 * The same endpoint as LiveDropSignup, with `list: "sunday"`. A drop is rare
 * and unscheduled; the Sunday letter is the thing we can promise will arrive,
 * so this form claims less and keeps the claim.
 */
export function DigestSignup({
  market,
  variant = "panel",
  source = "homepage",
}: {
  market: string;
  /* panel: a bordered block that sits in the page flow.
     band: the large dark treatment, for a page that leads with this. */
  variant?: "panel" | "band";
  source?: string;
}) {
  const tr = useCopy();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, market, source, list: "sunday" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || tr("app.signup.wentWrong"));
        return;
      }
      setStatus("done");
      setMessage(tr("app.sunday.onList"));
      /* After the server accepted it, never on submit, and with no address of
         any kind — the same rule as the Live Drop form. signup_type is what
         tells the two lists apart in the reports. */
      measure("email_signup", { signup_type: "sunday_digest", placement: source || "unknown" });
    } catch {
      setStatus("error");
      setMessage(tr("app.signup.wentWrong"));
    }
  }

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
        {tr("app.sunday.eyebrow")}
      </p>
      <h2 className={cn("mt-2 max-w-xl font-bold tracking-tight", dark ? "text-2xl sm:text-3xl" : "text-xl")}>
        {tr("app.sunday.title")}
      </h2>
      <p className={cn("mt-3 max-w-xl text-sm", dark ? "opacity-70" : "text-fg-muted")}>
        {tr("app.sunday.lede")}
      </p>

      {status === "done" ? (
        <p className={cn("mt-6 text-sm font-semibold", dark ? "" : "text-fg")} role="status">
          {message}
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:max-w-lg sm:flex-row">
            <div className="flex-1">
              <label htmlFor={`sunday-signup-${variant}`} className="sr-only">
                {tr("app.signup.email")}
              </label>
              <input
                id={`sunday-signup-${variant}`}
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
              {status === "sending" ? tr("app.signup.sending") : tr("app.sunday.submit")}
            </button>
          </div>
          <p className={cn("mt-3 text-xs", dark ? "opacity-60" : "text-fg-subtle")} role="status">
            {message ?? tr("app.sunday.fineprint")}
          </p>
        </>
      )}
    </form>
  );
}
