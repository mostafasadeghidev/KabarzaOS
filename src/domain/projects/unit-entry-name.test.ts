import { describe, expect, it } from 'vitest';
import { ENTRY_NAME_MAX, entryLabel, normalizeEntryName, parseHoursTarget } from './unit-entry-name';

describe('normalizeEntryName', () => {
  it('فاصله‌ها را یکی می‌کند و خالی را می‌پذیرد', () => {
    expect(normalizeEntryName('  CAT   pages ')).toEqual({ ok: true, name: 'CAT pages' });
    expect(normalizeEntryName('')).toEqual({ ok: true, name: '' });
    expect(normalizeEntryName(null)).toEqual({ ok: true, name: '' });
  });

  it('بیش از سقف را رد می‌کند', () => {
    expect(normalizeEntryName('x'.repeat(ENTRY_NAME_MAX))).toEqual({ ok: true, name: 'x'.repeat(ENTRY_NAME_MAX) });
    expect(normalizeEntryName('x'.repeat(ENTRY_NAME_MAX + 1))).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('entryLabel', () => {
  it('«پروژه - نام» و بی‌نام فقط پروژه', () => {
    expect(entryLabel('Simon Zickert media', 'CAT')).toBe('Simon Zickert media - CAT');
    expect(entryLabel('Simon Zickert media', '')).toBe('Simon Zickert media');
    expect(entryLabel('Simon Zickert media', null)).toBe('Simon Zickert media');
    expect(entryLabel('P', '  ')).toBe('P');
  });
});

describe('parseHoursTarget', () => {
  it('عمومی، پروژه و ردیف را می‌خواند', () => {
    expect(parseHoursTarget('')).toEqual({ projectId: null, unitEntryId: null });
    expect(parseHoursTarget('57')).toEqual({ projectId: 57, unitEntryId: null });
    expect(parseHoursTarget('57:12')).toEqual({ projectId: 57, unitEntryId: 12 });
  });

  it('ورودیِ خراب null است، نه ساعتِ عمومی', () => {
    for (const bad of ['abc', '57:', ':12', '0', '57:0', '-1', '57:12:3', '5.7']) {
      expect(parseHoursTarget(bad)).toBeNull();
    }
  });
});
