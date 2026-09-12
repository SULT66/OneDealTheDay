(() => {
  "use strict";

  const STORAGE_KEY = "odd_cookie_consent_v1";
  const ANALYTICS_ID = "G-1L69NBBDV2";
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
      page:() => track("page_viewed", {
        path:location.pathname,
        title:document.title,
        language:navigator.language,
        screen_width:screen.width
      })
    };
  };

  const loadLareoAnalytics = async () => {
    const config = window.__LAREO_ANALYTICS__;
    if (!config?.endpoint || !config?.writeKey) return;
    try {
      const analytics = createLareoAnalytics(config);
      window.lareoAnalytics = analytics;
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

  const loadAnalytics = () => {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    setConsentMode("granted");
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
    document.head.appendChild(script);
    window.gtag("js", new Date());
    window.gtag("config", ANALYTICS_ID, { anonymize_ip: true });
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
