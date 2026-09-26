"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ClockCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { useCopy } from "./CopyProvider";

type TermSuggestion = { term: string; count: number; url: string };
type CategorySuggestion = { value: string; label: string; count: number; url: string };
type ProductSuggestion = {
  id: number;
  title: string;
  price: string | null;
  was: string | null;
  retailer: string | null;
  image: string | null;
  url: string;
};
type Answer = {
  query: string;
  /* What was actually searched, when a near miss answered where the words as
     typed found nothing. See src/searchFallback.js. */
  searched_query?: string;
  corrected_from?: string | null;
  terms: TermSuggestion[];
  categories: CategorySuggestion[];
  products: ProductSuggestion[];
  total: number;
  all_url: string;
};

/* Long enough that typing a word is one request rather than six, short enough
   that the list is there by the time the finger leaves the key. */
const DEBOUNCE_MS = 140;
/* Two letters is where a suggestion starts being about something. */
const MIN_QUERY = 2;
const RECENT_KEY = "odd_recent_searches";
const RECENT_LIMIT = 5;

function readRecent(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter(item => typeof item === "string").slice(0, RECENT_LIMIT)
      : [];
  } catch {
    /* Private windows, blocked storage, a thumbnail capture: no history is a
       fine state for a search box to be in. */
    return [];
  }
}

/** The part already typed, so the eye can see what the suggestion adds. */
function splitOnTyped(term: string, typed: string) {
  const head = typed.trim().toLowerCase();
  if (head && term.toLowerCase().startsWith(head)) {
    return [term.slice(0, head.length), term.slice(head.length)] as const;
  }
  return ["", term] as const;
}

/**
 * Free-text search. Hands off to the same `q` parameter the category pages and
 * Delia use, so all three routes end in one shared filter state.
 *
 * It is a real GET form, not a handler bolted to a div. It used to have no
 * action and no name on the field, so it worked only once React had hydrated;
 * before that — and on any page where hydration failed or was still on its way
 * — submitting sent the browser to the current URL carrying nothing, and the
 * query silently vanished. A reviewer typed "65 inch TV", pressed Search, and
 * landed back on the homepage with an empty box, which is the single worst
 * thing a search box can do.
 *
 * With action, method and name in place the browser alone reaches the right
 * page with the right query; the submit handler is now only the faster
 * client-side route when the script is ready.
 *
 * The dropdown sits on top of all that and changes none of it. What it shows
 * comes from /api/search/suggest, which answers out of the catalogue we
 * actually carry: the phrases listings were found by, the aisles they sit in,
 * and the listings themselves with their prices. Nobody has to guess our
 * vocabulary and press Enter to learn they guessed wrong. If the request
 * fails, or the script never runs, the form is exactly what it was.
 */
export function SearchBox({
  market,
  label,
  action,
  className,
}: {
  market: string;
  /** Both required: this is a client component, so it cannot read the
      language itself, and hard-coded English here was the most visible half of
      "switching language changes nothing" — the search box sits at the top of
      every page. */
  label: string;
  action: string;
  className?: string;
}) {
  const router = useRouter();
  const copy = useCopy();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  const typed = value.trim();

  /* Everything offered, as one list: this is what the arrow keys walk and what
     Enter picks from, so it has to exist as a list and not only as markup. */
  const options = useMemo(() => {
    if (typed.length < MIN_QUERY) {
      return recent.map(term => ({
        key: `recent:${term}`,
        href: `/${market}/search?q=${encodeURIComponent(term)}`,
        term,
      }));
    }
    if (!answer) return [];
    return [
      ...answer.terms.map(item => ({ key: `term:${item.term}`, href: item.url, term: item.term })),
      ...answer.categories.map(item => ({ key: `category:${item.value}`, href: item.url, term: typed })),
      ...answer.products.map(item => ({ key: `product:${item.id}`, href: item.url, term: typed })),
      ...(answer.total > answer.products.length
        ? [{ key: "all", href: answer.all_url, term: typed }]
        : []),
    ];
  }, [answer, market, recent, typed]);

  const remember = useCallback(
    (query: string) => {
      const term = query.trim();
      if (!term) return;
      const next = [term, ...recent.filter(item => item !== term)].slice(0, RECENT_LIMIT);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* The search still works; only the memory of it is lost. */
      }
    },
    [recent],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  /* The suggestions themselves. An answer that arrives after the shopper has
     typed past it is not an answer, so it is dropped rather than shown. */
  useEffect(() => {
    if (typed.length < MIN_QUERY) {
      setAnswer(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/search/suggest?q=${encodeURIComponent(typed)}&market=${encodeURIComponent(market)}`,
        { signal: controller.signal },
      )
        .then(response => (response.ok ? response.json() : null))
        .then((body: Answer | null) => {
          if (!body || body.query.trim().toLowerCase() !== typed.toLowerCase()) return;
          setAnswer(body);
          setActive(-1);
        })
        .catch(() => {
          /* Aborted, offline, or a backend having a bad minute. The form below
             still submits and the results page still answers. */
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [market, typed]);

  /* A click anywhere else is a decision not to pick anything. */
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(current => {
        const next = current + step;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" && active >= 0) {
      /* Picking a suggestion is not submitting the query that produced it. */
      event.preventDefault();
      const option = options[active];
      remember(option.term);
      close();
      router.push(option.href);
    }
  };

  const showDropdown = open && (options.length > 0 || (typed.length >= MIN_QUERY && answer !== null));
  const optionId = (index: number) => `${listId}-option-${index}`;

  const row = (key: string, href: string, term: string, children: React.ReactNode) => {
    const index = options.findIndex(option => option.key === key);
    return (
      <li key={key}>
        <Link
          href={href}
          id={optionId(index)}
          role="option"
          aria-selected={index === active}
          /* Down on the mouse blurs the input; without this the list would be
             gone before the click landed on it. */
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => {
            remember(term);
            close();
          }}
          className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${
            index === active ? "bg-surface-2" : ""
          }`}
        >
          {children}
        </Link>
      </li>
    );
  };

  const heading = (text: string) => (
    <li
      aria-hidden="true"
      className="px-3 pb-1 pt-3 text-[0.7rem] font-semibold uppercase tracking-wider text-fg-subtle"
    >
      {text}
    </li>
  );

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <form
        role="search"
        action={`/${market}/search`}
        method="get"
        onSubmit={e => {
          e.preventDefault();
          const q = value.trim();
          remember(q);
          close();
          router.push(q ? `/${market}/search?q=${encodeURIComponent(q)}` : `/${market}`);
        }}
      >
        <div className="flex h-12 items-center gap-2 rounded-full border border-border bg-surface pl-4 pr-1.5 transition-colors focus-within:border-border-strong">
          <MagnifyingGlass
            size={18}
            weight="bold"
            className="shrink-0 text-fg-subtle"
            aria-hidden="true"
          />
          <label htmlFor="site-search" className="sr-only">
            {label}
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            value={value}
            onChange={e => {
              setValue(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={label}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            // h-full so the tap target is the whole 48px pill, not the ~23px
            // intrinsic height of the text box.
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-subtle"
          />
          <button
            type="submit"
            className="hidden h-9 cursor-pointer items-center rounded-full bg-surface-inverse px-4 text-sm font-medium text-fg-on-inverse transition-opacity hover:opacity-88 sm:inline-flex"
          >
            {action}
          </button>
        </div>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface py-1 shadow-xl">
          <ul id={listId} role="listbox" aria-label={copy("app.search.suggestions")}>
            {typed.length < MIN_QUERY && recent.length > 0 && (
              <>
                {heading(copy("app.search.recent"))}
                {recent.map(term =>
                  row(`recent:${term}`, `/${market}/search?q=${encodeURIComponent(term)}`, term, (
                    <>
                      <ClockCounterClockwise
                        size={16}
                        className="shrink-0 text-fg-subtle"
                        aria-hidden="true"
                      />
                      <span className="truncate text-fg">{term}</span>
                    </>
                  )),
                )}
              </>
            )}

            {typed.length >= MIN_QUERY && answer?.corrected_from && (
              <li className="px-3 pb-1 pt-3 text-xs text-fg-subtle">
                {copy("app.search.correctedTo", { corrected: answer.searched_query || "" })}
              </li>
            )}

            {typed.length >= MIN_QUERY && answer && answer.terms.length > 0 && (
              <>
                {heading(copy("app.search.suggestions"))}
                {answer.terms.map(item => {
                  const [head, tail] = splitOnTyped(item.term, typed);
                  return row(`term:${item.term}`, item.url, item.term, (
                    <>
                      <MagnifyingGlass
                        size={16}
                        className="shrink-0 text-fg-subtle"
                        aria-hidden="true"
                      />
                      <span className="truncate text-fg">
                        {head}
                        <strong className="font-semibold">{tail}</strong>
                      </span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-subtle">
                        {item.count}
                      </span>
                    </>
                  ));
                })}
              </>
            )}

            {typed.length >= MIN_QUERY && answer && answer.categories.length > 0 && (
              <>
                {heading(copy("app.search.inCategories"))}
                {answer.categories.map(item =>
                  row(`category:${item.value}`, item.url, typed, (
                    <>
                      <span className="truncate text-fg">{item.label}</span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-subtle">
                        {item.count}
                      </span>
                    </>
                  )),
                )}
              </>
            )}

            {typed.length >= MIN_QUERY && answer && answer.products.length > 0 && (
              <>
                {heading(copy("app.search.matches"))}
                {answer.products.map(item =>
                  row(`product:${item.id}`, item.url, typed, (
                    <>
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain"
                        />
                      ) : (
                        <span
                          className="h-10 w-10 shrink-0 rounded-lg border border-border"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{item.title}</span>
                        {item.retailer && (
                          <span className="block truncate text-xs text-fg-subtle">{item.retailer}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-fg">
                          {item.price}
                        </span>
                        {item.was && (
                          <span className="block text-xs tabular-nums text-fg-subtle line-through">
                            {item.was}
                          </span>
                        )}
                      </span>
                    </>
                  )),
                )}
              </>
            )}

            {typed.length >= MIN_QUERY && answer && answer.total > answer.products.length &&
              row("all", answer.all_url, typed, (
                <>
                  <span className="text-fg">{copy("app.search.seeAll", { count: answer.total })}</span>
                  <ArrowUpRight size={16} className="ml-auto shrink-0 text-fg-subtle" aria-hidden="true" />
                </>
              ))}

            {typed.length >= MIN_QUERY &&
              answer &&
              !answer.terms.length &&
              !answer.categories.length &&
              !answer.products.length && (
                <li className="px-3 py-3 text-sm text-fg-subtle">
                  {copy("app.search.noneYet", { query: typed })}
                </li>
              )}
          </ul>
        </div>
      )}
    </div>
  );
}
