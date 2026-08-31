/**
 * پیکربندیِ چندزبانگی — قواعدِ docs/rules/I18N.md
 *
 * R-I18N-01 — زبانِ مبدأ فارسی است: کلیدِ هر رشته، خودِ متنِ فارسی است.
 * R-I18N-06 — سه زبانِ راست‌به‌چپ؛ جهت از زبان مشتق می‌شود، نه هاردکد.
 */

export const LOCALES = ['fa', 'en', 'ar', 'ckb', 'de', 'es', 'fr', 'pt', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fa';

/** R-I18N-06 — زبان‌های راست‌به‌چپ. */
const RTL_LOCALES = new Set<Locale>(['fa', 'ar', 'ckb']);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function direction(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

export const LOCALE_NAMES: Record<Locale, string> = {
  fa: 'فارسی',
  en: 'English',
  ar: 'العربية',
  ckb: 'کوردی',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  tr: 'Türkçe',
};

/**
 * برچسبِ BCP-47 برای `Intl` — تقویم و ارقام از همین‌جا می‌آیند.
 *
 * ⚠️ چرا نگاشتِ صریح و نه خودِ کدِ زبان: `fa` به‌تنهایی در بعضی محیط‌ها
 * تقویمِ میلادی می‌دهد؛ `fa-IR` است که جلالی و ارقامِ فارسی می‌آورد. برعکس،
 * `ckb` باید تقویمِ میلادی بگیرد چون کاربرِ کردی تاریخِ رسمی را میلادی
 * می‌خواند. هر زبان تقویمِ خودش را دارد و حدس‌زدن از روی کدِ دوحرفی غلط
 * درمی‌آید.
 */
export const INTL_TAGS: Record<Locale, string> = {
  fa: 'fa-IR',
  en: 'en-GB',
  ar: 'ar',
  ckb: 'ckb-IQ',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-PT',
  tr: 'tr-TR',
};

export function intlTag(locale: Locale): string {
  return INTL_TAGS[locale];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** زبانِ معتبر از یک مقدارِ دلخواه (هدرِ مرورگر، تنظیمِ کاربر). */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const base = value.toLowerCase().split('-')[0] ?? '';
  if (isLocale(value)) return value;
  if (isLocale(base)) return base;
  return DEFAULT_LOCALE;
}
