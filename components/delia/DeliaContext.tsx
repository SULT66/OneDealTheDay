"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DeliaPanel } from "./DeliaPanel";

type DeliaState = {
  open: boolean;
  /** A question handed in by a trigger, e.g. "Is this Milwaukee kit a good price?" */
  seed: string | null;
  market: string;
  openDelia: (seed?: string) => void;
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
  children,
}: {
  market: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);

  const openDelia = useCallback((next?: string) => {
    setSeed(next ?? null);
    setOpen(true);
  }, []);

  const closeDelia = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, seed, market, openDelia, closeDelia }),
    [open, seed, market, openDelia, closeDelia],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <DeliaPanel />
    </Ctx.Provider>
  );
}
