import { describe, it, expect } from 'vitest';
import { FiscalPeriodLockedError, assertDeletable, assertWritable, closingBalance, isLocked, isValidCloseDate, nextLockDate, periodStart } from './fiscal';

const LOCK = '2026-03-31';

describe('R-FISCAL-01 — قفل «تا و شاملِ» تاریخ', () => {
  it('روزِ خودِ قفل، قفل است', () => {
    expect(isLocked('2026-03-31', LOCK)).toBe(true);
  });

  it('قبل از قفل، قفل است', () => {
    expect(isLocked('2026-01-15', LOCK)).toBe(true);
  });

  it('روزِ بعد آزاد است', () => {
    expect(isLocked('2026-04-01', LOCK)).toBe(false);
  });

  it('بدونِ قفل هیچ‌چیز قفل نیست', () => {
    expect(isLocked('2020-01-01', null)).toBe(false);
  });

  it('مقایسه رشته‌ای است تا منطقهٔ زمانی جابه‌جایش نکند (R-DATA-02)', () => {
    // تاریخِ همراهِ زمان هم باید درست بریده شود
    expect(isLocked('2026-03-31T23:59:00Z', LOCK)).toBe(true);
    expect(isLocked('2026-04-01T00:00:00Z', LOCK)).toBe(false);
  });
});

describe('R-FISCAL-02 — ⚠️ ویرایش هر دو تاریخ را چک می‌کند', () => {
  it('نوشتنِ جدید در دورهٔ باز مجاز است', () => {
    expect(() => assertWritable(LOCK, '2026-05-01')).not.toThrow();
  });

  it('نوشتن در دورهٔ قفل‌شده رد می‌شود', () => {
    expect(() => assertWritable(LOCK, '2026-02-01')).toThrow(FiscalPeriodLockedError);
  });

  it('نمی‌توان ردیفِ قفل‌شده را به تاریخِ باز «بیرون کشید»', () => {
    // تاریخِ جدید باز است ولی ردیفِ فعلی داخلِ دورهٔ بسته است
    expect(() => assertWritable(LOCK, '2026-05-01', '2026-02-01')).toThrow(FiscalPeriodLockedError);
  });

  it('نمی‌توان ردیفِ باز را به دورهٔ قفل‌شده «هل داد»', () => {
    expect(() => assertWritable(LOCK, '2026-02-01', '2026-05-01')).toThrow(FiscalPeriodLockedError);
  });

  it('ویرایشِ ردیفِ کاملاً باز مجاز است', () => {
    expect(() => assertWritable(LOCK, '2026-05-02', '2026-05-01')).not.toThrow();
  });
});

describe('R-FISCAL-03 — حذف در دورهٔ قفل‌شده', () => {
  it('حذفِ ردیفِ قفل‌شده رد می‌شود', () => {
    expect(() => assertDeletable(LOCK, '2026-01-10')).toThrow(FiscalPeriodLockedError);
  });

  it('حذفِ ردیفِ باز مجاز است', () => {
    expect(() => assertDeletable(LOCK, '2026-06-10')).not.toThrow();
  });
});

describe('R-FISCAL-06 — دوره از فردای بستنِ قبلی', () => {
  it('روزِ بعد از بستنِ قبلی', () => {
    expect(periodStart('2026-03-31')).toBe('2026-04-01');
  });

  it('عبور از مرزِ ماه', () => {
    expect(periodStart('2026-01-31')).toBe('2026-02-01');
  });

  it('عبور از مرزِ سال', () => {
    expect(periodStart('2025-12-31')).toBe('2026-01-01');
  });

  it('سالِ کبیسه', () => {
    expect(periodStart('2028-02-28')).toBe('2028-02-29');
  });

  it('بدونِ بستنِ قبلی از ابتدا', () => {
    expect(periodStart(null)).toBe('1970-01-01');
  });
});

describe('بستنِ دورهٔ مالی', () => {
  it('R-FISCAL-06 — دوره از فردای بستنِ قبلی شروع می‌شود', () => {
    expect(periodStart('2026-03-31')).toBe('2026-04-01');
    expect(periodStart(null)).toBe('1970-01-01');
    // پایانِ ماه و سالِ کبیسه.
    expect(periodStart('2026-12-31')).toBe('2027-01-01');
    expect(periodStart('2028-02-28')).toBe('2028-02-29');
  });

  it('⚠️ R-FISCAL-10 — قفل هرگز عقب نمی‌رود', () => {
    // بستنِ تاریخی قدیمی‌تر، قفلِ جلوتر را دست نمی‌زند.
    expect(nextLockDate('2026-06-30', '2026-03-31')).toBe('2026-06-30');
    // ولی بستنِ جلوتر قفل را جلو می‌برد.
    expect(nextLockDate('2026-03-31', '2026-06-30')).toBe('2026-06-30');
    expect(nextLockDate(null, '2026-03-31')).toBe('2026-03-31');
  });

  it('تاریخِ بستن باید روزِ واقعی باشد', () => {
    expect(isValidCloseDate('2026-03-31')).toBe(true);
    expect(isValidCloseDate('  2026-03-31  ')).toBe(true);
    expect(isValidCloseDate('2026-3-1')).toBe(false);
    expect(isValidCloseDate('')).toBe(false);
    // ⚠️ الگو را پاس می‌کند ولی چنین روزی وجود ندارد.
    expect(isValidCloseDate('2026-02-30')).toBe(false);
    expect(isValidCloseDate('2026-13-01')).toBe(false);
  });

  it('موجودیِ پایانی انباشته است، نه بازه‌ای', () => {
    expect(closingBalance({ openingBalance: 100, cumulativeIn: 50, cumulativeOut: 20 })).toBe(130);
    expect(closingBalance({ openingBalance: 0, cumulativeIn: 0, cumulativeOut: 40 })).toBe(-40);
  });
});
