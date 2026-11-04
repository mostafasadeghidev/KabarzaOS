import { describe, it, expect } from 'vitest';
import { effectivePayType, isUnitMember, storedPayType, unifyPayTypes } from './pay-type';

/** نوعِ دستمزدِ هر عضو (۲.۵۱.۰). */

describe('effectivePayType', () => {
  it('خالی از پروژه پیروی می‌کند', () => {
    expect(effectivePayType(null, true)).toBe('unit');
    expect(effectivePayType(undefined, false)).toBe('fixed');
    expect(effectivePayType('garbage', true)).toBe('unit');
  });
  it('مقدارِ صریح بر پروژه مقدم است', () => {
    expect(effectivePayType('fixed', true)).toBe('fixed');
    expect(effectivePayType('unit', false)).toBe('unit');
  });
});

describe('isUnitMember', () => {
  it('هر ردیفِ تعدادی کافی است', () => {
    expect(isUnitMember([{ payType: null }, { payType: 'unit' }], false)).toBe(true);
    expect(isUnitMember([{ payType: 'fixed' }], true)).toBe(false);
  });
  it('بی‌ردیف = نوعِ پروژه', () => {
    expect(isUnitMember([], true)).toBe(true);
    expect(isUnitMember([], false)).toBe(false);
  });
});

describe('storedPayType', () => {
  it('هم‌نوعِ پروژه خالی ذخیره می‌شود', () => {
    expect(storedPayType('unit', true)).toBeNull();
    expect(storedPayType('fixed', false)).toBeNull();
  });
  it('نوعِ متفاوت می‌ماند؛ نامعتبر خالی', () => {
    expect(storedPayType('fixed', true)).toBe('fixed');
    expect(storedPayType('unit', false)).toBe('unit');
    expect(storedPayType('x', false)).toBeNull();
    expect(storedPayType(null, true)).toBeNull();
  });
});

describe('unifyPayTypes', () => {
  it('ردیف‌های یک نفر نوعِ اولین ردیفش را می‌گیرند', () => {
    const out = unifyPayTypes([
      { userId: 1, payType: 'unit' as const },
      { userId: 2, payType: null },
      { userId: 1, payType: 'fixed' as const },
    ]);
    expect(out.map((r) => [r.userId, r.payType])).toEqual([[1, 'unit'], [2, null], [1, 'unit']]);
  });
});
