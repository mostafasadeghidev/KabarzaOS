import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM, MAX_PURGE_DAYS, normalizeSystem } from './system';

describe('تنظیماتِ سامانه', () => {
  it('ورودیِ خالی ← همهٔ پیش‌فرض‌ها', () => {
    expect(normalizeSystem({})).toEqual(DEFAULT_SYSTEM);
  });

  it('روزِ شروعِ هفته فقط ۰ تا ۶', () => {
    expect(normalizeSystem({ weekStart: 6 }).weekStart).toBe(6);
    expect(normalizeSystem({ weekStart: 7 }).weekStart).toBe(0);
    expect(normalizeSystem({ weekStart: -1 }).weekStart).toBe(0);
    expect(normalizeSystem({ weekStart: 'شنبه' }).weekStart).toBe(0);
  });

  it('⚠️ فاصلهٔ خارج از فهرست به پیش‌فرض برمی‌گردد، نه اینکه پذیرفته شود', () => {
    // یک ثانیه یعنی هر کاربر ۶۰ درخواست در دقیقه — همین مهار دلیلِ وجودش است.
    expect(normalizeSystem({ presencePing: 1 }).presencePing).toBe(DEFAULT_SYSTEM.presencePing);
    expect(normalizeSystem({ pulseInterval: 2 }).pulseInterval).toBe(DEFAULT_SYSTEM.pulseInterval);
    expect(normalizeSystem({ chatPollInterval: 1 }).chatPollInterval).toBe(
      DEFAULT_SYSTEM.chatPollInterval,
    );
    // ولی مقدارِ مجاز عیناً می‌ماند.
    expect(normalizeSystem({ presencePing: 120 }).presencePing).toBe(120);
    expect(normalizeSystem({ pulseInterval: 30 }).pulseInterval).toBe(30);
  });

  it("⚠️ رشتهٔ '0' خاموش است — نه truthy", () => {
    expect(normalizeSystem({ presenceEnabled: '0' }).presenceEnabled).toBe(false);
    expect(normalizeSystem({ pulseEnabled: '0' }).pulseEnabled).toBe(false);
    expect(normalizeSystem({ chatPollEnabled: '1' }).chatPollEnabled).toBe(true);
  });

  it('پاک‌سازیِ پیام در هر دو سو مهار می‌شود', () => {
    expect(normalizeSystem({ msgPurgeDays: -5 }).msgPurgeDays).toBe(0);
    expect(normalizeSystem({ msgPurgeDays: 9999 }).msgPurgeDays).toBe(MAX_PURGE_DAYS);
    expect(normalizeSystem({ msgPurgeDays: 30 }).msgPurgeDays).toBe(30);
    expect(normalizeSystem({ msgPurgeDays: '' }).msgPurgeDays).toBe(0);
  });

  it('زبانِ پیش‌فرض فقط از فهرستِ زبان‌ها پذیرفته می‌شود', () => {
    expect(normalizeSystem({ defaultLocale: 'de' }).defaultLocale).toBe('de');
    // ⚠️ زبانِ ناشناخته ذخیره نمی‌شود: کاربرانی که انتخابی نکرده‌اند رابطِ
    // بی‌ترجمه می‌دیدند.
    expect(normalizeSystem({ defaultLocale: 'klingon' }).defaultLocale).toBe(DEFAULT_SYSTEM.defaultLocale);
    expect(normalizeSystem({ defaultLocale: '' }).defaultLocale).toBe(DEFAULT_SYSTEM.defaultLocale);
    expect(normalizeSystem({}).defaultLocale).toBe('fa');
  });

  it('نامِ برند trim می‌شود و طولش مهار دارد', () => {
    expect(normalizeSystem({ brandName: '  کبرزا  ' }).brandName).toBe('کبرزا');
    expect(normalizeSystem({ brandName: 'ب'.repeat(300) }).brandName).toHaveLength(120);
  });
});
