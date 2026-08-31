import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — ماژولِ .mjs بدونِ تایپ؛ عمداً همان فایلی که اسکریپت
// هم از آن می‌خواند تا دو استخراج‌گر از هم واگرا نشوند.
import { usedKeys } from '../../scripts/i18n-keys.mjs';
import { LOCALES, DEFAULT_LOCALE } from './config';

/**
 * نگهبانِ R-I18N-02 — «هیچ رشتهٔ جدیدی بدونِ ترجمه مرج نمی‌شود».
 *
 * ⚠️ بدونِ این تست، هر رشتهٔ تازه‌ای که کسی اضافه کند بی‌سروصدا فارسی
 * می‌ماند و **هیچ خطایی هم نمی‌دهد** (چون کلید خودِ متنِ فارسی است و
 * ترجمه‌نبودن به همان برمی‌گردد). دقیقاً همان «شکستِ بی‌صدا»یی که سخت
 * پیدا می‌شود.
 */

describe('پوششِ ترجمه', () => {
  const keys = [...usedKeys()] as string[];

  it('کد دستِ‌کم چند صد رشتهٔ ترجمه‌پذیر دارد', () => {
    // ⚠️ اگر استخراج روزی بشکند، بی‌سروصدا «همه‌چیز کامل است» می‌گفت.
    expect(keys.length).toBeGreaterThan(300);
  });

  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} — هیچ رشتهٔ ترجمه‌نشده‌ای ندارد`, () => {
      const messages = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, 'utf8'),
      ) as Record<string, string>;

      const missing = keys.filter((k) => !messages[k]);
      expect(missing, `${missing.length} کلیدِ ترجمه‌نشده: ${missing.slice(0, 5).join(' · ')}`)
        .toEqual([]);
    });
  }

  it('⚠️ فارسی فایلِ ترجمه لازم ندارد — کلید خودِ متن است', () => {
    // R-I18N-01: اگر روزی کسی برای فارسی هم ترجمه بنویسد، یعنی مدلِ کلید
    // را اشتباه فهمیده.
    expect(DEFAULT_LOCALE).toBe('fa');
  });
});
