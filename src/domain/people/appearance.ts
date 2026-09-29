/**
 * ظاهرِ اپ — روشن/تیره و پالت.
 *
 * ⚠️ این‌جا تنها منبعِ فهرست‌هاست: هم قیدِ پایگاه‌داده (مهاجرتِ 0033)، هم
 * اکشنِ ذخیره و هم منوی حساب همین‌ها را می‌خوانند. مقدارِ ناشناخته هرگز
 * نوشته نمی‌شود، چون اسکریپتِ پیش از رندر آن را بی‌واسطه در صفحه می‌گذارد.
 */

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

/**
 * پالت — محورِ **دوم** کنارِ روشن/تیره، نه جایگزینش.
 *
 * ⚠️ هر پالت در هر دو حالتِ روشن و تیره تعریف شده است، پس این دو انتخاب
 * در هم ضرب می‌شوند: «دریا + تیره» یعنی دریای تیره، نه اینکه یکی دیگری
 * را باطل کند.
 */
export const PALETTES = ['stone', 'ocean', 'forest', 'sunset', 'violet', 'slate'] as const;
export type Palette = (typeof PALETTES)[number];

export function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}

/**
 * ترجیحِ ذخیره‌شده روی کاربر، پاک‌سازی‌شده.
 * خالی (`''`) یعنی «کاربر هنوز انتخابی نکرده» — آن‌وقت ترجیحِ مرورگر اثر
 * می‌کند؛ این با «مطابقِ سیستم» فرق دارد.
 */
export function storedAppearance(row: { theme?: string | null; palette?: string | null }): {
  theme: ThemePreference | '';
  palette: Palette | '';
} {
  return {
    theme: isTheme(row.theme) ? row.theme : '',
    palette: isPalette(row.palette) ? row.palette : '',
  };
}

/** کلیدهای localStorage — هم اسکریپتِ پیش از رندر و هم ThemeProvider همین‌ها را می‌خوانند. */
export const THEME_STORAGE_KEY = 'kabarza-theme';
export const PALETTE_STORAGE_KEY = 'kabarza-palette';
