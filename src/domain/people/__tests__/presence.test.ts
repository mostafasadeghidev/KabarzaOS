import { describe, expect, it } from 'vitest';
import {
  deriveState, normalizeConfig, PRESENCE_DEFAULTS, PRESENCE_LABELS, shouldWrite,
} from '../presence';

const config = PRESENCE_DEFAULTS;
const now = new Date('2026-05-15T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('سه حالتِ حضور', () => {
  it('ضربانِ تازه از تبِ متمرکز ← فعال', () => {
    expect(deriveState({ lastSeen: ago(10), lastActive: ago(10), now, config })).toBe('active');
  });

  it('⚠️ تبِ باز در پس‌زمینه «بی‌فعالیت» است، نه آفلاین', () => {
    // همان حالتی که قبلاً اشتباهاً به آفلاین می‌افتاد.
    expect(deriveState({ lastSeen: ago(30), lastActive: ago(200), now, config })).toBe('idle');
  });

  it('بدونِ هیچ ضربانی ← آفلاین', () => {
    expect(deriveState({ lastSeen: ago(400), lastActive: ago(400), now, config })).toBe('offline');
  });

  it('⚠️ آفلاین بر «فعال»ِ کهنه مقدم است', () => {
    // وگرنه تبِ بسته‌شده تا ابد «فعال» می‌ماند.
    expect(deriveState({ lastSeen: ago(400), lastActive: ago(5), now, config })).toBe('offline');
  });

  it('کاربرِ بدونِ مهر آفلاین است', () => {
    expect(deriveState({ lastSeen: null, lastActive: null, now, config })).toBe('offline');
  });

  it('دقیقاً روی مرزِ بی‌فعالیت هنوز فعال است', () => {
    expect(deriveState({ lastSeen: ago(10), lastActive: ago(120), now, config })).toBe('active');
    expect(deriveState({ lastSeen: ago(10), lastActive: ago(121), now, config })).toBe('idle');
  });

  it('هر حالت برچسبِ فارسی دارد', () => {
    for (const s of ['active', 'idle', 'offline'] as const) {
      expect(PRESENCE_LABELS[s]).toBeTruthy();
    }
  });
});

describe('پیکربندی', () => {
  it('مقدارِ مجاز پذیرفته می‌شود', () => {
    expect(normalizeConfig({ ping: 30, idleAfter: 300, offlineAfter: 600 }))
      .toEqual({ ping: 30, idleAfter: 300, offlineAfter: 600 });
  });

  it('⚠️ مقدارِ خارج از فهرست به پیش‌فرض برمی‌گردد', () => {
    // ضربانِ خیلی کوتاه روی هاستِ ضعیف خودش می‌شود بار.
    expect(normalizeConfig({ ping: 1 }).ping).toBe(60);
    expect(normalizeConfig({ idleAfter: 9999 }).idleAfter).toBe(120);
    expect(normalizeConfig({})).toEqual(PRESENCE_DEFAULTS);
  });
});

describe('گلوگاهِ نوشتن', () => {
  it('اولین ضربان همیشه نوشته می‌شود', () => {
    expect(shouldWrite({ lastWrite: null, now, config })).toBe(true);
  });

  it('⚠️ ضربانِ زودهنگام نوشته نمی‌شود', () => {
    // وگرنه هر کاربر در هر دقیقه یک نوشتنِ دیتابیس می‌سازد.
    expect(shouldWrite({ lastWrite: ago(5), now, config })).toBe(false);
  });

  it('ضربانِ به‌موقع رد نمی‌شود', () => {
    // گلوگاه کمی کوتاه‌تر از خودِ ضربان است (۶۰−۱۰).
    expect(shouldWrite({ lastWrite: ago(50), now, config })).toBe(true);
  });

  it('گلوگاه هرگز زیرِ پنج ثانیه نمی‌رود', () => {
    const fast = { ping: 15, idleAfter: 60, offlineAfter: 90 };
    expect(shouldWrite({ lastWrite: ago(4), now, config: fast })).toBe(false);
    expect(shouldWrite({ lastWrite: ago(6), now, config: fast })).toBe(true);
  });
});
