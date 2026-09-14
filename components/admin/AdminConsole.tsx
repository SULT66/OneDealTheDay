"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ShopIcons } from "./ShopIcons";
import { Numbers } from "./Numbers";
import { AmazonPicks } from "./AmazonPicks";
import { MediaUpload } from "./MediaUpload";

/**
 * The admin console: scheduling a Live Drop, and the catalogue refresh.
 *
 * The key is held in React state and nothing else. Not localStorage, not a
 * cookie: it is the one credential that can publish to the live site, and a
 * value kept in storage outlives the person who typed it.
 *
 * Everything renders as text through React, so a product title someone typed
 * is a product title and never markup.
 */

type AdminDrop = {
  drop_key: string;
  market: string;
  title: string;
  brand: string;
  retailer_name: string;
  currency: string;
  retail_price: number | null;
  drop_price: number | null;
  quantity_total: number;
  quantity_remaining: number;
  state: "upcoming" | "waiting" | "live" | "sold_out" | "ended";
  start_at: string;
  published: boolean;
  reminders: number;
  /* Optional: absent from a server deployed before they were sent. */
  reminder_emails_sent?: number;
  ever_published?: boolean;
  funnel: Record<string, number>;
  reached: number;
  announced: number;
  watching_now: number;
  stock_is_live: boolean;
  stock_verified_at: string | null;
  stock_checked_at: string | null;
  image_url: string;
  secondary_image_url?: string;
  video_url: string;
  stream_embed_url: string;
  click_label: string;
};

const BLANK = {
  title: "",
  brand: "",
  retailer_name: "",
  market: "us",
  retail_price: "",
  drop_price: "",
  currency: "USD",
  quantity_total: "20",
  start_at: "",
  duration_minutes: "10",
  member_early_access_seconds: "0",
  image_url: "",
  secondary_image_url: "",
  affiliate_url: "",
  video_url: "",
  stream_embed_url: "",
  terms: "",
};

type EmailStep = { step: string; done: boolean | null; detail: string };

type FormState = typeof BLANK;

/* A datetime-local field speaks local wall clock and the server speaks ISO
   with an offset. The same drop is watched from five markets, so 20:00 on its
   own means five different moments. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
const readable = (iso: string) => new Date(iso).toLocaleString();

export function AdminConsole() {
  const [adminKey, setAdminKey] = useState("");
  const [drops, setDrops] = useState<AdminDrop[] | null>(null);
  const [markets, setMarkets] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(BLANK);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshOutput, setRefreshOutput] = useState("");
  const [emailSteps, setEmailSteps] = useState<EmailStep[] | null>(null);
  const [testTo, setTestTo] = useState("");

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "X-Admin-Key": adminKey }),
    [adminKey],
  );

  const load = useCallback(async () => {
    if (!adminKey) return;
    const response = await fetch("/api/admin/live-drops", {
      headers: { "X-Admin-Key": adminKey },
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setDrops(null);
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
    setMarkets(body.markets || ["us"]);
    setDrops(body.drops || []);
    setMessage("");
    setForm((current) =>
      current.market && (body.markets || []).includes(current.market)
        ? current
        : { ...current, market: (body.markets || ["us"])[0] },
    );
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
      setMessage(response.ok ? body.message : [body.error, body.provider].filter(Boolean).join(" — "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    const response = await fetch(url, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    const failure = response?.ok ? "" : result?.error || "That did not go through.";
    setMessage(failure || "Done.");
    load();
    /* Returned so the row that was clicked can say what happened next to the
       button. A refusal printed at the top of a long console reads as a button
       that does nothing — which is exactly how the delete guard was reported. */
    return failure;
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/live-drops", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...form, start_at: toIso(form.start_at) }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    if (response?.ok) {
      setMessage(`Drafted ${result.drop_key}. Nobody can see it until you publish it.`);
      setForm({ ...BLANK, market: form.market });
    } else {
      setMessage(result?.error || "That did not go through.");
    }
    load();
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

  const unlocked = drops !== null;

  /*
   * One job per tab.
   *
   * Everything used to be one long page — numbers, email, the drop form, the
   * schedule, Amazon picks, shop icons, the refresh — and finding the drop
   * you were about to run meant scrolling past four things that had nothing
   * to do with it. Every tab stays mounted and is only hidden, so a half-typed
   * drop or icon URL survives a look at the numbers.
   */
  const [tab, setTab] = useState<TabId>("numbers");
  /* The tab is in the address, so a reload or a bookmark lands where you were.
     Only the tab name: the key never goes anywhere near the URL. */
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (TABS.some((item) => item.id === fromHash)) setTab(fromHash as TabId);
  }, []);
  const choose = (id: TabId) => {
    setTab(id);
    setMessage("");
    window.history.replaceState(null, "", `#${id}`);
  };
  const upcoming = (drops || []).filter((drop) => drop.published && ["upcoming", "waiting", "live"].includes(drop.state)).length;
  const liveNow = (drops || []).some((drop) => drop.published && drop.state === "live");

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
              {item.id === "drops" && liveNow && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-label="live now" />
              )}
              {item.id === "drops" && !liveNow && upcoming > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 text-[0.65rem] font-bold text-fg-muted tnum">{upcoming}</span>
              )}
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
      <TabPanel id="drops" active={tab}>
      <Card className="mt-6">
        <Legend>Schedule</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Every drop, drafts included. Publishing is a separate, deliberate step, because
          writing a drop and announcing it are different decisions and this site is live.
        </p>
        <div className="mt-6 space-y-3">
          {!unlocked && (
            <p className="text-sm text-fg-subtle">Enter the admin key to load the schedule.</p>
          )}
          {unlocked && !drops.length && <p className="text-sm text-fg-subtle">Nothing scheduled yet.</p>}
          {(drops || []).map((drop) => (
            <DropRow key={drop.drop_key} drop={drop} busy={busy} act={act} adminKey={adminKey} />
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <Legend>New drop</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Saved as a draft that nobody can see until you publish it. Times are in the
          timezone of this computer.
        </p>

        <form onSubmit={create} className="mt-6">
          <fieldset disabled={!unlocked || busy} className="border-0 p-0 disabled:opacity-55">
            {/* In the order the drop is thought through: what it is, what it
                costs, when it runs, what people see. Fifteen fields in one grid
                had no order at all. */}
            <FormGroup title="Product">
              <Field label="Product title" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
              <Field label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
              <Field label="Retailer" value={form.retailer_name} onChange={(v) => setForm({ ...form, retailer_name: v })} />
              <Field label="Buy link" type="url" value={form.affiliate_url} onChange={(v) => setForm({ ...form, affiliate_url: v })} />
            </FormGroup>

            <FormGroup title="Price and stock">
              <label className="block py-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Market</span>
                <select
                  value={form.market}
                  onChange={(event) => setForm({ ...form, market: event.target.value })}
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-border-strong"
                >
                  {(markets.length ? markets : [form.market]).map((market) => (
                    <option key={market} value={market}>
                      {market.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
              <Field label="Normal price" type="number" step="0.01" value={form.retail_price} onChange={(v) => setForm({ ...form, retail_price: v })} />
              <Field label="Drop price" type="number" step="0.01" value={form.drop_price} onChange={(v) => setForm({ ...form, drop_price: v })} />
              <Field label="Units" type="number" required value={form.quantity_total} onChange={(v) => setForm({ ...form, quantity_total: v })} />
            </FormGroup>

            <FormGroup title="When">
              <Field label="Starts" type="datetime-local" required value={form.start_at} onChange={(v) => setForm({ ...form, start_at: v })} />
              <Field label="Minutes open" type="number" required value={form.duration_minutes} onChange={(v) => setForm({ ...form, duration_minutes: v })} />
              <Field label="Member head start (seconds)" type="number" value={form.member_early_access_seconds} onChange={(v) => setForm({ ...form, member_early_access_seconds: v })} />
            </FormGroup>

            {/* Files, not links. Two panels, named for what each shows: a
                presenter cannot hold up a monitor, so one panel is whoever is
                talking and the other is where the product is actually seen. */}
            <FormGroup title="What people see" columns={2}>
              <MediaUpload adminKey={adminKey} kind="image" label="Product photo" hint="The product on its own, clean background." value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} disabled={!unlocked || busy} />
              <MediaUpload adminKey={adminKey} kind="image" label="Product in use — photo" hint="Somebody using it. Optional." value={form.secondary_image_url} onChange={(v) => setForm({ ...form, secondary_image_url: v })} disabled={!unlocked || busy} />
              <MediaUpload adminKey={adminKey} kind="video" label="Presenter video" hint="Chloe's recording. Plays on the left." value={form.stream_embed_url} onChange={(v) => setForm({ ...form, stream_embed_url: v })} allowLink disabled={!unlocked || busy} />
              <MediaUpload adminKey={adminKey} kind="video" label="Product footage" hint="The product up close. Plays beside the presenter." value={form.video_url} onChange={(v) => setForm({ ...form, video_url: v })} disabled={!unlocked || busy} />
            </FormGroup>

            <label className="mt-2 block py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">Terms</span>
              <textarea
                rows={2}
                value={form.terms}
                onChange={(event) => setForm({ ...form, terms: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none focus:border-border-strong"
              />
            </label>

            <button
              type="submit"
              className="mt-4 inline-flex h-12 cursor-pointer items-center rounded-full bg-lime px-7 text-sm font-bold text-ink transition-opacity hover:opacity-88 disabled:opacity-60"
            >
              Create draft
            </button>
          </fieldset>
        </form>
      </Card>
      </TabPanel>

      <TabPanel id="amazon" active={tab}>
      <Card className="mt-6">
        <Legend>Amazon picks</Legend>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted">
          Chosen by you, linked by you. Nothing here asks Amazon for anything:
          their agreement only allows their price, availability and images to be
          shown when they come from the Product Advertising API, and that opens
          after three qualifying sales. Until then these appear on the homepage
          as a name and a link, below the catalogue and never mixed into it.
        </p>
        <AmazonPicks adminKey={adminKey} />
      </Card>
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
    </div>
  );
}

const TABS = [
  { id: "numbers", label: "Numbers" },
  { id: "drops", label: "Live Drops" },
  { id: "email", label: "Email" },
  { id: "amazon", label: "Amazon picks" },
  { id: "icons", label: "Shop icons" },
  { id: "catalogue", label: "Catalogue" },
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

function FormGroup({
  title,
  children,
  columns = 3,
}: {
  title: string;
  children: React.ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div className="mt-2 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <p className="text-sm font-bold text-fg">{title}</p>
      <div className={cn("mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2", columns === 3 && "lg:grid-cols-4")}>{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</span>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none transition-colors focus:border-border-strong"
      />
    </label>
  );
}

function DropRow({
  drop,
  busy,
  act,
  adminKey,
}: {
  drop: AdminDrop;
  adminKey: string;
  busy: boolean;
  act: (url: string, body: unknown, method?: string) => Promise<string>;
}) {
  const [stock, setStock] = useState(String(drop.quantity_remaining));
  const [rowMessage, setRowMessage] = useState("");
  /* Editing what a published drop shows. Deleting one that was ever public is
     refused — rightly — so without this a wrong picture or a missing video was
     permanent. */
  const [media, setMedia] = useState({
    image_url: drop.image_url || "",
    secondary_image_url: drop.secondary_image_url || "",
    video_url: drop.video_url || "",
    stream_embed_url: drop.stream_embed_url || "",
  });
  /* A published drop shows where it is in its own life. An unpublished one is
     a draft whatever the clock says, because nobody can see it. */
  /* A drop that was public once and has been taken down is not a draft: it
     ran, people were told, and it can no longer be deleted. Calling it a draft
     offered a Delete button that the server then refused. */
  const everPublished = drop.published || Boolean(drop.ever_published);
  const state = drop.published ? drop.state : everPublished ? "unpublished" : "draft";
  const live = drop.published && drop.state === "live";

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.1em]",
            live ? "bg-danger/10 text-danger" : "bg-surface-2 text-fg-muted",
          )}
        >
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />}
          {state.replace(/_/g, " ")}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{drop.title}</h3>
        {/* Only while it is running: "0 watching" on a drop that ended last
            week is not information. */}
        {live && (
          <span className="shrink-0 text-xs font-semibold text-fg-muted tnum">
            {drop.watching_now} watching now
          </span>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
        {drop.market.toUpperCase()} · {readable(drop.start_at)} ·{" "}
        <span className="tnum">
          {drop.quantity_remaining}/{drop.quantity_total}
        </span>{" "}
        left ·{" "}
        {drop.drop_price ? (
          <span className="tnum">
            {drop.currency} {drop.drop_price}
          </span>
        ) : (
          "no price set"
        )}
        {drop.retailer_name ? ` · ${drop.retailer_name}` : ""}
      </p>

      {/*
        * Whether it worked, beside the drop rather than on a second screen.
        *
        * It was one dense line of four numbers with no rates, which answers
        * "what happened" and not "did it work" — 40 of 200 and 40 of 45 read
        * identically there. Each step now carries what share of the one above
        * it got through, which is the only form in which these numbers say
        * anything.
        */}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted sm:grid-cols-3 lg:grid-cols-6">
        {[
          /*
           * One step per real question, in the order a person moves through the
           * drop, each measured against the step above it.
           *
           * "Pressed buy" and "sent to the shop" are deliberately separate.
           * They used to be written under one event name and so could never
           * disagree — but a blocked script loses the first and an abandoned
           * navigation loses the second, and the gap between them is the only
           * place that ever shows.
           */
          /*
           * Each rate names what it is a share of. "% of above" was wrong in
           * two places: "saw the price" was measured against everyone who
           * arrived while the column above it was "waited", so 3 of 0 read as
           * 100%; and "arrived" was measured against the people emailed, when
           * most arrivals never came from that email at all.
           */
          { label: "told", value: drop.announced, of: 0, ofLabel: "" },
          { label: "arrived", value: drop.reached, of: 0, ofLabel: "" },
          { label: "waited", value: drop.funnel.waiting_room || 0, of: drop.reached, ofLabel: "arrived" },
          { label: "saw the price", value: drop.funnel.reveal || 0, of: drop.reached, ofLabel: "arrived" },
          { label: "pressed buy", value: drop.funnel.buy_click || 0, of: drop.funnel.reveal || 0, ofLabel: "saw the price" },
          { label: "sent to the shop", value: drop.funnel.buy_handoff || 0, of: drop.funnel.buy_click || 0, ofLabel: "pressed buy" },
        ].map((step) => (
          <div key={step.label}>
            <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-fg-subtle">
              {step.label}
            </dt>
            {/* The rate sits under the count rather than beside it. Side by
                side they ran together — "3" next to "75%" reads as 375% at a
                glance, which is the one way these numbers could mislead the
                person they exist for. */}
            <dd className="font-semibold text-fg tnum">
              {step.value}
              {step.of > 0 && step.value > 0 ? (
                <span className="block text-[0.65rem] font-normal text-fg-subtle">
                  {Math.round((step.value / step.of) * 100)}% of {step.ofLabel}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        * The step this site cannot measure, said plainly rather than left as a
        * gap somebody fills in with a guess.
        *
        * A purchase happens on the shop's own checkout. Nothing here ever
        * learns about it, and no amount of analytics on this side will change
        * that. The label below is the whole thread: it rides out on the Buy
        * click and comes back on the sale in the network's own report, which
        * is where the last two steps of the funnel actually live.
        */}
      {/* Where the remaining count comes from. A drop whose listing gives no
          exact quantity still runs; it just never shows a countdown, and this
          is where that is visible before the drop rather than after. */}
      <p className="mt-2 text-xs text-fg-subtle">
        {/* Three states, because two of them were being reported as one: a
            drop nobody had asked the shop about looked exactly like a drop
            whose seller publishes no quantity. */}
        {drop.stock_is_live
          ? "Stock is confirmed by the shop — the page shows a live count."
          : drop.stock_checked_at
            ? "The shop gives no live count — the page shows the offer size, not a countdown."
            : "Not checked with the shop yet. The answer arrives within a minute of publishing."}
      </p>
      <p className="mt-2 text-xs text-fg-subtle">
        {/* People and emails, never one standing in for the other: one person
            gets up to three reminders (a day, an hour, ten minutes before). */}
        {drop.reminders} {drop.reminders === 1 ? "person" : "people"} asked for a reminder
        {drop.reminder_emails_sent != null ? ` · ${drop.reminder_emails_sent} reminder ${drop.reminder_emails_sent === 1 ? "email" : "emails"} sent` : ""}
        {" · "}told = people emailed the announcement, once each. <strong>Bought: not knowable here.</strong>{" "}
        Purchases are only visible in the network report — search it for{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.7rem] text-fg">
          {drop.click_label}
        </code>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(`/api/admin/live-drops/${drop.drop_key}/publish`, { published: !drop.published })
          }
          className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
        >
          {drop.published ? "Unpublish" : "Publish"}
        </button>

        {drop.published ? (
          <>
            {/* Stock is the one number worth correcting while a drop runs, and
                setting it to zero is also how one is closed early and
                honestly. */}
            <input
              type="number"
              min={0}
              max={drop.quantity_total}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              aria-label={`Units left for ${drop.title}`}
              className="h-9 w-20 rounded-full border border-border bg-surface-2 px-3 text-xs text-fg outline-none focus:border-border-strong"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(`/api/admin/live-drops/${drop.drop_key}/stock`, {
                  quantity_remaining: Number(stock),
                })
              }
              className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
            >
              Set stock
            </button>
          </>
        ) : everPublished ? (
          <span className="px-1 text-xs text-fg-subtle">Ran once, so it is kept as a record and cannot be deleted.</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => setRowMessage(await act(`/api/admin/live-drops/${drop.drop_key}`, null, "DELETE"))}
            className="inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-55"
          >
            Delete draft
          </button>
        )}

        <a
          href={`/${drop.market}/live`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center px-2 text-xs font-semibold text-fg-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Open the page
        </a>
      </div>

      {/* What the drop shows, editable after it is published. The offer
          itself — price, quantity, hour — is deliberately not here: people
          were told those, and changing them quietly is a different act. */}
      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
        <MediaUpload adminKey={adminKey} kind="image" label="Product photo" value={media.image_url} onChange={(v) => setMedia({ ...media, image_url: v })} disabled={busy} />
        <MediaUpload adminKey={adminKey} kind="image" label="Product in use — photo" value={media.secondary_image_url} onChange={(v) => setMedia({ ...media, secondary_image_url: v })} disabled={busy} />
        <MediaUpload adminKey={adminKey} kind="video" label="Presenter video" value={media.stream_embed_url} onChange={(v) => setMedia({ ...media, stream_embed_url: v })} allowLink disabled={busy} />
        <MediaUpload adminKey={adminKey} kind="video" label="Product footage" value={media.video_url} onChange={(v) => setMedia({ ...media, video_url: v })} disabled={busy} />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () =>
          setRowMessage(
            (await act(`/api/admin/live-drops/${drop.drop_key}/media`, media, "PATCH")) || "Saved.",
          )
        }
        className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-55"
      >
        Save media
      </button>

      {/* Beside the button that was pressed. A refusal printed at the top of a
          long console is a refusal nobody reads, and the button then looks
          broken — which is exactly how the delete guard was reported. */}
      {rowMessage && (
        <p className="mt-3 text-xs font-semibold text-danger" role="status">
          {rowMessage}
        </p>
      )}
    </div>
  );
}
