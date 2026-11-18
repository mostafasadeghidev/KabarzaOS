import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, DEFAULT_LOCALE, isRtl, direction, resolveLocale, isLocale } from './config';
import { createTranslator } from './translate';

const MESSAGES_DIR = join(import.meta.dirname, 'messages');
const load = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'));

describe('R-I18N-06 — سه زبانِ راست‌به‌چپ', () => {
  it('فارسی، عربی و کردی RTL هستند', () => {
    expect(isRtl('fa')).toBe(true);
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ckb')).toBe(true);
  });

  it('بقیه LTR هستند', () => {
    for (const l of ['en', 'de', 'es', 'fr', 'pt', 'tr'] as const) {
      expect(isRtl(l)).toBe(false);
    }
  });

  it('جهت از زبان مشتق می‌شود، نه هاردکد', () => {
    expect(direction('fa')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });
});

describe('تشخیصِ زبان', () => {
  it('زبانِ نامعتبر به مبدأ برمی‌گردد', () => {
    expect(resolveLocale('klingon')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('کدِ منطقه‌ای به زبانِ پایه نگاشت می‌شود', () => {
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('de');
  });

  it('isLocale فقط زبان‌های تعریف‌شده را می‌پذیرد', () => {
    expect(isLocale('fa')).toBe(true);
    expect(isLocale('xx')).toBe(false);
  });
});

describe('R-I18N-01 — فارسی زبانِ مبدأ است', () => {
  it('فارسی کلید را عیناً برمی‌گرداند (خودش منبع است)', () => {
    const t = createTranslator({}, 'fa');
    expect(t('پروژه‌ها')).toBe('پروژه‌ها');
  });

  it('نبودِ ترجمه به فارسی برمی‌گردد، نه رشتهٔ خالی', () => {
    const t = createTranslator({}, 'en');
    expect(t('یک رشتهٔ ترجمه‌نشده')).toBe('یک رشتهٔ ترجمه‌نشده');
  });

  it('ترجمهٔ موجود استفاده می‌شود', () => {
    const t = createTranslator({ 'پروژه‌ها': 'Projects' }, 'en');
    expect(t('پروژه‌ها')).toBe('Projects');
  });
});

describe('جای‌گذاریِ پارامتر', () => {
  it('پارامتر جای‌گذاری می‌شود', () => {
    const t = createTranslator({ 'سلام {name}': 'Hello {name}' }, 'en');
    expect(t('سلام {name}', { name: 'مصطفی' })).toBe('Hello مصطفی');
  });

  it('پارامترِ ناموجود دست‌نخورده می‌ماند', () => {
    const t = createTranslator({}, 'fa');
    expect(t('سلام {name}')).toBe('سلام {name}');
  });

  it('عدد هم پذیرفته می‌شود', () => {
    const t = createTranslator({}, 'fa');
    expect(t('{count} پروژه', { count: 5 })).toBe('5 پروژه');
  });
});

describe('مفرد و جمع (Intl.PluralRules)', () => {
  // ⚠️ پیش از این «1 days to deadline» و «1 projects» نوشته می‌شد — ترجمه فقط یک رشته بود.
  const en = createTranslator({ '{n} روز تا ددلاین': { one: '{n} day to deadline', other: '{n} days to deadline' } }, 'en');

  it('انگلیسی: ۱ مفرد، بقیه جمع (صفر هم جمع)', () => {
    expect(en('{n} روز تا ددلاین', { n: 1 })).toBe('1 day to deadline');
    expect(en('{n} روز تا ددلاین', { n: 3 })).toBe('3 days to deadline');
    expect(en('{n} روز تا ددلاین', { n: 0 })).toBe('0 days to deadline');
  });

  it('عربی: شکل‌های دوتایی و چندتایی', () => {
    const ar = createTranslator({ '{n} پروژه': { one: 'مشروع واحد', two: 'مشروعان', few: '{n} مشاريع', many: '{n} مشروعًا', other: '{n} مشروع' } }, 'ar');
    expect(ar('{n} پروژه', { n: 1 })).toBe('مشروع واحد');
    expect(ar('{n} پروژه', { n: 2 })).toBe('مشروعان');
    expect(ar('{n} پروژه', { n: 5 })).toBe('5 مشاريع');
    expect(ar('{n} پروژه', { n: 11 })).toBe('11 مشروعًا');
  });

  it('عددِ رشته‌ای هم شمرده می‌شود و بی‌پارامتر «other» می‌آید', () => {
    expect(en('{n} روز تا ددلاین', { n: '1' })).toBe('1 day to deadline');
    expect(en('{n} روز تا ددلاین')).toBe('{n} days to deadline');
  });

  it('بی n: اولین پارامترِ عددیِ کلید، یا by', () => {
    const t = createTranslator({
      '{done} از {total} تسک': { one: '{done} of {total} task', other: '{done} of {total} tasks', by: 'total' },
      '{days} روز مانده': { one: '{days} day left', other: '{days} days left' },
    }, 'en');
    expect(t('{done} از {total} تسک', { done: 3, total: 1 })).toBe('3 of 1 task');
    expect(t('{days} روز مانده', { days: 1 })).toBe('1 day left');
  });

  it('فارسی همیشه خودِ کلید است', () => {
    const fa = createTranslator({ '{n} پروژه': { one: 'x', other: 'y' } }, 'fa');
    expect(fa('{n} پروژه', { n: 1 })).toBe('1 پروژه');
  });
});

describe('R-I18N-02 — ترجمه هیچ‌وقت گم نمی‌شود', () => {
  const fa = load('fa');
  const faKeys = Object.keys(fa);

  it('همهٔ ۹ زبان فایل دارند', () => {
    const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(LOCALES.length);
  });

  it('دارایی واقعاً منتقل شده (بیش از ۱۴۰۰ رشته)', () => {
    expect(faKeys.length).toBeGreaterThan(1400);
  });

  it('⚠️ هر زبان باید حداقل ۹۹٪ کلیدهای مبدأ را داشته باشد', () => {
    const gaps: string[] = [];
    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      const messages = load(locale);
      const covered = faKeys.filter((k) => messages[k]).length;
      const pct = (covered / faKeys.length) * 100;
      if (pct < 99) gaps.push(`${locale}: ${pct.toFixed(1)}%`);
    }
    expect(gaps).toEqual([]);
  });

  it('هیچ ترجمه‌ای رشتهٔ خالی نیست', () => {
    for (const locale of LOCALES) {
      const messages = load(locale);
      const empty = Object.entries(messages).filter(([, v]) => v === '');
      expect(empty, `${locale} رشتهٔ خالی دارد`).toEqual([]);
    }
  });
});
