import { describe, expect, it } from 'vitest';
import {
  EVENING_CHOICES, QUIET_PRESETS, eveningDue, inQuiet, nextChoice, normalizePrefs, quietEnded, quietLength, sameQuiet,
} from './prefs';

describe('ترجیحاتِ تلگرام (۲.۴۱.۰)', () => {
  it('ورودیِ خراب یا ناشناخته به پیش‌فرض برمی‌گردد', () => {
    expect(normalizePrefs(null)).toEqual({ off: [], quiet: null, evening: '' });
    expect(normalizePrefs({ off: ['tasks', 'other', 'tasks', 'x'], quiet: { from: '25:00', to: '08:00' }, evening: '7pm' }))
      .toEqual({ off: ['tasks'], quiet: null, evening: '' });
    expect(normalizePrefs({ quiet: { from: '08:00', to: '08:00' } }).quiet).toBeNull();
    expect(normalizePrefs({ quiet: { from: '23:00', to: '08:00' }, evening: '18:00' }))
      .toMatchObject({ quiet: { from: '23:00', to: '08:00' }, evening: '18:00' });
  });

  it('ساعتِ سکوتِ شبانه از نیمه‌شب می‌گذرد', () => {
    const q = { from: '23:00', to: '08:00' };
    expect(inQuiet('23:30', q)).toBe(true);
    expect(inQuiet('03:00', q)).toBe(true);
    expect(inQuiet('08:00', q)).toBe(false);
    expect(inQuiet('12:00', q)).toBe(false);
    expect(inQuiet('13:00', { from: '12:00', to: '14:00' })).toBe(true);
    expect(inQuiet('12:00', null)).toBe(false);
    expect(quietLength(q)).toBe(9 * 60);
  });

  it('خلاصهٔ پایانِ سکوت: از پایان تا دو ساعت بعد، یک بار در روز', () => {
    const q = { from: '23:00', to: '08:00' };
    expect(quietEnded('08:05', '2026-10-20', q, null)).toBe(true);
    expect(quietEnded('07:59', '2026-10-20', q, null)).toBe(false);
    expect(quietEnded('10:30', '2026-10-20', q, null)).toBe(false);
    expect(quietEnded('08:05', '2026-10-20', q, '2026-10-20')).toBe(false);
  });

  it('گزارشِ عصر: بعد از ساعتش، یک بار، روزِ کاری، نه مرخصی', () => {
    const base = { at: '18:00', local: { date: '2026-10-20', time: '18:10' }, lastSent: null, workDays: [], weekday: 3, onLeave: false };
    expect(eveningDue(base)).toBe(true);
    expect(eveningDue({ ...base, local: { ...base.local, time: '17:59' } })).toBe(false);
    expect(eveningDue({ ...base, lastSent: '2026-10-20' })).toBe(false);
    expect(eveningDue({ ...base, workDays: [0, 1], weekday: 3 })).toBe(false);
    expect(eveningDue({ ...base, onLeave: true })).toBe(false);
    expect(eveningDue({ ...base, at: '' })).toBe(false);
  });

  it('دکمهٔ چرخشی به گزینهٔ بعدی و از آخر به اول می‌رود', () => {
    expect(nextChoice(EVENING_CHOICES, '')).toBe('17:00');
    expect(nextChoice(EVENING_CHOICES, '21:00')).toBe('');
    expect(nextChoice(QUIET_PRESETS, null, sameQuiet)).toEqual({ from: '22:00', to: '08:00' });
  });
});
