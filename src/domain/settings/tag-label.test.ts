import { describe, expect, it } from 'vitest';
import { cleanI18nMap, tagLabel } from './tag-label';

const tag = (nameI18n?: Record<string, string> | null) => ({
  name: 'در حالِ انجام', nameI18n,
});

describe('نامِ نمایشیِ تگ', () => {
  it('ترجمهٔ همان زبان مقدم است', () => {
    expect(tagLabel(tag({ en: 'In progress', de: 'Läuft' }), 'de')).toBe('Läuft');
  });

  it('بینندهٔ زبانِ پایه، نامِ پایه را می‌بیند', () => {
    expect(tagLabel(tag({ en: 'In progress' }), 'fa')).toBe('در حالِ انجام');
  });

  it('⚠️ انگلیسی پلِ میان‌زبانی است، نه فارسی', () => {
    // کاربرِ کردی بدونِ ترجمهٔ کردی، انگلیسی را بهتر از فارسی می‌خواند.
    expect(tagLabel(tag({ en: 'In progress' }), 'ckb')).toBe('In progress');
  });

  it('بدونِ هیچ ترجمه‌ای، نامِ پایه', () => {
    expect(tagLabel(tag(null), 'de')).toBe('در حالِ انجام');
    expect(tagLabel(tag({}), 'tr')).toBe('در حالِ انجام');
  });

  it('زبانِ پایهٔ غیرفارسی هم کار می‌کند', () => {
    const t = { name: 'In progress', nameI18n: { fa: 'در حالِ انجام' } };
    expect(tagLabel(t, 'en', 'en')).toBe('In progress');
    expect(tagLabel(t, 'fa', 'en')).toBe('در حالِ انجام');
  });

  it('⚠️ زبانِ ناشناخته و مقدارِ خالی کنار می‌روند', () => {
    expect(cleanI18nMap({ en: 'X', klingon: 'Y', de: '   ', fr: null }))
      .toEqual({ en: 'X' });
    expect(cleanI18nMap(null)).toEqual({});
    expect(cleanI18nMap('چرند')).toEqual({});
  });
});
