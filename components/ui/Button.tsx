import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * The reference brand speaks in fully-round pills: solid black for the primary
 * action, lime for the one action we most want taken, hairline outline for
 * everything else.
 *
 * `primary` uses the inverse-surface token rather than a literal black so the
 * same button reads correctly in dark mode.
 */

export type ButtonVariant = "primary" | "accent" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-surface-inverse text-fg-on-inverse hover:opacity-88 active:scale-[0.98]",
  accent: "bg-lime text-ink hover:bg-lime-deep active:scale-[0.98]",
  outline:
    "border border-border-strong text-fg hover:bg-surface-2 active:scale-[0.98]",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
};

const SIZES: Record<ButtonSize, string> = {
  // Every size clears the 44px minimum touch target.
  sm: "h-11 px-4 text-sm gap-1.5",
  md: "h-12 px-6 text-[0.95rem] gap-2",
  lg: "h-14 px-8 text-base gap-2.5",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium",
    "cursor-pointer select-none whitespace-nowrap",
    "transition-[background-color,color,opacity,transform] duration-200",
    "disabled:opacity-45 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...rest}
    />
  );
}
