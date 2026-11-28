"use client";

import { useLanguage } from "./CopyProvider";

const CATEGORY_TITLES: Record<string, string> = { en: "Categories", es: "Categorías", fr: "Catégories", de: "Kategorien" };

export function DirectoryLoading({ section }: { section: "categories" | "stores" }) {
  const language = useLanguage();
  const heading = section === "categories"
    ? (CATEGORY_TITLES[language] ?? CATEGORY_TITLES.en)
    : language === "es" ? "Tiendas con las que trabajamos" : "Stores we work with";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6" aria-busy="true">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-fg">{heading}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
        {Array.from({length: 6}, (_, index) => (
          <div key={index} className="h-24 rounded-tile border border-border bg-surface-2 motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}
