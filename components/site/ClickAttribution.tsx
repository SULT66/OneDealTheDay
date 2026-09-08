"use client";

import { useEffect } from "react";
import { analyticsSessionId } from "@/lib/analyticsSession";

/*
 * Stamp the visitor's anonymous session onto outbound links, in the browser.
 *
 * Every click that leaves for a shop is recorded, and until now every one of
 * them was recorded with an empty session id: /go/:id reads it from a `sid`
 * query parameter and only the Live Drop panel was adding one. So the admin
 * panel counted 4,895 outbound clicks and one session — not "one visitor", but
 * "we have no idea", which is worse than a gap because it looks like an
 * answer. It also means a crawler walking every link is indistinguishable from
 * a person who bought something, and the two need very different responses.
 *
 * This has to happen in the browser rather than in the rendered href, and that
 * is not a preference. The pages are cached now (src/htmlCache.js): a session
 * id baked into the HTML on the server would be handed to every later visitor
 * of that cached copy, which would be worse than the empty one — it would
 * collapse thousands of real people into a single confident-looking session.
 *
 * A delegated listener rather than a prop threaded through each link, because
 * outbound links are rendered in several places and any new one would
 * otherwise arrive unattributed and nobody would notice for months.
 */

/* Both the product links and the store-front links, and nothing else. */
const OUTBOUND = /\/go\//;

export function ClickAttribution() {
  useEffect(() => {
    const stamp = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || !OUTBOUND.test(href)) return;

      try {
        /* Relative hrefs need a base, and the base tells us to leave alone
           anything pointing at another origin. */
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.searchParams.get("sid")) return;
        url.searchParams.set("sid", analyticsSessionId());
        link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
      } catch {
        /* A malformed href is the browser's problem, not ours: leave the link
           exactly as the page wrote it rather than risk breaking the one click
           that actually earns something. */
      }
    };

    /*
     * pointerdown fires before the navigation begins, which covers a normal
     * click, a middle click and a ctrl-click alike. `click` is the keyboard
     * path — Enter on a focused link produces no pointer event — and running
     * both is harmless because the second call sees the sid already there.
     */
    document.addEventListener("pointerdown", stamp, true);
    document.addEventListener("click", stamp, true);
    return () => {
      document.removeEventListener("pointerdown", stamp, true);
      document.removeEventListener("click", stamp, true);
    };
  }, []);

  return null;
}
