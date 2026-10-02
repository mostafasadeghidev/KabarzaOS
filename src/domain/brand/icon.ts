/**
 * آیکونِ برنامه (فاوآیکون، آیکونِ صفحهٔ اصلیِ گوشی) — قواعدِ خالص.
 *
 * لوگوی شرکت اگر هست، وگرنه حرفِ اولِ نامِ برند روی رنگِ اصلیِ برنامه — همان
 * نشانی که بالای سایدبار و در صفحهٔ ورود دیده می‌شود.
 */

/** فقط همین اندازه‌ها ساخته می‌شوند — اندازهٔ دلخواه یعنی کارِ دلخواهِ sharp برای هر بازدیدکننده. */
export const ICON_SIZES = [32, 180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** آیکونِ آیفون (apple-touch-icon): پس‌زمینهٔ شفاف را iOS سیاه می‌کند. */
export const APPLE_ICON_SIZE: IconSize = 180;

export function normalizeIconSize(raw: string | null | undefined): IconSize {
  const n = Number(raw);
  return (ICON_SIZES as readonly number[]).includes(n) ? (n as IconSize) : 32;
}

/**
 * حرفِ نشان. ⚠️ یک «نویسهٔ کامل» (grapheme)، نه یک واحدِ UTF-16: نامی که با
 * ایموجی یا حرفِ ترکیبی شروع شود نیم‌حرف نمی‌دهد. لاتین بزرگ می‌شود.
 */
export function iconLetter(name: string): string {
  const clean = name.trim();
  if (!clean) return 'K';
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)[Symbol.iterator]().next().value?.segment ?? clean[0]!;
  return first.toLocaleUpperCase('en');
}

/**
 * رنگِ اصلیِ برنامه به sRGB — همان `--color-primary` ِ globals.css
 * (`oklch(0.54 0.17 254)`) و متنِ رویش (`oklch(0.985 0 0)`). تصویر رنگِ CSS
 * نمی‌فهمد، پس مقدارِ تبدیل‌شده اینجاست؛ اگر رنگِ اصلی عوض شد، این هم.
 */
export const ICON_BACKGROUND = '#046dce';
export const ICON_FOREGROUND = '#fafafa';
