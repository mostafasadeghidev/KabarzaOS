import { describe, expect, it } from 'vitest';
import { DISCORD_CHUNK, chunkText, hoursLine, meetingLine, paymentLine, projectLabel } from '../daily-report';
import { dayWindow } from '../tick';

const label = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

describe('خطوطِ گزارشِ روزانه — پورتِ hours_lines / payment_lines / meeting_lines', () => {
  it('ساعت: ریزِ هر پروژه با «،»', () => {
    expect(hoursLine('سارا', [{ minutes: 30, project: 'وب‌سایت' }, { minutes: 120, project: 'لوگو' }], label))
      .toBe('• سارا: 0:30 وب‌سایت، 2:00 لوگو');
  });

  it('پرداخت: عضو اختیاری، پروژه، مبلغ با کدِ ارز', () => {
    expect(paymentLine({ member: 'علی', project: 'وب‌سایت', amount: '1,000', code: 'IRT' })).toBe('• علی — وب‌سایت: 1,000 IRT');
    expect(paymentLine({ project: 'وب‌سایت', amount: '50.00', code: 'EUR' })).toBe('• وب‌سایت: 50.00 EUR');
    expect(paymentLine({ project: 'وب‌سایت', amount: '5', code: '' })).toBe('• وب‌سایت: 5');
  });

  it('جلسه: ساعت — عنوان (پروژه)', () => {
    expect(meetingLine({ time: '14:30', title: 'هماهنگی', project: 'وب‌سایت' })).toBe('• 14:30 — هماهنگی (وب‌سایت)');
    expect(meetingLine({ time: '09:00', title: 'عمومی', project: null })).toBe('• 09:00 — عمومی');
  });

  it('بی‌پروژه → «بدون پروژه»', () => {
    expect(projectLabel('')).toBe('بدون پروژه');
    expect(projectLabel(null)).toBe('بدون پروژه');
    expect(projectLabel('لوگو')).toBe('لوگو');
  });

  it('⚠️ دیسکورد: تکه‌های ≤۱۹۰۰ روی مرزِ خط، نه یک پیامِ بریده', () => {
    const text = Array.from({ length: 60 }, (_, i) => `• خطِ شمارهٔ ${i} با کمی متنِ اضافه برای پرکردن`).join('\n');
    const parts = chunkText(text, DISCORD_CHUNK);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(DISCORD_CHUNK);
    expect(parts.join('\n')).toBe(text);
  });
});

describe('پنجرهٔ روزِ محلی — پورتِ paid_at = date', () => {
  it('تهران (‎+03:30): روز از ۲۰:۳۰ ِ UTC ِ شبِ قبل شروع می‌شود', () => {
    const w = dayWindow('2026-09-03', 'Asia/Tehran');
    expect(w.start.toISOString()).toBe('2026-09-02T20:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-03T20:29:59.999Z');
  });

  it('UTC و منطقهٔ نامعتبر', () => {
    expect(dayWindow('2026-09-03', 'UTC').start.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(dayWindow('2026-09-03', 'Nowhere/Land').start.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });
});
