'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { isLocale, translate, type Locale, type MessageKey } from './index';

interface LanguageContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const Language = createContext<LanguageContext | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cindermic-language');
      if (isLocale(saved)) {
        updateLocale(saved);
        document.documentElement.lang = saved;
      }
    } catch {}
  }, []);

  function setLocale(next: Locale) {
    updateLocale(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem('cindermic-language', next);
    } catch {}
  }

  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);
  return <Language.Provider value={{ locale, setLocale, t }}>{children}</Language.Provider>;
}

export function useLanguage() {
  const value = useContext(Language);
  if (!value) throw new Error('LanguageProvider is missing.');
  return value;
}
