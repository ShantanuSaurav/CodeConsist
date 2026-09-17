import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    writeString(STORAGE_KEYS.theme, theme);
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
