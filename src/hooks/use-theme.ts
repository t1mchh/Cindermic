'use client';

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(saved);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', saved === 'dark' ? '#101114' : '#f0f1e9');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#101114' : '#f0f1e9');
    try {
      localStorage.setItem('cindermic-theme', next);
    } catch {}
  }

  return { theme, toggleTheme };
}
