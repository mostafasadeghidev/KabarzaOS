import { describe, it, expect } from 'vitest';
import { groupDigits, trimZeros, ungroupDigits } from '../number-input';

describe('سه‌رقم‌سه‌رقم کردنِ خانهٔ مبلغ (۲.۲۵.۰)', () => {
  it('۴ میلیون خوانا می‌شود و خام برمی‌گردد', () => {
    expect(groupDigits('4000000')).toBe('4,000,000');
    expect(ungroupDigits('4,000,000')).toBe('4000000');
  });

  it('اعشار دست نمی‌خورد', () => {
    expect(groupDigits('1234.5678')).toBe('1,234.5678');
    expect(groupDigits('0.00005')).toBe('0.00005');
    expect(groupDigits('12.')).toBe('12.');
  });

  it('رقمِ فارسی و جداکنندهٔ «٫» لاتین می‌شوند', () => {
    expect(ungroupDigits('۴۰۰۰٫۵')).toBe('4000.5');
    expect(ungroupDigits('٤٠٠')).toBe('400');
  });

  it('نویسهٔ اضافه و نقطهٔ دوم حذف می‌شوند؛ منفی فقط در ابتدا', () => {
    expect(ungroupDigits('1a2.3.4')).toBe('12.34');
    expect(ungroupDigits('-572')).toBe('-572');
    expect(ungroupDigits('5-7')).toBe('57');
    expect(groupDigits('-1234')).toBe('-1,234');
  });

  it('خالی خالی می‌ماند', () => {
    expect(groupDigits('')).toBe('');
    expect(ungroupDigits('')).toBe('');
  });
});

describe('صفرهای انتهای اعشار (۲.۵۰.۱)', () => {
  it('مقدارِ پایگاه‌داده بی‌صفرِ اضافه', () => {
    expect(trimZeros('3700.0000')).toBe('3700');
    expect(trimZeros('12.5000')).toBe('12.5');
    expect(trimZeros('0.0000')).toBe('0');
    expect(trimZeros('0.00005')).toBe('0.00005');
    expect(trimZeros('100')).toBe('100');
    expect(trimZeros('')).toBe('');
  });
});
