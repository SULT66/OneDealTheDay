const geoip = require("geoip-lite");

const definitions = {
  us: {
    code: "us",
    name: "United States",
    countryCodes: ["US"],
    currency: "USD",
    locale: "en-US",
    hreflang: "en-US",
    timezone: "America/New_York",
    ebayMarketplaceId: "EBAY_US",
    amazonDomain: "amazon.com",
    walmartDomain: "walmart.com",
    supportsWalmart: true
  },
  ca: {
    code: "ca",
    name: "Canada",
    countryCodes: ["CA"],
    currency: "CAD",
    locale: "en-CA",
    hreflang: "en-CA",
    timezone: "America/Toronto",
    ebayMarketplaceId: "EBAY_CA",
    amazonDomain: "amazon.ca",
    walmartDomain: "walmart.ca",
    supportsWalmart: false
  },
  uk: {
    code: "uk",
    name: "United Kingdom",
    countryCodes: ["GB"],
    currency: "GBP",
    locale: "en-GB",
    hreflang: "en-GB",
    timezone: "Europe/London",
    ebayMarketplaceId: "EBAY_GB",
    amazonDomain: "amazon.co.uk",
    supportsWalmart: false
  },
  fr: {
    code: "fr",
    name: "France",
    countryCodes: ["FR"],
    currency: "EUR",
    locale: "fr-FR",
    hreflang: "fr-FR",
    timezone: "Europe/Paris",
    ebayMarketplaceId: "EBAY_FR",
    amazonDomain: "amazon.fr",
    supportsWalmart: false
  },
  de: {
    code: "de",
    name: "Germany",
    countryCodes: ["DE"],
    currency: "EUR",
    locale: "de-DE",
    hreflang: "de-DE",
    timezone: "Europe/Berlin",
    ebayMarketplaceId: "EBAY_DE",
    amazonDomain: "amazon.de",
    supportsWalmart: false
  }
};

const aliases = {
  usa: "us",
  "united-states": "us",
  gb: "uk",
  gbr: "uk",
  "united-kingdom": "uk",
  fra: "fr",
  france: "fr",
  deu: "de",
  germany: "de",
  can: "ca",
  canada: "ca"
};

const byCountry = Object.values(definitions).reduce((result, market) => {
  for (const countryCode of market.countryCodes) result[countryCode] = market.code;
  return result;
}, {});

function normalizeMarket(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const code = aliases[normalized] || normalized;
  return definitions[code] ? code : "";
}

function market(code) {
  return definitions[normalizeMarket(code)] || definitions.us;
}

function normalizeIp(value) {
  let ip = String(value || "").split(",")[0].trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  return ip;
}

function clientIp(req) {
  return normalizeIp(
    req.headers["x-azure-clientip"] ||
    req.headers["x-client-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.socket?.remoteAddress
  );
}

function marketFromIp(req) {
  const cloudflareCountry = String(req.headers["cf-ipcountry"] || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cloudflareCountry) && byCountry[cloudflareCountry]) {
    return market(byCountry[cloudflareCountry]);
  }

  const lookup = geoip.lookup(clientIp(req));
  return market(byCountry[String(lookup?.country || "").toUpperCase()] || "us");
}

function marketFromRequest(req) {
  const pathMarket = normalizeMarket(req.params?.market || req.market);
  return pathMarket ? market(pathMarket) : marketFromIp(req);
}

function marketPath(code, pathname = "") {
  const selected = market(code);
  const suffix = String(pathname || "").trim();
  if (!suffix || suffix === "/") return `/${selected.code}`;
  return `/${selected.code}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}

function alternateLinks(pathname = "", marketCodes = Object.keys(definitions)) {
  const supported = [...new Set(marketCodes.map(normalizeMarket).filter(Boolean))];
  const defaultCode = supported.includes("us") ? "us" : supported[0];
  if (!defaultCode) return "";
  return supported
    .map(code => definitions[code])
    .map(item => `<link rel="alternate" hreflang="${item.hreflang}" href="https://www.onedailydrop.com${marketPath(item.code, pathname)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="https://www.onedailydrop.com${marketPath(defaultCode, pathname)}">`)
    .join("");
}

module.exports = {
  definitions,
  codes: Object.keys(definitions),
  normalizeMarket,
  market,
  clientIp,
  marketFromIp,
  marketFromRequest,
  marketPath,
  alternateLinks
};
