"use client";

import {useCopy} from "@/components/site/CopyProvider";

export default function PageError({reset}: {error: Error; reset: () => void}) {
  const tr = useCopy();
  return <div role="alert" className="mx-auto max-w-xl px-6 py-16 text-center">
    <h1 className="text-2xl font-bold">{tr("app.navigation.failed")}</h1>
    <button onClick={reset} className="mt-6 rounded-full bg-lime px-6 py-3 font-semibold text-ink">
      {tr("app.navigation.retry")}
    </button>
  </div>;
}
