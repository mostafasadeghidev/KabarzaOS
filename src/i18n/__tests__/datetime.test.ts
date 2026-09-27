import { describe, expect, it } from 'vitest';
import { formatCompact, formatDateTime, formatForDateTimeInput, parseInZone } from '../datetime';

describe('formatDateTime — به وقتِ بیننده، نه UTC', () => {
  const instant = new Date('2026-09-02T10:30:00Z');

  it('تهران (+03:30): ۱۰:۳۰ ِ UTC می‌شود ۱۴:۰۰', () => {
    // ⚠️ همان مثالِ ممیزی: جلسهٔ ۱۴:۰۰ تهران ۱۰:۳۰ نشان داده می‌شد.
    expect(formatDateTime(instant, 'Asia/Tehran')).toBe('2026-09-02 14:00');
  });

  it('برلین (تابستانی +02:00)', () => {
    expect(formatDateTime(instant, 'Europe/Berlin')).toBe('2026-09-02 12:30');
  });

  it('منطقهٔ نامعتبر می‌افتد به پیش‌فرض و خالی/null هیچ', () => {
    expect(formatDateTime(instant, 'Mars/Olympus')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatDateTime(null, 'Asia/Tehran')).toBe('');
    expect(formatDateTime('not a date', 'Asia/Tehran')).toBe('');
  });

  it('مقدارِ datetime-local همان است با T', () => {
    expect(formatForDateTimeInput(instant, 'Asia/Tehran')).toBe('2026-09-02T14:00');
  });
});

describe('formatCompact — زمانِ فشردهٔ صندوق و حباب‌ها', () => {
  // ۱۳:۳۰ ِ تهران، ۲۸ سپتامبر.
  const now = new Date('2026-09-28T10:00:00Z');
  const tz = 'Asia/Tehran';

  it('امروز فقط ساعت', () => {
    expect(formatCompact('2026-09-28T10:30:00Z', tz, { now })).toBe('14:00');
    expect(formatCompact('2026-09-28T10:30:00Z', tz, { now, withTime: true })).toBe('14:00');
  });

  it('«امروز» در منطقهٔ بیننده است، نه UTC', () => {
    // ۲۱:۰۰ ِ UTC ِ روزِ ۲۷ در تهران ۰۰:۳۰ ِ روزِ ۲۸ است.
    expect(formatCompact('2026-09-27T21:00:00Z', tz, { now })).toBe('00:30');
  });

  it('امسال: ماه و روز، و با `withTime` ساعت هم', () => {
    expect(formatCompact('2026-08-28T19:34:00Z', tz, { now })).toBe('08-28');
    expect(formatCompact('2026-08-28T19:34:00Z', tz, { now, withTime: true })).toBe('08-28 23:04');
  });

  it('سال‌های قبل: تاریخِ کامل؛ خالی هیچ', () => {
    expect(formatCompact('2025-12-31T10:00:00Z', tz, { now })).toBe('2025-12-31');
    expect(formatCompact(null, tz, { now })).toBe('');
    expect(formatCompact('not a date', tz, { now })).toBe('');
  });
});

describe('parseInZone — ساعتِ دیواریِ کاربر → لحظهٔ مطلق', () => {
  it('۱۴:۰۰ تهران همان ۱۰:۳۰ ِ UTC است', () => {
    expect(parseInZone('2026-09-02T14:00', 'Asia/Tehran')?.toISOString()).toBe('2026-09-02T10:30:00.000Z');
  });

  it('رفت‌وبرگشت در منطقه‌ای با ساعتِ تابستانی', () => {
    for (const local of ['2026-03-29T01:30', '2026-07-15T09:45', '2026-10-25T03:30', '2026-12-01T23:59']) {
      const d = parseInZone(local, 'Europe/Berlin')!;
      expect(formatForDateTimeInput(d, 'Europe/Berlin')).toBe(local);
    }
  });

  it('ورودیِ بد null', () => {
    expect(parseInZone('', 'Asia/Tehran')).toBeNull();
    expect(parseInZone('2026-09-02', 'Asia/Tehran')).toBeNull();
  });
});
