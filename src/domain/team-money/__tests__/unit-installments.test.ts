import { describe, it, expect } from 'vitest';
import {
  installmentPart, unitPayLabel, unitPayStatus, unitRemaining, UnitInstallmentError,
} from '../unit-installments';

describe('پرداختِ چندقسطیِ کارکرد (۲.۲۵.۰)', () => {
  it('مانده = مبلغ − پرداخت‌شده، هرگز منفی', () => {
    expect(unitRemaining('360', '200')).toBe(160);
    expect(unitRemaining('360', '400')).toBe(0);
  });

  it('وضعیت از جمعِ قسط‌ها', () => {
    expect(unitPayStatus('360', '0', false)).toBe('unpaid');
    expect(unitPayStatus('360', '200', false)).toBe('unpaid');
    expect(unitPayStatus('360', '200', true)).toBe('requested');
    expect(unitPayStatus('360', '360', false)).toBe('paid');
    // ردیفِ بی‌مبلغ «پرداخت‌شده» نمی‌شود.
    expect(unitPayStatus('0', '0', false)).toBe('unpaid');
  });

  it('برچسبِ «بخشی پرداخت‌شده» فقط در نمایش', () => {
    expect(unitPayLabel('unpaid', '200')).toBe('partial');
    expect(unitPayLabel('unpaid', '0')).toBe('unpaid');
    expect(unitPayLabel('paid', '360')).toBe('paid');
  });

  it('قسطِ خالی = کلِ مانده؛ کمتر پذیرفته؛ بیشتر رد', () => {
    expect(installmentPart('', '360', '200')).toBe('160.0000');
    expect(installmentPart('100', '360', '200')).toBe('100.0000');
    expect(() => installmentPart('161', '360', '200')).toThrow(UnitInstallmentError);
    expect(() => installmentPart('-5', '360', '0')).toThrow(UnitInstallmentError);
    expect(() => installmentPart('', '360', '360')).toThrow(UnitInstallmentError);
  });

  it('رواداریِ گردکردن: ۱۰۵٫۲۶ روی ماندهٔ ۱۰۵٫۲۵۸ پذیرفته و به مانده بریده می‌شود', () => {
    expect(installmentPart('105.26', '105.258', '0')).toBe('105.2580');
  });
});
