import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Small status label. `accent` marks a saving, `solid` a rank, `muted` a
 * category — each pairs an icon or word with the colour so the meaning never
 * rests on colour alone.
 */

type PillTone = "accent" | "solid" | "muted" | "outline";

const TONES: Record<PillTone, string> = {
  accent: "bg-lime text-ink",
  solid: "bg-surface-inverse text-fg-on-inverse",
  muted: "bg-surface-2 text-fg-muted border border-border",
  outline: "border border-border-strong text-fg-muted",
};

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
        "text-xs font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
