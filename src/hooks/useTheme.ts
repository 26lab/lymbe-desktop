import { useEffect } from 'react';
import type { Settings } from '../lib/types';

/**
 * Applies the user's theme choice to <html> via the `data-theme` attribute
 * + Tailwind's `dark:` variant. "system" follows prefers-color-scheme.
 */
export function useTheme(theme: Settings['theme']) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark =
        theme === 'dark' || (theme === 'system' && mq.matches);
      root.classList.toggle('dark', dark);
      root.dataset.theme = dark ? 'dark' : 'light';
    };

    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
}
