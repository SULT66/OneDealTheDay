(() => {
  const clickEndpoint = "/api/click-events";
  const analyticsEndpoint = "/api/analytics/events";
  const market = String(location.pathname.split("/")[1] || window.__ODD_MARKET__ || "us").toLowerCase();
  const internalTraffic = () => {
    if (window.oddInternalTraffic?.isInternal()) return true;
    try { if (localStorage.getItem("odd_internal_browser") === "1") return true; } catch {}
    return /(?:^|;\s*)odd_internal_browser=1(?:;|$)/.test(document.cookie || "");
  };

  const token = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(18);
    globalThis.crypto?.getRandomValues?.(bytes);
    return Array.from(bytes, value => value.toString(36).padStart(2, "0")).join("").slice(0, 36);
  };
  const sessionId = (() => {
    try {
      const current = sessionStorage.getItem("odd_analytics_session");
      if (/^[A-Za-z0-9_-]{16,80}$/.test(current || "") && current.startsWith("internal_") === internalTraffic()) return current;
      const created = (internalTraffic() ? "internal_" : "") + token();
      sessionStorage.setItem("odd_analytics_session", created);
      return created;
    } catch {
      return (internalTraffic() ? "internal_" : "") + token();
    }
  })();

  const send = (endpoint, payload) => {
    if (internalTraffic()) return;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type:"application/json" }));
      if (accepted) return;
    }
    fetch(endpoint, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body,
      keepalive:true,
      credentials:"same-origin"
    }).catch(() => {});
  };

  /*
   * A search term reduced to something we are willing to send to GA4: contact
   * details stripped, case and spacing flattened, hard length limit.
   *
   * The same rule as searchTerm() in lib/measure.ts, written twice because
   * this file is plain script served to the browser and that one is a
   * TypeScript module. If one changes, change both.
   */
  const searchTerm = raw => String(raw || "")
    .replace(/[^\s@]+@[^\s@]+|\+?\d[\d\s().-]{7,}/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  /* Defined by cookie-consent.js, which loads first and knows whether a
     European visitor has agreed yet. Absent means nothing is reported. */
  const measure = (name, values) => {
    try {
      window.oddEvent?.(name, values);
    } catch {
      /* Counting is never worth breaking the page it is on. */
    }
  };

  const analyticsEvent = payload => send(analyticsEndpoint, {
    ...payload,
    eventId:token(),
    sessionId,
    market
  });

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0) return;

    const outbound = event.target.closest('a[href*="/go/"]');
    if (outbound) {
      try {
        const url = new URL(outbound.href, location.href);
        if (url.origin === location.origin) {
          const eventId = token();
          url.searchParams.set("sid", sessionId);
          url.searchParams.set("eid", eventId);
          outbound.href = url.toString();
          /* The server records this click when it does the redirecting, which
             stays the number to trust. This copy is what lets GA4 put it
             beside the visit that brought the person in. The store and coupon
             front doors put a word where the id goes, so a numeric segment is
             the test for "this is a listing". */
          const parts = url.pathname.split("/").filter(Boolean);
          const target = parts[parts.indexOf("go") + 1] || "";
          const listing = /^\d+$/.test(target);
          measure("retailer_click", {
            item_id: listing ? target : undefined,
            destination: listing ? "listing" : target.slice(0, 40) || "unknown",
            source: url.searchParams.get("source") || undefined,
            placement: url.searchParams.get("placement") || undefined,
            action: url.searchParams.get("action") || undefined,
            click_id: eventId
          });
        }
      } catch {}
      return;
    }

    const link = event.target.closest("a[data-track-product]");
    if (!link) return;
    const productId = Number(link.dataset.trackProduct);
    if (!Number.isInteger(productId) || productId <= 0) return;
    send(clickEndpoint, {
      eventId:token(),
      sessionId,
      productId,
      sourcePage:link.dataset.trackSource || "unknown",
      placement:link.dataset.trackPlacement || "unknown",
      action:link.dataset.trackAction || "view_details"
    });
  }, { capture:true });

  const context = document.querySelector("main[data-analytics-page]");
  if (context?.dataset.analyticsPage === "search" && context.dataset.analyticsQuery) {
    const resultCount = Number(context.dataset.analyticsResultCount || 0);
    analyticsEvent({
      eventType:"search",
      sourcePage:"search",
      placement:"unknown",
      query:context.dataset.analyticsQuery,
      resultCount
    });
    /* A search that finds nothing is the most useful thing the catalogue says
       and the one thing a page-view report cannot show: the URL of a search
       with no results looks exactly like one with forty. */
    measure("search", {
      search_term: searchTerm(context.dataset.analyticsQuery),
      result_count: Math.max(0, Math.round(resultCount) || 0)
    });
  }

  const registered = new WeakSet();
  const sent = new WeakSet();
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.35 || sent.has(entry.target)) continue;
        sent.add(entry.target);
        observer.unobserve(entry.target);
        const link = entry.target.matches?.("a[data-track-product]")
          ? entry.target
          : entry.target.querySelector?.("a[data-track-product]");
        const productId = Number(link?.dataset.trackProduct);
        if (!Number.isInteger(productId) || productId <= 0) continue;
        const productRoots = [...document.querySelectorAll("article, #featuredDeal, a.search-suggestion")]
          .filter(root => root.querySelector?.("a[data-track-product]") || root.matches?.("a[data-track-product]"));
        analyticsEvent({
          eventType:"impression",
          productId,
          sourcePage:link.dataset.trackSource || "unknown",
          placement:link.dataset.trackPlacement || "unknown",
          position:Math.max(1, productRoots.indexOf(entry.target) + 1)
        });
      }
    }, { threshold:[0.35] })
    : null;

  const registerImpressions = root => {
    const links = [...(root.querySelectorAll?.("a[data-track-product]") || [])];
    const impressionRoots = new Set(links.map(link => link.closest("article, #featuredDeal, a.search-suggestion") || link));
    for (const impressionRoot of impressionRoots) {
      if (registered.has(impressionRoot)) continue;
      registered.add(impressionRoot);
      if (observer) observer.observe(impressionRoot);
      else {
        const link = impressionRoot.matches?.("a[data-track-product]")
          ? impressionRoot
          : impressionRoot.querySelector?.("a[data-track-product]");
        const productId = Number(link?.dataset.trackProduct);
        if (Number.isInteger(productId) && productId > 0) analyticsEvent({
          eventType:"impression",
          productId,
          sourcePage:link.dataset.trackSource || "unknown",
          placement:link.dataset.trackPlacement || "unknown"
        });
      }
    }
  };

  registerImpressions(document);
  if ("MutationObserver" in window) {
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) registerImpressions(node);
        }
      }
    }).observe(document.body, { childList:true, subtree:true });
  }
})();
