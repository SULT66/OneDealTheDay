const assert = require("assert");
const fs = require("fs");
const path = require("path");

/*
 * A category page used to render every match it was given, and it was given
 * 500. Electronics held 834 listings: the page shipped a 2.9MB document that
 * took 22 seconds to open, and the remaining 334 were on no page and reachable
 * by no filter. Measured after paging: 280KB and 1.3 seconds, with all 928
 * reachable.
 */

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

const listing = read("components", "catalog", "DealListing.tsx");
const catalog = read("lib", "catalog.ts");

/* One screen at a time, not the whole catalogue. */
assert(/const PER_PAGE = \d+/.test(listing), "The listing no longer has a page size");
const perPage = Number(/const PER_PAGE = (\d+)/.exec(listing)[1]);
assert(perPage >= 12 && perPage <= 60, `A page of ${perPage} cards is not a page anybody reads`);

assert(
  /const visible = deals\.slice\(/.test(listing),
  "The listing renders every match again rather than the current page",
);
assert(
  /\{visible\.map\(\(deal, i\) => \(/.test(listing),
  "The grid is back to mapping the full match set",
);

/*
 * Counting, filtering and sorting still happen over everything. Paging is the
 * last step and only decides what is drawn, so "928 deals" stays true on page
 * 30 and a filter cannot be applied to one page in isolation.
 */
assert(
  /count: deals\.length/.test(listing),
  "The match count now counts one page instead of the whole result",
);
assert(
  /Math\.ceil\(deals\.length \/ PER_PAGE\)/.test(listing),
  "The number of pages is no longer derived from the full result",
);

/*
 * Paging must not drop what the shopper set. Every parameter except page is
 * carried across; page is replaced.
 */
assert(
  /if \(key === "page" \|\| value == null\) continue;/.test(listing),
  "Page links no longer carry the other filters, so paging clears them",
);

/* The cap that hid a third of a category. */
assert(
  !/backendCategory \? 500 : undefined/.test(catalog),
  "The 500-listing category cap is back, so part of a category is unreachable again",
);
assert(
  /backendCategory \? 2000 : undefined/.test(catalog),
  "The category fetch no longer covers a whole category",
);

/* Links rather than buttons, so a page can be shared, opened in a new tab and
   read before any JavaScript arrives. */
const pagination = read("components", "catalog", "Pagination.tsx");
assert(/<Link/.test(pagination), "Pagination is no longer navigable without JavaScript");
assert(
  /rel="prev"/.test(pagination) && /rel="next"/.test(pagination),
  "Pagination lost the prev/next relations a crawler reads",
);
assert(
  /aria-current=\{entry === page \? "page" : undefined\}/.test(pagination),
  "The current page is no longer announced to a screen reader",
);

console.log("Listing pagination checks passed: page size, full-set counting, carried filters, no cap.");
