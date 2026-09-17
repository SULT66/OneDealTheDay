/*
 * The security headers both entry points set.
 *
 * app.js answers the first requests after a cold start and src/server.js
 * everything after, and each had its own helmet call — so a policy added to
 * one silently did not apply to the other. One object now, used by both.
 */
/*
 * Content Security Policy, in report-only first.
 *
 * It was off entirely, which is one missed escape away from mattering: this
 * site prints retailer titles, seller names and a shopper's own question back
 * onto the page. Switching a policy straight on is how a live site loses its
 * checkout, its video host or its fonts in one deploy, so this reports and
 * enforces nothing. What it blocks in a browser: nothing. What it does: send
 * a note to /api/csp-report whenever a page loads something the policy would
 * have refused, so the list can be read before the switch is thrown.
 *
 * The allowances are deliberately what the site uses today: Daily and Tavus
 * for the Live Drop's video, Stripe for the club checkout, Google's analytics
 * where a visitor has accepted it, and https: images because the catalogue's
 * photographs come from whichever CDN the retailer uses.
 */
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://js.stripe.com"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", "https:", "wss:"],
  "frame-src": ["'self'", "https://*.daily.co", "https://js.stripe.com", "https://hooks.stripe.com"],
  "worker-src": ["'self'", "blob:"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
  "report-uri": ["/api/csp-report"],
};
const SECURITY_HEADERS = {
  contentSecurityPolicy: { useDefaults: false, reportOnly: true, directives: CSP_DIRECTIVES },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
};


module.exports = { SECURITY_HEADERS, CSP_DIRECTIVES };module.exports = { SECURITY_HEADERS, CSP_DIRECTIVES };
