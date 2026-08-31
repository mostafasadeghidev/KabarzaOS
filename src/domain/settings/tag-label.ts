import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

/**
 * نامِ نمایشیِ تگ.
 *
 * ⚠️ چرا تگ استثناست: R-I18N-10 می‌گوید «برچسبِ دیتابیس ترجمه نمی‌شود». تگ
 * اما سازوکارِ ترجمهٔ **خودش** را دارد — ستونِ `name_i18n` — و بدونِ آن،
 * کاربرِ انگلیسی وضعیتِ پروژه و نقشِ عضو را فارسی می‌دید. آن ستون از روزِ اول
 * در اسکیما بود ولی نه فرمی داشت نه خواننده‌ای؛ یعنی یک قابلیتِ کاملِ نسخهٔ قبلی
 * بی‌صدا غایب بود.
 */

/**
 * زبانی که ستونِ `name` به آن نوشته شده.
 *
 * ⚠️ زبانِ **پیش‌فرضِ سامانه** است، نه فارسیِ هاردکد: نصبی که پیش‌فرضش
 * انگلیسی است نامِ پایه را انگلیسی وارد می‌کند و آن‌وقت فارسی هم فقط یکی از
 * زبان‌های ترجمه‌شدنی است.
 *
 * ⚠️ دام: عوض‌کردنِ زبانِ پیش‌فرض **بعد از** ساختِ تگ‌ها، معنیِ نام‌های
 * ذخیره‌شده را عوض می‌کند (خودشان ترجمه نمی‌شوند). نسخهٔ قبلی هم همین را
 * هشدار داده.
 */
export type TagI18n = Record<string, string> | null | undefined;

export interface LabelledTag {
  name: string;
  nameI18n?: TagI18n;
}

/** نگاشتِ زبان←نام، پاک‌شده از زبانِ ناشناخته و مقدارِ خالی. */
export function cleanI18nMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const text = String(value ?? '').trim();
    if (text === '' || !isLocale(key)) continue;
    out[key] = text;
  }
  return out;
}

/**
 * ترتیبِ حل — دقیقاً همان چهار پلهٔ نسخهٔ قبلی:
 *   ۱. ترجمهٔ همان زبان
 *   ۲. اگر بیننده زبانِ پایه را می‌بیند، خودِ نامِ پایه
 *   ۳. انگلیسی به‌عنوان پلِ میان‌زبانی
 *   ۴. نامِ پایه
 */
export function tagLabel(
  tag: LabelledTag,
  locale: Locale,
  baseLocale: Locale = DEFAULT_LOCALE,
): string {
  const map = cleanI18nMap(tag.nameI18n);

  if (map[locale]) return map[locale];
  if (baseLocale === locale) return tag.name;
  // ⚠️ انگلیسی پلِ پیش‌فرض است: کاربرِ کردی که ترجمهٔ کردی ندارد، انگلیسی
  // را بهتر از فارسی می‌خواند.
  if (map.en) return map.en;
  return tag.name;
}
