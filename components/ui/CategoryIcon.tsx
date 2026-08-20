import {
  Armchair,
  Bed,
  Bicycle,
  Car,
  CookingPot,
  Desktop,
  Gift,
  Headphones,
  HouseLine,
  PawPrint,
  Package,
  SuitcaseRolling,
  Television,
  WashingMachine,
  Wrench,
} from "@phosphor-icons/react/ssr";

/**
 * Explicit name → component map rather than a dynamic import, so the bundler
 * can see exactly which icons ship. `icon` values come from data/categories.json.
 */
const ICONS = {
  Armchair,
  Bed,
  Bicycle,
  Car,
  CookingPot,
  Desktop,
  Gift,
  Headphones,
  HouseLine,
  PawPrint,
  SuitcaseRolling,
  Television,
  WashingMachine,
  Wrench,
} as const;

export function CategoryIcon({
  name,
  size = 28,
  className,
  weight = "duotone",
}: {
  name: string;
  size?: number;
  className?: string;
  weight?: "regular" | "bold" | "duotone" | "fill";
}) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Package;
  // Decorative: every tile pairs this with a visible text label.
  return (
    <Icon size={size} weight={weight} className={className} aria-hidden="true" />
  );
}
