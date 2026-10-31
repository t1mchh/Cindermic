import { en, type MessageKey, type Messages } from './en';
import { de } from './de';
import { ru } from './ru';

export const languages = ['en', 'de', 'ru'] as const;
export type Locale = (typeof languages)[number];
export type { MessageKey, Messages };
export const catalogs: Record<Locale, Messages> = { en, de, ru };

export function isLocale(value: string | null | undefined): value is Locale {
  return languages.includes(value as Locale);
}

export function translate(locale: Locale, key: MessageKey) {
  return catalogs[locale][key];
}
