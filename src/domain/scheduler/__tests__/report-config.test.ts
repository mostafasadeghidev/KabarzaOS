import { describe, expect, it } from 'vitest';
import { normalizeReportConfig, REPORT_SECTIONS } from '../daily-report';

describe('پاک‌سازیِ پیکربندیِ گزارشِ روزانه — پورتِ Daily_Report::save', () => {
  it('ساعتِ نامعتبر → ۰۹:۰۰؛ آفست در ۰..۷؛ بخش‌های ناشناخته دور ریخته؛ وب‌هوکِ غیرِ URL خالی', () => {
    const c = normalizeReportConfig({
      time: '25:99', offset: 99, sections: ['hours', 'bogus'], discord: true, webhook: 'not a url', telegram: false,
    });
    expect(c.time).toBe('09:00');
    expect(c.offset).toBe(7);
    expect(c.sections).toEqual(['hours']);
    expect(c.webhook).toBe('');
  });

  it('مقادیرِ درست دست‌نخورده می‌مانند', () => {
    const c = normalizeReportConfig({
      time: '18:30', offset: 0, sections: REPORT_SECTIONS.map((s) => s.key), discord: true,
      webhook: 'https://discord.com/api/webhooks/1/abc', telegram: true,
    });
    expect(c).toMatchObject({ time: '18:30', offset: 0, webhook: 'https://discord.com/api/webhooks/1/abc', discord: true, telegram: true });
    expect(c.sections).toHaveLength(REPORT_SECTIONS.length);
  });

  it('آفستِ منفی صفر؛ آفستِ ناعدد پیش‌فرض', () => {
    expect(normalizeReportConfig({ offset: -3 }).offset).toBe(0);
    expect(normalizeReportConfig({ offset: Number.NaN }).offset).toBe(1);
  });
});
