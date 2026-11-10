import React, { createContext, useContext, useMemo } from "react";
import { type Locale, type Translations, getTranslations } from "./translations";

interface I18nContextValue {
  locale: Locale;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "ru",
  t: getTranslations("ru"),
});

interface I18nProviderProps {
  children: React.ReactNode;
  locale?: Locale;
}

export function I18nProvider({ children, locale = "ru" }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: getTranslations(locale),
  }), [locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useTranslations(): Translations {
  return useContext(I18nContext).t;
}

export { type Locale, type Translations };

