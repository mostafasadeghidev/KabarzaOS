'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  isPalette, isTheme, PALETTE_STORAGE_KEY, PALETTES, THEME_STORAGE_KEY, type Palette, type ThemePreference,
} from '@/domain/people/appearance';
import { saveAppearanceAction } from '@/app/(app)/_actions/appearance';

/**
 * تم — روشن / تیره / مطابق سیستم، و پالتِ رنگ.
 *
 * ترجیح **روی کاربر** ذخیره می‌شود (مهاجرتِ 0033، پورتِ `_kteam_theme`) و
 * localStorage فقط حافظهٔ مرورگر است: برای صفحه‌های عمومی (ورود) و برای
 * کاربری که هنوز انتخابی نکرده. کلاسِ `dark` روی `<html>` می‌نشیند؛ اسکریپتِ
 * کوچکی در layout قبل از رندر اجرا می‌شود تا صفحه با رنگِ اشتباه چشمک نزند.
 *
 * ⚠️ پیش از این فقط localStorage بود: «تیره» روی لپ‌تاپ روی گوشی «روشن»
 * می‌ماند و با پاک‌کردنِ دادهٔ مرورگر گم می‌شد.
 */

export { PALETTES };
export type { Palette, ThemePreference };

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
  stone: 'oklch(0.54 0.17 254)',
  ocean: 'oklch(0.52 0.12 220)',
  forest: 'oklch(0.52 0.12 155)',
  sunset: 'oklch(0.55 0.16 40)',
  violet: 'oklch(0.55 0.19 300)',
  slate: 'oklch(0.45 0 0)',
};

const STORAGE_KEY = THEME_STORAGE_KEY;
const PALETTE_KEY = PALETTE_STORAGE_KEY;

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

/** localStorage در حالتِ خصوصیِ مرورگر خطا می‌دهد؛ ظاهر نباید صفحه را بشکند. */
function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* بی‌خیال */ }
}

export function ThemeProvider({
  initial,
  signedIn = false,
  children,
}: {
  /** ترجیحِ ذخیره‌شده روی کاربر؛ خالی = انتخابی نکرده (ترجیحِ مرورگر). */
  initial?: { theme: ThemePreference | ''; palette: Palette | '' };
  /** کاربرِ واردشده؟ فقط آن‌وقت تغییر روی سرور هم ذخیره می‌شود. */
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initial?.theme || 'system');
  const [palette, setPaletteState] = useState<Palette>(initial?.palette || 'stone');

  useEffect(() => {
    /**
     * ⚠️ ترجیحِ سرور بر مرورگر مقدم است؛ مرورگر فقط وقتی حرف می‌زند که
     * کاربر روی حسابش چیزی انتخاب نکرده باشد. اسکریپتِ پیش از رندر همین
     * ترتیب را دارد، پس این‌جا فقط state با صفحه هم‌گام می‌شود.
     */
    const stored = initial?.theme || readStored(STORAGE_KEY);
    if (isTheme(stored)) {
      setThemeState(stored);
      apply(stored);
    }
    const storedPalette = initial?.palette || readStored(PALETTE_KEY);
    if (isPalette(storedPalette)) {
      setPaletteState(storedPalette);
      document.documentElement.dataset.palette = storedPalette;
    }
  }, [initial?.theme, initial?.palette]);

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
    writeStored(STORAGE_KEY, next);
    apply(next);
    // ⚠️ شکستِ ذخیره روی سرور ظاهرِ همین صفحه را برنمی‌گرداند؛ فقط دستگاهِ دیگر آن را نمی‌بیند.
    if (signedIn) void saveAppearanceAction({ theme: next }).catch(() => {});
  }, [signedIn]);

  const setPalette = useCallback((next: Palette) => {
    setPaletteState(next);
    writeStored(PALETTE_KEY, next);
    document.documentElement.dataset.palette = next;
    if (signedIn) void saveAppearanceAction({ palette: next }).catch(() => {});
  }, [signedIn]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
