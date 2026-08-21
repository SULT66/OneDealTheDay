import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/**
 * The OneDailyDrop Score as a ring.
 *
 * The number is always printed inside, so the ring is reinforcement rather than
 * the only carrier of the value — the arc alone would fail for anyone who
 * cannot judge it by eye.
 */
export function ScoreRing({
  score,
  language,
  size = 88,
  className,
}: {
  score: number;
  language: string;
  size?: number;
  className?: string;
}) {

  const stroke = size >= 80 ? 8 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--lime-deep)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-bold tnum text-fg"
          style={{ fontSize: size * 0.3 }}
        >
          {clamped}
        </span>
        <span
          className="mt-0.5 font-medium text-fg-subtle"
          style={{ fontSize: Math.max(9, size * 0.12) }}
        >
          /100
        </span>
      </span>

      <span className="sr-only">
        {t(language, "app.card.scoreOutOf", { score: clamped })}
      </span>
    </div>
  );
}
