/*
 * Are the hand-added Amazon links still alive?
 *
 * Nothing else on this site would notice one going dead. The catalogue has a
 * link checker and it walks the catalogue; these picks are typed in by hand,
 * live in their own table, and are never looked at again after the day they
 * are added. A product that Amazon pulls, or a short link that expires, would
 * go on sitting on the homepage sending people to an error page for as long as
 * nobody happened to click it themselves.
 *
 * Only the HTTP status is read — the request is a link check, not a way to
 * collect Amazon's data by the back door. Nothing here parses a page, and
 * nothing here learns a price or a title. That distinction is the whole reason
 * this file is allowed to exist.
 *
 * A dead link is marked, not deleted. Deleting would lose the name and the
 * note that were written by hand, and a product can come back into stock; the
 * public list simply stops showing it, and the console says which one and why
 * so it can be fixed or removed on purpose.
 */

/*
 * What this can and cannot see, established by asking Amazon rather than by
 * assuming.
 *
 * A GET for an ASIN that does not exist — /dp/B000000000 — comes back 200.
 * Amazon serves its "we couldn't find that page" as a normal page, so no
 * status code will ever tell us a product has been delisted. This check
 * therefore catches a broken or expired link and nothing else, and the panel
 * says exactly that rather than letting a green tick imply the product is
 * still for sale.
 *
 * Going further would mean fetching their page and reading it for an error
 * marker, which is the parsing this whole feature exists to avoid. Real
 * availability arrives with the Product Advertising API, after three
 * qualifying sales, along with the price.
 *
 * A 503 or a 405 is Amazon having an opinion about an automated request, not
 * evidence about the product, so only an answer that says this particular
 * address is gone counts.
 */
const GONE = new Set([404, 410]);
const REQUEST_TIMEOUT_MS = 20000;
/* One at a time, with a gap: a handful of links is not worth a burst of
   parallel requests at a shop we want to stay on good terms with. */
const SPACING_MS = 1500;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkOne(url, fetchImpl = global.fetch) {
  try {
    const response = await fetchImpl(url, {
      /* Followed, because the short link is a redirect and its destination is
         what actually has to exist. */
      redirect: "follow",
      headers: {
        "user-agent": "OneDailyDrop-LinkCheck",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    /* The body is never read. */
    if (GONE.has(response.status)) return { status: "dead", detail: `HTTP ${response.status}` };
    if (response.status >= 200 && response.status < 400) return { status: "ok", detail: `HTTP ${response.status}` };
    /* Everything else — a 503, a rate limit, a block — is Amazon having an
       opinion about our request, not evidence about the product. */
    return { status: "unknown", detail: `HTTP ${response.status}` };
  } catch (error) {
    return { status: "unknown", detail: error.message };
  }
}

/**
 * Check every pick, and record what came back.
 *
 * Returns a summary so the caller can log it and the tests can assert on it.
 */
async function checkAmazonLinks({ db, fetchImpl = global.fetch, spacingMs = SPACING_MS, now = () => Date.now() } = {}) {
  const picks = db.prepare("SELECT id, url FROM amazon_picks ORDER BY id").all();
  const update = db.prepare("UPDATE amazon_picks SET link_status=?, link_checked_at=? WHERE id=?");
  const summary = { checked: 0, ok: 0, dead: 0, unknown: 0, deadIds: [] };

  for (const [index, pick] of picks.entries()) {
    const result = await checkOne(pick.url, fetchImpl);
    update.run(result.status, new Date(now()).toISOString(), pick.id);
    summary.checked += 1;
    summary[result.status] += 1;
    if (result.status === "dead") summary.deadIds.push(pick.id);
    if (index < picks.length - 1 && spacingMs > 0) await wait(spacingMs);
  }

  return summary;
}

module.exports = { checkAmazonLinks, checkOne };
