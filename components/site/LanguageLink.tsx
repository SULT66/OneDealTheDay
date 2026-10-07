"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

// Layouts persist across navigation; derive the destination from the current URL.
export function LanguageLink({ code, href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { code: string }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const params = new URLSearchParams(query.toString());
  params.set("lang", code);
  const target = `${pathname}?${params}`;
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const current = new URL(window.location.href);
    current.searchParams.set("lang", code);
    window.location.assign(current.toString());
  }
  return <a {...props} href={target || href} onClick={navigate}>{children}</a>;
}
