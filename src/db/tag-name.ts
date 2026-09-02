import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
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
/**
 * ⚠️ `table` برای جوینِ **نام‌مستعار** است (`alias(tags, 'my_priority_tag')`):
 * تا پیش از این تابع همیشه `tags.nameI18n` ِ جدولِ اصلی را می‌خواند، پس روی
 * تگِ اولویت که با alias جوین می‌شود، ترجمهٔ تگِ **وضعیت** را برمی‌گرداند —
 * و دو صفحه نامِ خامِ فارسیِ اولویت را در هر زبانی نشان می‌دادند.
 */
export function tagName(
  locale: Locale,
  table: { name: AnyPgColumn; nameI18n: AnyPgColumn } = tags,
): SQL<string> {
  if (locale === DEFAULT_LOCALE) {
    // بینندهٔ زبانِ پایه: ترجمه اگر بود، وگرنه خودِ نام.
    return sql<string>`coalesce(nullif(${table.nameI18n}->>${locale}, ''), ${table.name})`;
  }
  // انگلیسی پلِ میان‌زبانی است (R-I18N-15).
  return sql<string>`coalesce(
    nullif(${table.nameI18n}->>${locale}, ''),
    nullif(${table.nameI18n}->>'en', ''),
    ${table.name}
  )`;
}
