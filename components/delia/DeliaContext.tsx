"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { measure, pageType } from "@/lib/measure";
import { useUiCopy } from "@/components/site/CopyProvider";

const DeliaPanel = dynamic(() => import("./DeliaPanel").then(module => module.DeliaPanel), {
  ssr: false,
  loading: () => <DeliaLoading />,
});

// Keep the opening feedback in the small provider bundle. The full chat and
// its account/history code can still load only when somebody needs them.
function DeliaLoading() {
  const { open, closeDelia } = useDelia();
  const ui = useUiCopy();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDelia();
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, [open, closeDelia]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/55 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delia-loading-title"
        aria-busy="true"
        className="relative flex h-dvh w-full flex-col bg-surface sm:h-[min(880px,92dvh)] sm:max-w-4xl sm:rounded-3xl">
        <div className="flex h-14 shrink-0 items-center justify-between px-5">
          <h2 id="delia-loading-title" className="font-semibold">Delia</h2>
          <button ref={closeRef} type="button" aria-label={ui("Close Delia")} onClick={closeDelia}
            className="h-10 w-10 rounded-lg text-xl hover:bg-bg">×</button>
        </div>
        <p role="status" className="m-auto px-5 text-sm text-fg-muted">{ui("Opening Delia…")}</p>
      </div>
    </div>
  );
}

type DeliaState = {
  open: boolean;
  /** A question handed in by a trigger, e.g. "Is this Milwaukee kit a good price?" */
  seed: string | null;
  /**
   * The catalogue product a trigger opened Delia about, so the question can
   * name it by id rather than by its full retailer title. Kept for the rest of
   * the conversation: a follow-up like "does it charge wirelessly?" is about
   * the same product.
   */
  seedProductId: string | null;
  market: string;
  language?: string;
  openDelia: (seed?: string, productId?: string) => void;
  closeDelia: () => void;
};

const Ctx = createContext<DeliaState | null>(null);

export function useDelia(): DeliaState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDelia must be used inside <DeliaProvider>");
  return ctx;
}

/**
 * Holds Delia's open state for the whole market subtree, so a trigger anywhere
 * — header, hero, a deal card — opens the one panel instance.
 */
export function DeliaProvider({
  market,
  language = "en",
  children,
}: {
  market: string;
  language?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Keep the panel mounted after its first use so closing it preserves drafts
  // and conversation state, without loading its code for ordinary browsing.
  const [activated, setActivated] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const [seedProductId, setSeedProductId] = useState<string | null>(null);

  const openDelia = useCallback((next?: string, productId?: string) => {
    setActivated(true);
    setSeed(next ?? null);
    setSeedProductId(productId ?? null);
    setOpen(true);
    /* Every trigger on the site — header, hero, a deal card — comes through
       here, so one call covers them all, and `page_type` is what says which
       of them it was. Opening the panel is not asking it anything; the
       question is a separate event, and the gap between the two is the
       interesting number. */
    measure("delia_open", {
      page_type: pageType(window.location.pathname),
      item_id: productId || undefined,
      seeded: Boolean(next),
    });
  }, []);

  const closeDelia = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, seed, seedProductId, market, language, openDelia, closeDelia }),
    [open, seed, seedProductId, market, language, openDelia, closeDelia],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {activated && <DeliaPanel />}
    </Ctx.Provider>
  );
}
