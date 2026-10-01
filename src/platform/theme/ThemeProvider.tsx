import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from '@/ui';
import { STORAGE_KEYS, readString, writeString } from '../storage/storage';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Light/dark, persisted under `cq-theme`. Tailwind's dark variant keys off the
 * `.dark` class and the component CSS off `data-theme`; the flash-prevention
 * script in index.html sets both before React loads.
 *
 * Switching cross-fades the whole window (document.startViewTransition, timed
 * in components.css) where the browser supports it and motion is welcome;
 * everywhere else the swap is instant. Either way per-element colour
 * transitions are held off for the swap (data-theme-switching, tokens.css),
 * so the page changes as one piece instead of rippling.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => (readString(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'));
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // Counts swaps, so only the latest one may lift data-theme-switching.
  const switchGen = useRef(0);

  useEffect(() => {
    applyTheme(theme);
    writeString(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    if (next === themeRef.current) return;
    // Record the target now, so a second toggle mid-fade goes back rather than repeating.
    themeRef.current = next;
    const root = document.documentElement;
    // A second toggle mid-fade skips this transition, but its `finished` still
    // settles; a stale release must not bring transitions back under the new fade.
    const gen = ++switchGen.current;
    const release = () => {
      if (gen === switchGen.current) root.removeAttribute('data-theme-switching');
    };
    root.setAttribute('data-theme-switching', '');

    if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
      try {
        document
          .startViewTransition(() => {
            applyTheme(next);
            // The new icon and label belong in the "after" snapshot too.
            flushSync(() => setThemeState(next));
          })
          .finished.then(release, release);
        return;
      } catch {
        /* fall through to the instant swap */
      }
    }
    applyTheme(next);
    setThemeState(next);
    // Two frames: the new colours have painted before transitions come back.
    requestAnimationFrame(() => requestAnimationFrame(release));
  }, []);

  const toggleTheme = useCallback(() => setTheme(themeRef.current === 'light' ? 'dark' : 'light'), [setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
