"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { CouponStatus } from "./CouponStatus";
import { ShopIcons } from "./ShopIcons";
import { Numbers } from "./Numbers";
import { SearchDemand } from "./SearchDemand";
import { Weekly } from "./Weekly";
import { ODDTVConsole } from "./ODDTVConsole";
import { MerchandisingPanel } from "./MerchandisingPanel";
import { MerchantHealth } from "./MerchantHealth";

/**
 * The admin console for ODD Live TV, reporting, email, and the catalogue.
 *
 * The key is held in React state and nothing else. Not localStorage, not a
 * cookie: it is the one credential that can publish to the live site, and a
 * value kept in storage outlives the person who typed it.
 *
 * Everything renders as text through React, so a product title someone typed
 * is a product title and never markup.
 */

type EmailStep = { step: string; done: boolean | null; detail: string };

export function AdminConsole() {
  const [adminKey, setAdminKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshOutput, setRefreshOutput] = useState("");
  const [emailSteps, setEmailSteps] = useState<EmailStep[] | null>(null);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    if (!adminKey) { setUnlocked(false); return; }
    const response = await fetch("/api/admin/access", {
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setUnlocked(false);
      /* Three different problems used to share one sentence, and "not
         accepted" sends somebody to retype a key that may be perfectly right
         while the server is restarting or has no key set at all. */
      setMessage(
        !response
          ? "Could not reach the server. It may be restarting after a deploy; try again in a minute."
          : response.status === 401
            ? "That key does not match ADMIN_KEY on the server."
            : response.status === 503
              ? "ADMIN_KEY is not set on the server (Azure → Environment variables)."
              : body?.error || `The server answered ${response.status}. Try again in a minute.`,
      );
      return;
    }
    setUnlocked(true);
    setMessage("");
  }, [adminKey]);

  /* Loading is what proves the key, so it happens on entry rather than behind
     a button somebody would have to know to press. */
  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const checkEmail = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/email-health", { headers: { "x-admin-key": adminKey } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not go through.");
      setEmailSteps(body.steps);
      setMessage(body.ready ? "Email is ready to send." : "Email is not ready yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const sendTestEmail = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ to: testTo }),
      });
      const body = await response.json();
      /* The provider's own words, not a shrug: "sender identity not verified"
         and "domain authentication incomplete" need different fixes. */
      setMessage(response.ok ? body.message : [body.error, body.provider].filter(Boolean).join(" - "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const runRefresh = async () => {
    setRefreshOutput("Searching...");
    const response = await fetch("/api/admin/refresh", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setRefreshOutput(JSON.stringify(result, null, 2));
  };

  /*
   * One job per tab.
   *
   * Everything used to be one long page — numbers, email, the drop form, the
   * schedule, shop icons, the refresh — and finding the drop
   * you were about to run meant scrolling past four things that had nothing
   * to do with it. Every tab stays mounted and is only hidden, so a half-typed
   * drop or icon URL survives a look at the numbers.
   */
  const [tab, setTab] = useState<TabId>("numbers");
  /* The tab is in the address, so a reload or a bookmark lands where you were.
     Only the tab name: the key never goes anywhere near the URL. */
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash === "drops") {
      setTab("tv");
      window.history.replaceState(null, "", "#tv");
    }
    else if (TABS.some((item) => item.id === fromHash)) setTab(fromHash as TabId);
  }, []);
  const choose = (id: TabId) => {
    setTab(id);
    setMessage("");
    window.history.replaceState(null, "", `#${id}`);
  };
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">Admin</h1>
        {/* The key, kept small and at the top: it is needed once per visit and
            is not a section anybody works in. */}
        <label className="block w-full max-w-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            Admin key {unlocked ? "· unlocked" : ""}
          </span>
          <input
            id="admin-access-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            /* Spaces, line breaks and invisible characters come along when a
               key is copied out of a note or a chat, and any of them makes the
               key fail to match (or makes the browser refuse to send it at
               all). The key itself is plain printable ASCII. */
            onChange={(event) => setAdminKey(event.target.value.replace(/[^\x21-\x7e]/g, ""))}
            placeholder="Paste the key to unlock"
            aria-label="Admin key"
            className="mt-1.5 h-11 w-full rounded-full border border-border bg-surface-2 px-5 text-sm text-fg outline-none transition-colors focus:border-border-strong"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-fg-subtle">ADMIN_KEY from the environment. Kept in this tab only, never stored.</p>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const index = TABS.findIndex((item) => item.id === tab);
          const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
          choose(next.id);
          document.getElementById(`admin-tab-${next.id}`)?.focus();
        }}
      >
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              id={`admin-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`admin-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(item.id)}
              className={cn(
                "-mb-px inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                selected ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* One status line for whatever was just done, in whichever tab. It used
          to live inside the drops section, so the result of an email test was
          printed under a form on a different part of the page. */}
      {message && (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg" role="status">
          {message}
        </p>
      )}
      {!unlocked && (
        <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to load everything.</p>
      )}

      <TabPanel id="numbers" active={tab}>
      <Card className="mt-6">
        <Legend>Your numbers</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Everything the site records, in the order a person moves through it.
          What is not recorded is listed at the bottom rather than left blank.
        </p>
        <Numbers adminKey={adminKey} />
      </Card>
      </TabPanel>

      {/*
        * The console used to say "not configured" and stop there, which named
        * the last of four steps and none of the three before it.
        */}
      <TabPanel id="weekly" active={tab}>
      <Card className="mt-6">
        <Legend>What people searched for</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          The words visitors typed into the search box, and the ones that came
          back with nothing. The second list is a shopping list: somebody
          wanted that here and left without it.
        </p>
        <SearchDemand adminKey={adminKey} />
      </Card>
      <Card className="mt-6">
        <Legend>Week by week</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          The numbers saved at the end of every week, so you can see whether things are growing.
        </p>
        <Weekly adminKey={adminKey} />
      </Card>
      </TabPanel>

      <TabPanel id="merchants" active={tab}>
        <Card className="mt-6">
          <MerchantHealth adminKey={adminKey} />
        </Card>
      </TabPanel>

      <TabPanel id="email" active={tab}>
      <Card className="mt-6">
        <Legend>Email delivery</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Four things in order. The DNS half is checked live, so a record you
          believe you added and a record that resolves are not confused.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!unlocked || busy}
            onClick={checkEmail}
            className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
          >
            Check
          </button>
          <input
            type="email"
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="you@example.com"
            aria-label="Send a test email to"
            disabled={!unlocked || busy}
            className="h-10 w-full max-w-xs rounded-full border border-border bg-surface-2 px-4 text-sm text-fg outline-none transition-colors focus:border-border-strong disabled:opacity-55"
          />
          <button
            type="button"
            disabled={!unlocked || busy || !testTo}
            onClick={sendTestEmail}
            className="inline-flex h-10 cursor-pointer items-center rounded-full bg-surface-inverse px-5 text-sm font-semibold text-fg-on-inverse transition-opacity hover:opacity-88 disabled:opacity-55"
          >
            Send a test
          </button>
        </div>

        {emailSteps ? (
          <ol className="mt-5 space-y-2 text-sm">
            {emailSteps.map((step) => (
              <li key={step.step} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    step.done === true && "bg-lime text-ink",
                    step.done === false && "bg-surface-2 text-fg-subtle",
                    step.done === null && "bg-surface-2 text-fg-subtle",
                  )}
                >
                  {step.done === true ? "✓" : step.done === null ? "?" : ""}
                </span>
                <span>
                  <span className="font-semibold text-fg">{step.step}</span>
                  <span className="block text-xs text-fg-muted">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </Card>
      </TabPanel>

      {/* The schedule first: opening this tab is usually about a drop that
          already exists. A new one is written below it. */}
      <TabPanel id="tv" active={tab}>
        <ODDTVConsole adminKey={adminKey} />
      </TabPanel>

      <TabPanel id="icons" active={tab}>
      <Card className="mt-6">
        <Legend>Shop icons</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Most shops hand over their logo when asked. A few refuse an automated
          request, and dressing our fetcher up as a browser to get around that is
          not worth doing, so point us at the image once instead. An icon set here
          is never replaced by a later lookup. A row reading no icon is a shop that
          gave us nothing, which is the one worth setting.
        </p>
        <ShopIcons adminKey={adminKey} />
      </Card>
      </TabPanel>

      <TabPanel id="coupons" active={tab}>
        <CouponStatus adminKey={adminKey} active={tab === "coupons"} />
      </TabPanel>

      <TabPanel id="catalogue" active={tab}>
      <Card className="mt-6">
        <Legend>Catalogue refresh</Legend>
        <p className="mt-1 text-sm text-fg-muted">Run discovery now and publish the top ten.</p>
        <button
          type="button"
          disabled={!adminKey}
          onClick={runRefresh}
          className="mt-4 inline-flex h-12 cursor-pointer items-center rounded-full border border-border px-6 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
        >
          Find and publish Top 10
        </button>
        {refreshOutput && (
          <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-fg-muted">
            {refreshOutput}
          </pre>
        )}
      </Card>
      </TabPanel>
      <TabPanel id="agents" active={tab}>
        <MerchandisingPanel adminKey={adminKey} active={tab === "agents"} />
      </TabPanel>
    </div>
  );
}

const TABS = [
  { id: "numbers", label: "Numbers" },
  { id: "weekly", label: "Weekly" },
  { id: "merchants", label: "Merchants" },
  { id: "tv", label: "ODD Live TV" },
  { id: "email", label: "Email" },
  { id: "icons", label: "Shop icons" },
  { id: "coupons", label: "Coupons" },
  { id: "catalogue", label: "Catalogue" },
  { id: "agents", label: "Agents" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* Hidden, not unmounted: see the note on the tabs in AdminConsole. */
function TabPanel({ id, active, children }: { id: TabId; active: TabId; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`admin-panel-${id}`} aria-labelledby={`admin-tab-${id}`} hidden={id !== active}>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card border border-border bg-surface p-6 sm:p-8", className)}>
      {children}
    </section>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-fg">{children}</h2>;
}
