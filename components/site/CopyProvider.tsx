"use client";

import { createContext, useCallback, useContext } from "react";
import { appCopy } from "@/src/i18n-app";

/*
 * Translations for components that run in the browser.
 *
 * Server components read the language from the request (lib/i18n.ts). A
 * client component cannot, so the Live page, the price band, the chat and the
 * sign-up forms were written in English and stayed English on a Spanish page.
 * The market layout knows the language and hands it down here; the words come
 * from the same dictionary as everything else (src/i18n-app.js), falling back
 * to English key by key.
 */

type Copy = (key: string, variables?: Record<string, string | number>) => string;

const dictionaries = appCopy as Record<string, Record<string, string>>;

const LanguageContext = createContext("en");

export function CopyProvider({ language, children }: { language: string; children: React.ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): string {
  return useContext(LanguageContext);
}

export function useCopy(): Copy {
  const language = useContext(LanguageContext);
  return useCallback(
    (key, variables = {}) => {
      const template = dictionaries[language]?.[key] ?? dictionaries.en?.[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? ""));
    },
    [language],
  );
}
