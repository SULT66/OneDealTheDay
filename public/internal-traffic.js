/* Retire the old browser opt-out, including links shared before its removal. */
(() => {
  "use strict";
  try { localStorage.removeItem("odd_internal_browser"); } catch {}
  try {
    if (sessionStorage.getItem("odd_analytics_session")?.startsWith("internal_")) {
      sessionStorage.removeItem("odd_analytics_session");
    }
  } catch {}
  document.cookie = "odd_internal_browser=; Path=/; SameSite=Lax; Max-Age=0";
  window["ga-disable-G-1L69NBBDV2"] = false;
  delete window.oddInternalTraffic;
  document.getElementById("oddInternalTrafficStatus")?.remove();
  const query = new URLSearchParams(location.search);
  if (query.has("odd_internal")) {
    query.delete("odd_internal");
    try { history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}${location.hash || ""}`); } catch {}
  }
})();
