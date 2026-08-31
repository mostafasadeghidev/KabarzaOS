'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * تم — روشن / تیره / مطابق سیستم.
 *
 * ترجیح در localStorage می‌ماند و روی `<html>` به‌صورتِ کلاسِ `dark` اعمال
 * می‌شود. اسکریپتِ کوچکی در layout قبل از رندر اجرا می‌شود تا صفحه با
 * رنگِ اشتباه چشمک نزند.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'kabarza-theme';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
});

function apply(theme: ThemePreference): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
      apply(stored);
    }
  }, []);

  // وقتی «مطابق سیستم» است، تغییرِ تنظیمِ سیستم باید بلافاصله اثر کند.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** جلوگیری از چشمکِ رنگِ اشتباه — قبل از رندرِ صفحه اجرا می‌شود. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
