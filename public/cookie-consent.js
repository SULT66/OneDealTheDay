(() => {
  "use strict";

  const STORAGE_KEY = "odd_cookie_consent_v1";
  const ANALYTICS_ID = "G-1L69NBBDV2";
  const internalTraffic = () => {
    if (/(?:^|\/)admin(?:\/|$)/.test(location.pathname)) return true;
    if (window.oddInternalTraffic?.isInternal()) return true;
    // Also safe if this controller runs before the early preference script.
    const choice = new URLSearchParams(location.search).get("odd_internal");
    if (choice === "0") return false;
    if (choice === "1") return true;
    try { if (localStorage.getItem("odd_internal_browser") === "1") return true; } catch {}
    return /(?:^|;\s*)odd_internal_browser=1(?:;|$)/.test(document.cookie || "");
  };
  const CONSENT_MARKETS = new Set(["fr", "de"]);
  const pathMarket = location.pathname.split("/").filter(Boolean)[0] || "";
  const market = String(window.__ODD_MARKET__ || pathMarket).toLowerCase();
  const language = String(window.__ODD_LANGUAGE__ || document.documentElement.lang || "en")
    .toLowerCase()
    .split("-")[0];
  const needsConsent = CONSENT_MARKETS.has(market);
  const copy = {
    en: {
      title: "Your privacy choices",
      text: "We use optional analytics cookies to understand how the site is used. You can accept or decline them. Essential site functions work either way.",
      accept: "Accept analytics",
      decline: "Decline",
      settings: "Cookie settings",
      privacy: "Privacy policy"
    },
    es: {
      title: "Tus opciones de privacidad",
      text: "Usamos cookies de análisis opcionales para entender cómo se utiliza el sitio. Puedes aceptarlas o rechazarlas. Las funciones esenciales seguirán funcionando.",
      accept: "Aceptar análisis",
      decline: "Rechazar",
      settings: "Configuración de cookies",
      privacy: "Política de privacidad"
    },
    fr: {
      title: "Vos choix de confidentialité",
      text: "Nous utilisons des cookies d’analyse facultatifs pour comprendre l’utilisation du site. Vous pouvez les accepter ou les refuser. Les fonctions essentielles restent disponibles.",
      accept: "Accepter l’analyse",
      decline: "Refuser",
      settings: "Paramètres des cookies",
      privacy: "Politique de confidentialité"
    },
    de: {
      title: "Ihre Datenschutzauswahl",
      text: "Wir verwenden optionale Analyse-Cookies, um die Nutzung der Website zu verstehen. Sie können zustimmen oder ablehnen. Wesentliche Funktionen bleiben verfügbar.",
      accept: "Analyse akzeptieren",
      decline: "Ablehnen",
      settings: "Cookie-Einstellungen",
      privacy: "Datenschutzerklärung"
    }
  };
  const t = copy[language] || copy.en;
  let analyticsLoaded = false;
  let lareoStarted = false;
  let lareoConfigAttempts = 0;

  const createLareoAnalytics = config => {
    const endpoint = config.endpoint.replace(/\/$/, "");
    const readStorage = key => {
      try { return localStorage.getItem(key); } catch { return null; }
    };
    const writeStorage = (key, value) => {
      try { localStorage.setItem(key, value); } catch {}
    };
    const id = () => crypto.randomUUID();

    let anonymousId = readStorage("lareo_analytics_id");
    if (!anonymousId) {
      anonymousId = id();
      writeStorage("lareo_analytics_id", anonymousId);
    }

    const now = Date.now();
    let session;
    try { session = JSON.parse(readStorage("lareo_analytics_session") || "null"); }
    catch { session = null; }
    if (!session || now - Number(session.lastSeen || 0) > 30 * 60 * 1000) {
      session = { id:id(), started:now };
    }
    session.lastSeen = now;
    writeStorage("lareo_analytics_session", JSON.stringify(session));

    const query = new URLSearchParams(location.search);
    let referrerOrigin;
    try { referrerOrigin = document.referrer ? new URL(document.referrer).origin : undefined; }
    catch {}
    const acquisition = {
      referrer:referrerOrigin,
      utm_source:query.get("utm_source") || undefined,
      utm_medium:query.get("utm_medium") || undefined,
      utm_campaign:query.get("utm_campaign") || undefined
    };

    const track = async (eventName, properties = {}) => {
      if (internalTraffic()) return;
      const payload = {
        event_id:id(),
        event_name:eventName,
        event_time:new Date().toISOString(),
        anonymous_user_id:anonymousId,
        session_id:session.id,
        environment:"production",
        source:acquisition.utm_source || acquisition.referrer,
        device:/Mobi/i.test(navigator.userAgent) ? "mobile" : "desktop",
        properties:{ ...acquisition, ...properties }
      };
      try {
        await fetch(`${endpoint}/v1/events`, {
          method:"POST",
          keepalive:true,
          headers:{
            "Content-Type":"application/json",
            "X-Lareo-Write-Key":config.writeKey
          },
          body:JSON.stringify(payload)
        });
      } catch {
        // Analytics must never interrupt the storefront.
      }
    };

    return {
      track,
      page:() => {
        const properties = {
          path:location.pathname,
          title:document.title,
          language:navigator.language,
          screen_width:screen.width
        };
        track("page_viewed", properties);
        if (/\/deal\/[^/]+/.test(location.pathname)) track("product_viewed", properties);
      }
    };
  };

  const installLareoInteractions = analytics => {
    if (document.documentElement.dataset.lareoInteractions === "active") return;
    document.documentElement.dataset.lareoInteractions = "active";

    document.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("a,button");
      if (!control) return;

      const sourcePath = location.pathname;
      if (control instanceof HTMLButtonElement) {
        analytics.track("button_clicked", {
          path:sourcePath,
          control_id:control.id || control.dataset.analyticsAction || control.type || "button"
        });
        return;
      }

      const href = control.getAttribute("href");
      if (!href) return;
      let url;
      try { url = new URL(href, location.origin); } catch { return; }

      if (url.origin !== location.origin) {
        analytics.track(url.protocol === "mailto:" || url.protocol === "tel:" ? "contact_clicked" : "outbound_clicked", {
          path:sourcePath,
          target_origin:url.origin
        });
        return;
      }

      const properties = { path:sourcePath, target_path:url.pathname };
      if (/\/go\//.test(url.pathname)) analytics.track("affiliate_clicked", properties);
      else if (/\/deal\/[^/]+/.test(url.pathname)) analytics.track("product_viewed", properties);
      else analytics.track("navigation_clicked", properties);
    }, true);

    document.addEventListener("submit", event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const action = new URL(form.getAttribute("action") || location.href, location.origin);
      const searchInput = form.querySelector('input[name="q"], input[type="search"]');
      analytics.track("search_submitted", {
        path:location.pathname,
        target_path:action.pathname,
        query_length:searchInput instanceof HTMLInputElement ? searchInput.value.length : 0
      });
    }, true);
  };

  const loadLareoAnalytics = () => {
    if (internalTraffic() || lareoStarted) return;
    const config = window.__LAREO_ANALYTICS__;
    if (!config?.endpoint || !config?.writeKey) {
      if (lareoConfigAttempts < 50) {
        lareoConfigAttempts += 1;
        window.setTimeout(loadLareoAnalytics, 100);
      }
      return;
    }
    try {
      const analytics = createLareoAnalytics(config);
      lareoStarted = true;
      window.lareoAnalytics = analytics;
      installLareoInteractions(analytics);
      analytics.page();
    } catch {
      // Product behavior must never depend on analytics availability.
    }
  };

  const preference = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const savePreference = value => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Consent still applies for the current page when storage is unavailable.
    }
  };

  const setConsentMode = value => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("consent", "default", {
      analytics_storage: value,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  };

  /*
   * The six things worth counting, and the one function that reports them.
   *
   * GA4 was receiving page views and nothing else, so every question past
   * "how many people came" had no answer: not which pages sent a visitor to a
   * shop, not whether anyone uses the assistant, not whether search finds
   * anything. These six say what somebody did, and they are a closed set on
   * purpose — a typo in an event name is a metric that silently never arrives,
   * and GA4's own 500-name limit is not something to spend on misspellings.
   *
   * Nothing here carries an email address, a question somebody typed, or
   * anything else that identifies a person. See lib/measure.ts, which is what
   * the pages actually call, for what each event is allowed to say.
   */
  const EVENTS = new Set([
    "view_item",
    "search",
    "delia_open",
    "delia_query_submit",
    "email_signup",
    "retailer_click"
  ]);

  /* Enough to hold a first page's worth of events while a European visitor
     reads the consent banner, and small enough that a page left open with
     consent refused cannot grow it. */
  const QUEUE_LIMIT = 20;
  let queued = [];
  let consentRefused = false;

  /* GA4 takes strings and numbers. Anything else is a mistake at the call
     site, and an object arriving here would be sent as "[object Object]". */
  const parameter = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return null;
    const text = String(value).trim().slice(0, 100);
    return text || null;
  };

  /*
   * The stub `setConsentMode` installs makes `window.gtag` a function long
   * before Google's script has loaded, and in Europe before the visitor has
   * been asked. So the test is whether analytics is actually running, not
   * whether the symbol exists: otherwise a refused banner would still have
   * pushed every event into dataLayer, where a later acceptance would replay
   * the lot.
   */
  const deliver = (name, parameters) => {
    if (internalTraffic() || !analyticsLoaded || typeof window.gtag !== "function") return false;
    window.gtag("event", name, parameters);
    return true;
  };

  window.oddEvent = (name, values) => {
    if (internalTraffic() || consentRefused || !EVENTS.has(name)) return;
    const parameters = {};
    for (const key of Object.keys(values || {})) {
      const kept = parameter(values[key]);
      if (kept !== null) parameters[key] = kept;
    }
    if (deliver(name, parameters)) return;
    if (queued.length < QUEUE_LIMIT) queued.push([name, parameters]);
  };

  const flushQueuedEvents = () => {
    const pending = queued;
    queued = [];
    for (const [name, parameters] of pending) deliver(name, parameters);
  };

  const loadAnalytics = () => {
    if (internalTraffic() || analyticsLoaded) return;
    analyticsLoaded = true;
    setConsentMode("granted");
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
    document.head.appendChild(script);
    window.gtag("js", new Date());
    window.gtag("config", ANALYTICS_ID, { anonymize_ip: true });
    flushQueuedEvents();
    loadLareoAnalytics();
  };

  const removeBanner = () => document.getElementById("oddCookieConsent")?.remove();

  const showBanner = () => {
    removeBanner();
    const banner = document.createElement("section");
    banner.id = "oddCookieConsent";
    banner.className = "cookie-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "true");
    banner.setAttribute("aria-labelledby", "oddCookieTitle");
    banner.innerHTML = `
      <div class="cookie-consent-copy">
        <strong id="oddCookieTitle"></strong>
        <p></p>
        <a href="/${market || "us"}/privacy"></a>
      </div>
      <div class="cookie-consent-actions">
        <button type="button" data-cookie-decline></button>
        <button type="button" class="cookie-consent-accept" data-cookie-accept></button>
      </div>`;
    banner.querySelector("strong").textContent = t.title;
    banner.querySelector("p").textContent = t.text;
    banner.querySelector("a").textContent = t.privacy;
    banner.querySelector("[data-cookie-decline]").textContent = t.decline;
    banner.querySelector("[data-cookie-accept]").textContent = t.accept;
    banner.querySelector("[data-cookie-decline]").addEventListener("click", () => {
      savePreference("declined");
      setConsentMode("denied");
      consentRefused = true;
      queued = [];
      removeBanner();
    });
    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => {
      savePreference("accepted");
      loadAnalytics();
      removeBanner();
    });
    document.body.appendChild(banner);
    banner.querySelector("[data-cookie-accept]").focus();
  };

  const addSettingsControl = () => {
    if (!needsConsent || document.querySelector("[data-cookie-settings]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cookie-settings-link";
    button.dataset.cookieSettings = "";
    button.textContent = t.settings;
    button.addEventListener("click", showBanner);
    (document.querySelector("footer") || document.body).appendChild(button);
  };

  window.addEventListener?.("odd:internal-traffic", () => {
    window[`ga-disable-${ANALYTICS_ID}`] = internalTraffic();
    if (internalTraffic()) queued = [];
    // Turning measurement back on requires a reload, preserving consent rules.
  });
  if (internalTraffic()) {
    window[`ga-disable-${ANALYTICS_ID}`] = true;
    return;
  }

  if (!needsConsent) {
    loadAnalytics();
    return;
  }

  setConsentMode("denied");
  const saved = preference();
  if (saved === "accepted") loadAnalytics();
  else if (saved !== "declined") showBanner();
  addSettingsControl();
})();
