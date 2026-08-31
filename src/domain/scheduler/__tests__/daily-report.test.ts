import { describe, expect, it } from 'vitest';
import {
  buildReport, DEFAULT_CONFIG, DISCORD_LIMIT, fitForDiscord,
  hasDestination, REPORT_SECTIONS, reportDate, shouldSendNow,
  type ReportSections,
} from '../daily-report';

const empty: ReportSections = {
  hours: [], incoming: [], payouts: [], expenses: [],
  tasks_done: [], tasks_new: [], meetings: [], absences: [],
};

describe('مقصدِ گزارش', () => {
  it('دیسکورد بدونِ وب‌هوک مقصد نیست', () => {
    expect(hasDestination({ ...DEFAULT_CONFIG, discord: true, webhook: '' }, false)).toBe(false);
    expect(hasDestination({ ...DEFAULT_CONFIG, discord: true, webhook: 'https://x' }, false)).toBe(true);
  });

  it('تلگرام بدونِ باتِ پیکربندی‌شده مقصد نیست', () => {
    expect(hasDestination({ ...DEFAULT_CONFIG, telegram: true }, false)).toBe(false);
    expect(hasDestination({ ...DEFAULT_CONFIG, telegram: true }, true)).toBe(true);
  });

  it('بدونِ هیچ مقصدی، false', () => {
    expect(hasDestination(DEFAULT_CONFIG, true)).toBe(false);
  });
});

describe('دروازهٔ ارسال', () => {
  const base = {
    config: { ...DEFAULT_CONFIG, discord: true, webhook: 'https://x' },
    botConfigured: false,
    lastSentDate: null as string | null,
    localDate: '2026-05-15',
    localTime: '09:30',
  };

  it('پس از ساعتِ مقرر می‌فرستد', () => {
    expect(shouldSendNow(base)).toBe(true);
  });

  it('پیش از ساعتِ مقرر نمی‌فرستد', () => {
    expect(shouldSendNow({ ...base, localTime: '08:59' })).toBe(false);
  });

  it('⚠️ روزی یک‌بار', () => {
    expect(shouldSendNow({ ...base, lastSentDate: '2026-05-15' })).toBe(false);
    expect(shouldSendNow({ ...base, lastSentDate: '2026-05-14' })).toBe(true);
  });

  it('⚠️ بدونِ مقصد هرگز — وگرنه مهرِ «فرستاده شد» بی‌جهت می‌خورد', () => {
    expect(shouldSendNow({ ...base, config: DEFAULT_CONFIG })).toBe(false);
  });

  it('⚠️ ساعتِ نامعتبر گزارش را برای همیشه نمی‌خواباند', () => {
    const broken = { ...base, config: { ...base.config, time: 'خراب' } };
    expect(shouldSendNow(broken)).toBe(true); // به پیش‌فرضِ ۰۹:۰۰ برمی‌گردد
  });
});

describe('تاریخِ گزارش', () => {
  it('پیش‌فرض دیروز است', () => {
    expect(reportDate('2026-05-15', 1)).toBe('2026-05-14');
  });

  it('صفر یعنی همین امروز', () => {
    expect(reportDate('2026-05-15', 0)).toBe('2026-05-15');
  });

  it('سرِ ماه هم درست است', () => {
    expect(reportDate('2026-05-01', 1)).toBe('2026-04-30');
  });

  it('ورودیِ نامعتبر تاریخ را خراب نمی‌کند', () => {
    expect(reportDate('2026-05-15', Number.NaN)).toBe('2026-05-14');
    expect(reportDate('2026-05-15', -5)).toBe('2026-05-15');
  });
});

describe('متنِ گزارش', () => {
  it('بدونِ بخشِ فعال، متنی نیست', () => {
    expect(buildReport({ date: '2026-05-15', sections: [], data: empty })).toBe('');
  });

  it('⚠️ بخشِ فعالِ خالی هم چاپ می‌شود، با «موردی ثبت نشده»', () => {
    // سکوت دو معنا دارد؛ خواننده باید بداند بخش خاموش است یا داده نیست.
    const text = buildReport({ date: '2026-05-15', sections: ['hours'], data: empty });
    expect(text).toContain('ساعت کاری اعضا:');
    expect(text).toContain('موردی ثبت نشده');
  });

  it('بخشِ خاموش اصلاً نمی‌آید', () => {
    const text = buildReport({ date: '2026-05-15', sections: ['hours'], data: empty });
    expect(text).not.toContain('جلسات');
  });

  it('ترتیبِ بخش‌ها ثابت است', () => {
    const text = buildReport({
      date: '2026-05-15',
      sections: REPORT_SECTIONS.map((s) => s.key),
      data: { ...empty, hours: ['• سارا ۸:۰۰'], meetings: ['• جلسهٔ هفتگی'] },
    });
    expect(text.indexOf('ساعت کاری')).toBeLessThan(text.indexOf('جلسات'));
    expect(text).toContain('• سارا ۸:۰۰');
  });
});

describe('سقفِ دیسکورد', () => {
  it('متنِ کوتاه دست‌نخورده می‌ماند', () => {
    expect(fitForDiscord('سلام')).toBe('سلام');
  });

  it('⚠️ متنِ بلند با نشانه بریده می‌شود، نه بی‌صدا', () => {
    const long = 'x'.repeat(DISCORD_LIMIT + 500);
    const cut = fitForDiscord(long);
    expect(cut.length).toBeLessThanOrEqual(DISCORD_LIMIT);
    expect(cut).toContain('بریده شد');
  });
});
