import { describe, expect, it } from 'vitest';
import { formatDateTime, formatForDateTimeInput, parseInZone } from '../datetime';

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
