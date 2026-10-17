"use client";

import {createContext, useContext, useTransition, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {useCopy} from "./CopyProvider";

const Context = createContext<{
  pending: boolean;
  navigate: (href: string, options?: {replace?: boolean; scroll?: boolean}) => void;
} | null>(null);

export function NavigationProgress({children}: {children: ReactNode}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tr = useCopy();
  const navigate = (href: string, options: {replace?: boolean; scroll?: boolean} = {}) => {
    startTransition(() => {
      if (options.replace) router.replace(href, {scroll: options.scroll});
      else router.push(href, {scroll: options.scroll});
    });
  };
  return <Context.Provider value={{pending, navigate}}>
    {pending && <div role="status" aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] bg-lime px-4 py-2 text-center text-sm font-semibold text-ink">
      {tr("app.navigation.loading")}
    </div>}
    {children}
  </Context.Provider>;
}

export function useNavigationProgress() {
  const value = useContext(Context);
  if (!value) throw new Error("NavigationProgress required");
  return value;
}
