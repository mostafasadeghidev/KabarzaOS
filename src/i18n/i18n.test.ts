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
