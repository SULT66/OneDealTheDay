"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsSessionId } from "@/lib/analyticsSession";

/*
 * Tell the site a page was opened, and where the visitor came from.
 *
 * Sent from the browser after the page has run, not counted from server
 * requests, so a crawler that only fetches the HTML is never a visitor. See
 * src/pageViews.js for what is kept, which is very little: an anonymous per-tab
 * id, the path without its query string, and the source reduced to a name.
 *
 * On every route change, because the site is navigated client-side and a
 * second page would otherwise never be seen. The server keeps one row per
 * session, page and day, so a re-render sending the same page twice costs
 * nothing.
 */
export function PageViews() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const body = JSON.stringify({
        session_id: analyticsSessionId(),
        path: pathname,
        utm_source: params.get("utm_source") || "",
        utm_campaign: params.get("utm_campaign") || "",
        referrer: document.referrer || "",
      });
      fetch("/api/analytics/page-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* Counting a visit is never worth breaking the page it is on. */
    }
  }, [pathname]);

  return null;
}
