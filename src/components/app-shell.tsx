import { useLanguage } from '@/i18n/provider';
import { LanguageSelect } from './language-select';
import { Headphones, Mic, Moon, Sun, CircleHelp } from 'lucide-react';
import type { Panel } from '@/lib/types';
import type { Theme } from '@/hooks/use-theme';

interface Props {
  panel: Panel;
  onPanelChange: (panel: Panel) => void;
  phone: boolean;
  theme: Theme;
  onThemeChange: () => void;
  children: React.ReactNode;
}

export function AppShell({ panel, onPanelChange, phone, theme, onThemeChange, children }: Props) {
  const { t } = useLanguage();
  const navigation = [
    { id: 'mic', label: t('navMic'), icon: Mic },
    { id: 'output', label: t('navOutput'), icon: Headphones },
    { id: 'setup', label: t('navGuide'), icon: CircleHelp },
  ] as const;
  return (
    <div className={`app-shell ${phone ? 'phone-mode' : ''}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label={t('home')}>
          <img src="/app-icon.png" alt="" width={36} height={36} />
          <strong>Cindermic</strong>
        </a>
        <div className="header-actions">
          <LanguageSelect />
          <button
            className="icon-button"
            onClick={onThemeChange}
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <nav className="app-navigation" aria-label={t('navMain')} data-testid="main-navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onPanelChange(id)}
            aria-label={label}
            aria-current={panel === id ? 'page' : undefined}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <main className="page-content">{children}</main>
    </div>
  );
}
