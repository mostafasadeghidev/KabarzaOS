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

/**
 * پالت — محورِ **دوم** کنارِ روشن/تیره، نه جایگزینش.
 *
 * ⚠️ هر پالت در هر دو حالتِ روشن و تیره تعریف شده است، پس این دو انتخاب
 * در هم ضرب می‌شوند: «دریا + تیره» یعنی دریای تیره، نه اینکه یکی دیگری
 * را باطل کند.
 */
export const PALETTES = ['stone', 'ocean', 'forest', 'sunset', 'violet', 'slate'] as const;
export type Palette = (typeof PALETTES)[number];

export const PALETTE_LABEL: Record<Palette, string> = {
  stone: 'سنگ',
  ocean: 'دریا',
  forest: 'جنگل',
  sunset: 'غروب',
  violet: 'ارغوان',
  slate: 'خاکستری',
};

/** نقطهٔ رنگیِ هر پالت در فهرست — رنگِ اصلیِ همان پالت. */
export const PALETTE_SWATCH: Record<Palette, string> = {
  stone: 'oklch(0.55 0.18 264)',
  ocean: 'oklch(0.55 0.13 220)',
  forest: 'oklch(0.52 0.12 155)',
  sunset: 'oklch(0.58 0.16 40)',
  violet: 'oklch(0.55 0.19 300)',
  slate: 'oklch(0.45 0 0)',
};

function isPalette(value: string | null): value is Palette {
  return value !== null && (PALETTES as readonly string[]).includes(value);
}

const STORAGE_KEY = 'kabarza-theme';
const PALETTE_KEY = 'kabarza-palette';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  palette: 'stone',
  setPalette: () => {},
});

function apply(theme: ThemePreference): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [palette, setPaletteState] = useState<Palette>('stone');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
      apply(stored);
    }
    const storedPalette = localStorage.getItem(PALETTE_KEY);
    if (isPalette(storedPalette)) {
      setPaletteState(storedPalette);
      document.documentElement.dataset.palette = storedPalette;
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

  const setPalette = useCallback((next: Palette) => {
    setPaletteState(next);
    localStorage.setItem(PALETTE_KEY, next);
    document.documentElement.dataset.palette = next;
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** جلوگیری از چشمکِ رنگِ اشتباه — قبل از رندرِ صفحه اجرا می‌شود. */
/**
 * ⚠️ پیش از رندر اجرا می‌شود تا صفحه با رنگِ اشتباه چشمک نزند — و **پالت
 * هم** باید همین‌جا بنشیند، نه فقط حالتِ روشن/تیره: بدونِ آن، صفحه یک
 * لحظه با پالتِ پیش‌فرض ظاهر می‌شود و بعد می‌پرد.
 */
export const themeScript = `(function(){try{`
  + `var t=localStorage.getItem('${STORAGE_KEY}')||'system';`
  + `var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);`
  + `document.documentElement.classList.toggle('dark',d);`
  + `var p=localStorage.getItem('${PALETTE_KEY}');`
  + `if(p)document.documentElement.setAttribute('data-palette',p);`
  + `}catch(e){}})()`;
