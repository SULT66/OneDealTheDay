/* Browser-local measurement opt-out. This grants no account/admin access. */
(() => {
  "use strict";
  const KEY = "odd_internal_browser";
  const GA = "G-1L69NBBDV2";
  let memory = false;
  const read = () => {
    let stored = false;
    try { stored = localStorage.getItem(KEY) === "1"; } catch {}
    return memory || stored || /(?:^|;\s*)odd_internal_browser=1(?:;|$)/.test(document.cookie || "");
  };
  const showStatus = () => {
    document.getElementById("oddInternalTrafficStatus")?.remove();
    if (!read() || !document.body) return;
    const status = document.createElement("aside");
    status.id = "oddInternalTrafficStatus";
    status.setAttribute("aria-label", "Measurement settings for this browser");
    status.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483646;max-width:290px;padding:10px 14px;border:1px solid #a3b231;border-radius:12px;background:#152017;color:#fff;font:13px/1.5 system-ui;box-shadow:0 2px 12px #0004";
    const text = document.createElement("span");
    text.textContent = "Owner/test mode: your visits are not counted. ";
    status.appendChild(text);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Turn off";
    button.style.cssText = "background:none;border:0;color:#d8ef75;text-decoration:underline;cursor:pointer;font:inherit";
    button.addEventListener("click", () => { set(false); location.reload(); });
    status.appendChild(button);
    document.body.appendChild(status);
  };
  const sync = () => {
    window[`ga-disable-${GA}`] = read() || /(?:^|\/)admin(?:\/|$)/.test(location.pathname);
    showStatus();
  };
  const set = enabled => {
    memory = Boolean(enabled);
    try {
      if (enabled) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {}
    document.cookie = `${KEY}=${enabled ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${enabled ? 31536000 : 0}${location.protocol === "https:" ? "; Secure" : ""}`;
    try { sessionStorage.removeItem("odd_analytics_session"); } catch {}
    sync();
    window.dispatchEvent(new Event("odd:internal-traffic"));
    return read();
  };
  window.oddInternalTraffic = { isInternal: read, set };
  const query = new URLSearchParams(location.search);
  const choice = query.get("odd_internal");
  if (choice === "1" || choice === "0") {
    set(choice === "1");
    // Do not propagate this private preference when copying a product link.
    query.delete("odd_internal");
    try { history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}${location.hash || ""}`); } catch {}
  } else if (read()) set(true); // Migrate existing admin flags to the server-readable cookie.
  else sync();
  window.addEventListener("storage", event => {
    if (event.key !== KEY && event.key !== null) return;
    memory = false;
    // Reload prevents old GA/measurement sessions surviving a cross-tab switch.
    location.reload();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showStatus, { once: true });
})();
