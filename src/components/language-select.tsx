import { Globe2 } from 'lucide-react';
import { useLanguage } from '@/i18n/provider';
import { isLocale } from '@/i18n';

export function LanguageSelect() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <label className="language-select" title={t('language')}>
      <Globe2 size={15} aria-hidden="true" />
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLocale(event.target.value);
        }}
      >
        <option value="en">EN</option>
        <option value="de">DE</option>
        <option value="ru">RU</option>
      </select>
    </label>
  );
}
