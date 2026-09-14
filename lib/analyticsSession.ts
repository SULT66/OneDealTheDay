/**
 * The anonymous per-tab id the funnel counts are grouped by.
 *
 * Deliberately the same sessionStorage key public/click-tracking.js already
 * uses, so a visitor who browses the catalogue and then watches a drop is one
 * session across both rather than two people who happen to look alike.
 *
 * sessionStorage, not localStorage: it should not outlive the tab. The counts
 * this feeds are "how many people were at the drop", which does not need
 * anybody to be recognisable next week.
 */
const KEY = "odd_analytics_session";
const VALID = /^[A-Za-z0-9_-]{16,80}$/;

/*
 * The owner's own browser.
 *
 * While real visitors number in single figures, the person testing the site
 * is most of the traffic. A browser that has unlocked the admin console keeps
 * this flag (a flag, never the key), and its session ids carry a prefix every
 * count on the server skips. See src/growthMetrics.js.
 */
const INTERNAL_KEY = "odd_internal_browser";
export const INTERNAL_PREFIX = "internal_";

export function isInternalBrowser(): boolean {
  try {
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setInternalBrowser(internal: boolean) {
  try {
    if (internal) localStorage.setItem(INTERNAL_KEY, "1");
    else localStorage.removeItem(INTERNAL_KEY);
    /* The id in this tab changes with it, so the switch applies straight away. */
    sessionStorage.removeItem(KEY);
  } catch {
    /* Storage blocked: nothing to remember, and nothing to break. */
  }
}

const newToken = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(18);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("").slice(0, 36);
};

export function analyticsSessionId(): string {
  const internal = isInternalBrowser();
  const fits = (token: string) => VALID.test(token) && token.startsWith(INTERNAL_PREFIX) === internal;
  const make = () => (internal ? `${INTERNAL_PREFIX}${newToken()}` : newToken());
  /* Private browsing and blocked storage both throw here rather than returning
     null, so a fresh token per call is the fallback. It over-counts a little,
     which is the right way to be wrong: the alternative is dropping those
     people out of the funnel entirely. */
  try {
    const current = sessionStorage.getItem(KEY);
    if (current && fits(current)) return current;
    const created = make();
    sessionStorage.setItem(KEY, created);
    return created;
  } catch {
    return make();
  }
}

/** Fire and forget: a funnel count is never worth interrupting a purchase. */
export function recordLiveDropEvent(dropKey: string, eventType: string) {
  if (!dropKey) return;
  const body = JSON.stringify({
    drop_key: dropKey,
    event_type: eventType,
    session_id: analyticsSessionId(),
  });
  /* keepalive so the buy click still reports after the tab has navigated away
     to the retailer, which is exactly the event we most want to keep. */
  fetch("/api/live/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
