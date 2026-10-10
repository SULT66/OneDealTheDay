"use client";
import { useState } from "react";
export function CopyCoupon({ code, spanish }: {code: string; spanish: boolean}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(code); setState("copied"); }
    catch { setState("manual"); }
  }
  return <div>
    <div className="flex flex-wrap items-center gap-3">
      <code className="select-all rounded-lg border border-dashed border-border bg-bg px-3 py-2 font-mono text-lg font-bold text-fg">{code}</code>
      <button type="button" onClick={copy} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2">
        {state === "copied" ? (spanish ? "Copiado" : "Copied") : (spanish ? "Copiar código" : "Copy code")}
      </button>
    </div>
    <p role="status" className="mt-2 text-xs text-fg-muted">
      {state === "manual" ? (spanish ? "Selecciona el código y cópialo manualmente." : "Select the code and copy it manually.") : state === "copied" ? (spanish ? "Pégalo al pagar en la tienda." : "Paste it at the store checkout.") : ""}
    </p>
  </div>;
}
