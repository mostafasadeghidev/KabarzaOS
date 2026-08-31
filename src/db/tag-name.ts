import { sql, type SQL } from 'drizzle-orm';
import { tags } from '@/db/schema';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * نامِ تگ به زبانِ بیننده — همان ترتیبِ `tagLabel()`، ولی در **SQL**.
 *
 * ⚠️ چرا در کوئری و نه در رندر: نامِ تگ در بیش از بیست پرس‌وجو انتخاب
 * می‌شود و به شکلِ ستونِ تخت (`statusName`, `roleName`) بالا می‌آید — نه
 * به‌صورتِ شیءِ تگ. عبورِ همهٔ آن‌ها از یک کمکیِ رندری یعنی دست‌زدن به صدها
 * نقطه؛ اینجا هر پرس‌وجو یک بار عوض می‌شود و تمام.
 *
 * ⚠️ `nullif(…, '')` لازم است: کلیدِ موجود با مقدارِ خالی نباید جلوی پلهٔ
 * بعدی را بگیرد.
 */
export function tagName(locale: Locale, column = tags.name): SQL<string> {
  if (locale === DEFAULT_LOCALE) {
    // بینندهٔ زبانِ پایه: ترجمه اگر بود، وگرنه خودِ نام.
    return sql<string>`coalesce(nullif(${tags.nameI18n}->>${locale}, ''), ${column})`;
  }
  // انگلیسی پلِ میان‌زبانی است (R-I18N-15).
  return sql<string>`coalesce(
    nullif(${tags.nameI18n}->>${locale}, ''),
    nullif(${tags.nameI18n}->>'en', ''),
    ${column}
  )`;
}
