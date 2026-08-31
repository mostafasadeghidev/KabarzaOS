/**
 * کلیدهای ترجمه‌نشده را پیدا می‌کند.
 *
 * ⚠️ منبعِ حقیقت، **خودِ کد** است نه فایلِ ترجمه: هر `t("…")` که در کد باشد
 * باید در هر ۸ زبان ترجمه داشته باشد (R-I18N-02). فایلی که کلیدِ اضافه دارد
 * بی‌ضرر است؛ کلیدِ کم یعنی کاربرِ غیرفارسی‌زبان متنِ فارسی می‌بیند.
 *
 * اجرا:  node scripts/i18n-missing.mjs           (خلاصه)
 *        node scripts/i18n-missing.mjs --list    (فهرستِ کلیدهای کم)
 *        node scripts/i18n-missing.mjs --json    (JSON برای پرکردن)
 */

import { readFileSync } from 'node:fs';
import { usedKeys } from './i18n-keys.mjs';

const LOCALES = ['en', 'ar', 'ckb', 'de', 'es', 'fr', 'pt', 'tr'];

const keys = [...usedKeys()].sort();
const args = process.argv.slice(2);

const missing = new Map();
for (const locale of LOCALES) {
  const path = `src/i18n/messages/${locale}.json`;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const gaps = keys.filter((k) => !data[k]);
  missing.set(locale, gaps);
}

const anyMissing = [...new Set(LOCALES.flatMap((l) => missing.get(l)))].sort();

if (args.includes('--json')) {
  console.log(JSON.stringify(anyMissing, null, 2));
} else if (args.includes('--list')) {
  for (const k of anyMissing) console.log(k);
} else {
  console.log(`کلیدهای به‌کاررفته در کد: ${keys.length}`);
  for (const locale of LOCALES) {
    const n = missing.get(locale).length;
    console.log(`  ${locale}: ${n === 0 ? 'کامل' : `${n} کلیدِ کم`}`);
  }
  console.log(`\nکلیدهایی که دستِ‌کم یک زبان کم دارد: ${anyMissing.length}`);
}
