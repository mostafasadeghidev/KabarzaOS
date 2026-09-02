import { describe, expect, it } from 'vitest';
import { cellState, elapsedMinutes, formatElapsed, isAvailableNow, sortOnline } from '../team';
import type { Slot } from '../weekly';

const noon = new Date('2026-09-02T12:00:00');
const days = (entries: Array<[number, Slot[]]>) => new Map(entries);

describe('isAvailableNow', () => {
  it('روزی که در برنامه نیست، در دسترس نیست', () => {
    expect(isAvailableNow({ days: days([]), today: 2, onLeave: false, now: noon })).toBe(false);
  });

  it('روزِ تیک‌خورده بدونِ بازه یعنی تمامِ روز', () => {
    expect(isAvailableNow({ days: days([[2, []]]), today: 2, onLeave: false, now: noon })).toBe(true);
  });

  it('بیرونِ بازه، در دسترس نیست', () => {
    const d = days([[2, [{ from: '14:00', to: '17:00' }]]]);
    expect(isAvailableNow({ days: d, today: 2, onLeave: false, now: noon })).toBe(false);
  });

  it('مرخصی بر برنامه مقدم است — حتی روزِ تمام‌روز', () => {
    expect(isAvailableNow({ days: days([[2, []]]), today: 2, onLeave: true, now: noon })).toBe(false);
  });
});

describe('cellState', () => {
  it('مرخصی فقط خانهٔ امروز را می‌گیرد', () => {
    expect(cellState({ isToday: true, onLeave: true, hasDay: true })).toBe('leave');
    // ⚠️ همان قاعده‌ای که نبودنش سطرِ فردِ در مرخصی را خالی نشان می‌داد.
    expect(cellState({ isToday: false, onLeave: true, hasDay: true })).toBe('avail');
  });

  it('روزِ بی‌برنامه خالی است', () => {
    expect(cellState({ isToday: false, onLeave: false, hasDay: false })).toBe('empty');
  });

  it('امروزِ بی‌برنامه و بی‌مرخصی هم خالی است', () => {
    expect(cellState({ isToday: true, onLeave: false, hasDay: false })).toBe('empty');
  });
});

describe('formatElapsed', () => {
  it('دقیقه را دو رقمی می‌کند', () => {
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(5)).toBe('0:05');
  });

  it('ساعت سقف ندارد', () => {
    expect(formatElapsed(26 * 60)).toBe('26:00');
  });

  it('ورودیِ بی‌معنا صفر می‌شود', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
  });
});

describe('elapsedMinutes', () => {
  it('از شروع تا حالا', () => {
    expect(elapsedMinutes(new Date('2026-09-02T10:30:00'), noon)).toBe(90);
  });

  it('شروعِ آینده منفی نمی‌دهد', () => {
    expect(elapsedMinutes(new Date('2026-09-02T13:00:00'), noon)).toBe(0);
  });
});

describe('sortOnline', () => {
  it('فعال‌ها اول، بعد تازه‌دیده‌شده‌ها', () => {
    const rows = [
      { id: 1, state: 'idle' as const, seen: new Date('2026-09-02T11:59:00') },
      { id: 2, state: 'active' as const, seen: new Date('2026-09-02T11:50:00') },
      { id: 3, state: 'active' as const, seen: new Date('2026-09-02T11:58:00') },
    ];
    expect(sortOnline(rows).map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
