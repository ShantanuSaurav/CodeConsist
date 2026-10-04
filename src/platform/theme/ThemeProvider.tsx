import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS, readString, writeString } from '../storage/storage';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Light/dark, persisted under `cq-theme`. Tailwind's dark variant keys off the
 * `.dark` class and the component CSS off `data-theme`; the flash-prevention
 * script in index.html sets both before React loads.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (readString(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'));
  /** The theme last put on <html>; null until the first mount has run. */
  const applied = useRef<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    // A toggle would otherwise run every themed transition at once. Swap with
    // transitions off (index.css) and turn them back on two frames later, once
    // the new colours have painted. The first mount only confirms what
    // index.html already set, so it is left alone.
    let frame = 0;
    if (applied.current !== null && applied.current !== theme) {
      root.classList.add('theme-switching');
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => root.classList.remove('theme-switching'));
      });
    }
    applied.current = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    writeString(STORAGE_KEYS.theme, theme);
    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove('theme-switching');
    };
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
