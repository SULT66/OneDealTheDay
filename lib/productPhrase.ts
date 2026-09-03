/**
 * A product named the way a shopper would name it.
 *
 * Retailer titles are written for a search box rather than by one: eighty
 * characters of specification, an "Open Box -" prefix describing the sale
 * instead of the thing, parenthetical asides aimed at a search engine, and the
 * word that says what it actually is left until the very end.
 *
 * Handed to a search whole, that many terms match nothing. "Is Power Bank
 * 20000mAh 45W Charging Portable External Battery Backup For Cell Phone a good
 * price?" came back with no shop selling it, asked from that power bank's own
 * page. The same product asked for as "a power bank under $40" came back
 * first.
 *
 * So a question asked from a product page uses this: the brand, the front of
 * the title, and its last few words, which is where the noun lives.
 */
export function productPhrase(title: string, brand?: string | null): string {
  const trim = (value: string) => value.replace(/^[\s,\-–—:;.]+|[\s,\-–—:;.]+$/g, "").trim();

  const cleaned = String(title || "")
    .replace(/\s+/g, " ")
    .replace(/^open box\s*[-–—]\s*/i, "")
    .replace(/\([^)]*\)/g, " ")
    .trim();

  /* A short title is already a phrase; only a long one needs its front and its
     back, and taking the front alone dropped "Headset" from a nine-word one. */
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const words =
    parts.length <= 10
      ? trim(parts.join(" "))
      : trim(`${trim(parts.slice(0, 6).join(" "))} ${trim(parts.slice(-3).join(" "))}`);

  const name = String(brand || "").trim();
  /* Most retailer titles already open with the brand; repeating it only
     narrows the search for nothing. */
  const alreadyNamed =
    name && new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(words);

  return trim(!name || alreadyNamed ? words : `${name} ${words}`).slice(0, 160);
}
