const ISO_CURRENCIES = new Set(
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : ["USD", "CAD", "GBP", "EUR", "JPY", "AUD", "NZD", "CHF"]
);

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return ISO_CURRENCIES.has(currency) ? currency : null;
}

function currencyScale(currency) {
  return new Intl.NumberFormat("en", {
    style:"currency",
    currency,
    currencyDisplay:"code"
  }).resolvedOptions().maximumFractionDigits;
}

function moneyToMinor(value, currency, {allowZero = false} = {}) {
  const normalizedCurrency = normalizeCurrency(currency);
  const amount = Number(value);
  if (!normalizedCurrency || !Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) return null;
  const factor = 10 ** currencyScale(normalizedCurrency);
  const minor = Math.round((amount + Number.EPSILON) * factor);
  if (!Number.isSafeInteger(minor) || (allowZero ? minor < 0 : minor <= 0)) return null;
  return minor;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isoTimeOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function safePayload(product) {
  const affiliateUrl = httpUrl(product?.affiliate_url);
  return JSON.stringify({
    external_id:String(product?.external_id || ""),
    source:String(product?.source || ""),
    market:String(product?.market || ""),
    title:String(product?.title || "").slice(0, 240),
    current_price:product?.current_price ?? null,
    reference_price:product?.original_price ?? null,
    shipping_cost:product?.shipping_cost ?? null,
    currency:product?.currency ?? null,
    availability:product?.availability ?? null,
    affiliate_host:affiliateUrl?.hostname || null
  });
}

function validateSnapshot(product, observedAt) {
  const currency = normalizeCurrency(product?.currency);
  if (!currency) return {error:"invalid_currency", detail:"Currency must be an ISO 4217 code"};

  const priceMinor = moneyToMinor(product?.current_price, currency);
  if (priceMinor == null) return {error:"invalid_price", detail:"Current price must be a positive monetary amount"};

  const affiliateUrl = httpUrl(product?.affiliate_url);
  if (!affiliateUrl) return {error:"invalid_url", detail:"Affiliate URL must be an HTTP(S) URL without embedded credentials"};

  const ourObservedAt = isoTimeOrNull(observedAt);
  if (!ourObservedAt) return {error:"invalid_observed_at", detail:"Our observation time is required"};

  const referencePriceMinor = product?.original_price == null || product.original_price === ""
    ? null
    : moneyToMinor(product.original_price, currency);
  if (product?.original_price != null && product.original_price !== "" && referencePriceMinor == null) {
    return {error:"invalid_reference_price", detail:"Retailer reference price must be a positive monetary amount"};
  }

  const shippingMinor = product?.shipping_cost == null || product.shipping_cost === ""
    ? null
    : moneyToMinor(product.shipping_cost, currency, {allowZero:true});
  if (product?.shipping_cost != null && product.shipping_cost !== "" && shippingMinor == null) {
    return {error:"invalid_shipping", detail:"Shipping must be a non-negative monetary amount"};
  }

  const availabilityValue = Object.prototype.hasOwnProperty.call(product || {}, "source_availability")
    ? product.source_availability
    : product?.availability;

  return {
    currency,
    priceMinor,
    referencePriceMinor,
    shippingMinor,
    availability:availabilityValue == null || String(availabilityValue).trim() === ""
      ? null
      : String(availabilityValue).trim(),
    sourceUpdatedAt:isoTimeOrNull(product?.source_updated_at),
    ourObservedAt
  };
}

function createPriceSnapshotWriter(db) {
  const insertSnapshot = db.prepare(`
    INSERT OR IGNORE INTO price_history(
      product_id,offer_id,ingestion_run_id,price,original_price,price_minor,reference_price_minor,
      currency,source,availability,shipping_minor,source_updated_at,our_observed_at,observed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertQuarantine = db.prepare(`
    INSERT OR IGNORE INTO price_snapshot_quarantine(
      ingestion_run_id,external_id,source,market,reason_code,reason_detail,payload_json,quarantined_at
    ) VALUES(?,?,?,?,?,?,?,?)
  `);

  return {
    record({offerId, ingestionRunId, product, observedAt}) {
      if (!Number.isInteger(Number(offerId)) || Number(offerId) <= 0) throw new Error("Price snapshot offer_id is required");
      if (!Number.isInteger(Number(ingestionRunId)) || Number(ingestionRunId) <= 0) throw new Error("Price snapshot ingestion_run_id is required");

      const validated = validateSnapshot(product, observedAt);
      if (validated.error) {
        const result = insertQuarantine.run(
          Number(ingestionRunId),
          String(product?.external_id || ""),
          String(product?.source || ""),
          String(product?.market || ""),
          validated.error,
          validated.detail,
          safePayload(product),
          isoTimeOrNull(observedAt) || new Date().toISOString()
        );
        return {status:result.changes ? "quarantined" : "duplicate_quarantine", reason:validated.error};
      }

      const factor = 10 ** currencyScale(validated.currency);
      const result = insertSnapshot.run(
        Number(offerId),
        Number(offerId),
        Number(ingestionRunId),
        validated.priceMinor / factor,
        validated.referencePriceMinor == null ? null : validated.referencePriceMinor / factor,
        validated.priceMinor,
        validated.referencePriceMinor,
        validated.currency,
        String(product?.source || ""),
        validated.availability,
        validated.shippingMinor,
        validated.sourceUpdatedAt,
        validated.ourObservedAt,
        validated.ourObservedAt
      );
      return {status:result.changes ? "inserted" : "duplicate"};
    }
  };
}

exports.createPriceSnapshotWriter = createPriceSnapshotWriter;
exports.moneyToMinor = moneyToMinor;
exports.normalizeCurrency = normalizeCurrency;
exports.validateSnapshot = validateSnapshot;
