"use client";

import { useEffect, useRef } from "react";
import { analyticsSessionId } from "@/lib/analyticsSession";

// Events share the site's anonymous session and existing analytics endpoints.
export function MerchandisingTracking({ market, children }: { market: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const send = (link: HTMLElement, impression: boolean) => {
      const productId = Number(link.dataset.merchProduct);
      if (!Number.isInteger(productId) || productId <= 0) return;
      const payload = {
        eventId: crypto.randomUUID(), sessionId: analyticsSessionId(), market, productId,
        sourcePage: link.dataset.merchSource,
        placement: link.dataset.merchPlacement,
        ...(impression ? { eventType: "impression" } : { action: "view_details" }),
      };
      fetch(impression ? "/api/analytics/events" : "/api/click-events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), keepalive: true,
      }).catch(() => {});
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLElement>("a[data-merch-product]");
      if (link && container.contains(link)) send(link, false);
    };
    container.addEventListener("click", click, {capture:true});
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.35) continue;
        observer?.unobserve(entry.target);
        send(entry.target as HTMLElement, true);
      }
    }, {threshold:0.35});
    container.querySelectorAll("a[data-merch-product]").forEach(link => observer?.observe(link));
    return () => { container.removeEventListener("click", click, {capture:true}); observer?.disconnect(); };
  }, [market]);
  return <div ref={root}>{children}</div>;
}
