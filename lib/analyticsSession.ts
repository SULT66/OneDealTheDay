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

const newToken = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(18);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("").slice(0, 36);
};

export function analyticsSessionId(): string {
  /* Private browsing and blocked storage both throw here rather than returning
     null, so a fresh token per call is the fallback. It over-counts a little,
     which is the right way to be wrong: the alternative is dropping those
     people out of the funnel entirely. */
  try {
    const current = sessionStorage.getItem(KEY);
    if (current && VALID.test(current)) return current;
    const created = newToken();
    sessionStorage.setItem(KEY, created);
    return created;
  } catch {
    return newToken();
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
