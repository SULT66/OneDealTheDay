"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The account page, on the same design as the rest of the site.
 *
 * It was a standalone HTML file served straight by Express, with its own
 * header, its own stylesheet and its own idea of what the brand looks like. A
 * shopper signing in walked out of the site and into something that looked
 * like a different company, which is the last impression you want at the
 * moment somebody is handing over an email address.
 *
 * Every endpoint it talks to is the one the old page used, unchanged. This is
 * a change of clothes, not of behaviour, and the sign-in that was verified
 * working an hour ago keeps working exactly as it did.
 */

type Account = {
  id: number;
  email: string;
  name: string;
  membership: string;
};

type Mode = "register" | "login" | "forgot" | "reset";

/* Kept in step with passwordError() on the server. The server is the authority
   and rejects anything that fails; these are here so the shopper can see what
   is still missing while they type, instead of after they submit. */
const PASSWORD_RULES: [string, (value: string) => boolean][] = [
  ["12+ characters", (value) => value.length >= 12],
  ["Lowercase letter", (value) => /[a-z]/.test(value)],
  ["Uppercase letter", (value) => /[A-Z]/.test(value)],
  ["Number", (value) => /\d/.test(value)],
  ["Symbol", (value) => /[^A-Za-z0-9]/.test(value)],
];

/* Google hands the shopper back here with a reason in the query string. Say
   what to do next; never show which step failed, which means nothing to them
   and tells anyone probing the flow how far they got. */
const GOOGLE_FAILURES: Record<string, string> = {
  google_unavailable: "Google sign-in is not set up yet. Use your email and password for now.",
  google_state: "That sign-in link expired. Tap Continue with Google to try again.",
  google_cancelled: "Google sign-in was cancelled. Nothing has changed.",
  google_identity: "Google did not confirm that email address, so we could not sign you in.",
  google: "Google sign-in did not go through. Please try again.",
};

const TITLES: Record<Mode, string> = {
  register: "Create your free account",
  login: "Welcome back",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

export function AccountPanel({ market }: { market: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [checked, setChecked] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Free forever. Club is optional.");
  const [failed, setFailed] = useState(false);

  const say = useCallback((text: string, isFailure = false) => {
    setMessage(text);
    setFailed(isFailure);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (token) {
      setResetToken(token);
      setMode("reset");
    } else if (params.get("mode") === "login") {
      setMode("login");
    }
    const failure = GOOGLE_FAILURES[params.get("error") || ""];
    if (failure) say(failure, true);

    fetch("/api/me")
      .then((response) => response.json())
      .then((body) => setAccount(body?.user || null))
      .catch(() => {})
      .finally(() => setChecked(true));

    /* The Google button stays hidden until the server confirms a client is
       configured, so it can never be shipped ahead of its keys and fail after
       somebody has already handed over their Google account. */
    fetch("/api/auth/providers")
      .then((response) => response.json())
      .then((providers) => setGoogleReady(Boolean(providers?.google)))
      .catch(() => {});
  }, [say]);

  const switchTo = (next: Mode) => {
    setMode(next);
    setPassword("");
    setAccepted(false);
    say(next === "forgot" ? "We will email you a link to set a new password." : "Free forever. Club is optional.");
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    say(mode === "forgot" ? "Sending..." : "Working...");

    const endpoint =
      mode === "forgot"
        ? "/api/auth/forgot-password"
        : mode === "reset"
          ? "/api/auth/reset-password"
          : mode === "login"
            ? "/api/auth/login"
            : "/api/auth/register";
    const payload =
      mode === "forgot"
        ? { email }
        : mode === "reset"
          ? { token: resetToken, password }
          : mode === "login"
            ? { email, password }
            : { name, email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Something went wrong. Please try again.");

      if (mode === "forgot") {
        say(body?.message || "If that address has an account, a reset link is on its way.");
      } else if (mode === "reset") {
        say("Password changed. You can sign in now.");
        switchTo("login");
      } else {
        setAccount(body?.user || null);
        say("");
      }
    } catch (error) {
      say(error instanceof Error ? error.message : "Something went wrong.", true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAccount(null);
    switchTo("login");
  }

  /* Nothing is rendered until /api/me answers. Showing the sign-in form to
     somebody who is already signed in, for the half second it takes to find
     out, reads as having been logged out. */
  if (!checked) {
    return (
      <section className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4">
        <p className="text-sm text-fg-subtle">Checking your account...</p>
      </section>
    );
  }

  if (account) {
    return (
      <section className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
        <div className="rounded-3xl border border-border bg-surface p-8 text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-lime text-2xl font-black text-ink">
            {(account.name || account.email).charAt(0).toUpperCase()}
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            You are signed in
          </p>
          <h1 className="mt-2 text-2xl font-bold text-fg">{account.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">{account.email}</p>

          <div className="mt-6 rounded-2xl bg-surface-2 p-5 text-left">
            <p className="text-sm font-bold text-fg">
              {account.membership === "club" ? "Club member" : "Free account"}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {account.membership === "club"
                ? "Club benefits are active on this account."
                : "You are on the free plan. Everything on the site is included."}
            </p>
          </div>

          <div className="mt-6 grid gap-2.5">
            <Link
              href={`/${market}`}
              className="flex h-12 items-center justify-center rounded-full bg-lime text-sm font-semibold text-ink transition-opacity hover:opacity-88"
            >
              Back to today&rsquo;s drop
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="h-12 rounded-full border border-border text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              Log out
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isRegister = mode === "register";
  const isReset = mode === "reset";
  const isForgot = mode === "forgot";
  const showTabs = !isReset && !isForgot;
  const showPassword = !isForgot;

  return (
    <section className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="rounded-3xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-bold text-fg">{TITLES[mode]}</h1>

        {showTabs && (
          <div className="mt-5 flex gap-2">
            {(["register", "login"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchTo(tab)}
                className={cn(
                  "flex-1 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                  mode === tab
                    ? "border-transparent bg-surface-inverse text-fg-on-inverse"
                    : "border-border text-fg hover:bg-surface-2",
                )}
              >
                {tab === "register" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>
        )}

        {showTabs && googleReady && (
          <>
            <a
              href="/api/auth/google"
              className="mt-4 flex h-12 items-center justify-center gap-2.5 rounded-full border border-border text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              Continue with Google
            </a>
            <p className="my-5 flex items-center gap-3 text-xs font-semibold text-fg-subtle">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </p>
          </>
        )}

        <form onSubmit={submit} className={cn("grid gap-4", showTabs && !googleReady && "mt-5")}>
          {isRegister && (
            <label className="block text-xs font-bold text-fg">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                className="mt-2 h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          )}

          {!isReset && (
            <label className="block text-xs font-bold text-fg">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="mt-2 h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          )}

          {showPassword && (
            <label className="block text-xs font-bold text-fg">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={12}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>
          )}

          {(isRegister || isReset) && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-subtle">
              {PASSWORD_RULES.map(([label, met]) => (
                <li key={label} className={cn(met(password) && "font-semibold text-lime-deep")}>
                  {met(password) ? "✓" : "○"} {label}
                </li>
              ))}
            </ul>
          )}

          {isRegister && (
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-muted">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                required
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                I agree to the{" "}
                <Link href={`/${market}/terms`} className="text-fg underline underline-offset-4">Terms</Link>{" "}
                and{" "}
                <Link href={`/${market}/privacy`} className="text-fg underline underline-offset-4">Privacy Policy</Link>.
              </span>
            </label>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => switchTo("forgot")}
              className="justify-self-end text-xs font-semibold text-fg-muted underline underline-offset-4"
            >
              Forgot password?
            </button>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-full bg-lime text-sm font-semibold text-ink transition-opacity hover:opacity-88 disabled:opacity-60"
          >
            {isForgot
              ? "Email me a reset link"
              : isReset
                ? "Save new password"
                : isRegister
                  ? "Create free account"
                  : "Sign in"}
          </button>

          {(isForgot || isReset) && (
            <button
              type="button"
              onClick={() => switchTo("login")}
              className="text-xs font-semibold text-fg-muted underline underline-offset-4"
            >
              Back to sign in
            </button>
          )}

          {message && (
            <p className={cn("text-center text-sm leading-relaxed", failed ? "text-danger" : "text-fg-subtle")}>
              {message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
