import { describe, expect, it } from 'vitest';
import {
  ALL_DAY, cleanSlots, cleanTime, formatSlots, isAllDay, isNowWithin,
  planWeek, slotsByWeekday, slotsSpan, WEEKDAYS, weekdayIndex, weekOrder,
} from '../weekly';

describe('ترتیبِ هفتهٔ ایرانی', () => {
  it('شنبه صفر است', () => {
    expect(WEEKDAYS[0]).toBe('شنبه');
    expect(WEEKDAYS[6]).toBe('جمعه');
  });

  it('⚠️ تبدیل از روزِ جاوااسکریپت یک روز جابه‌جا نمی‌شود', () => {
    // ۲۰۲۶-۰۵-۰۲ شنبه است (getDay = 6) ← باید ۰ شود.
    expect(weekdayIndex(new Date('2026-05-02T12:00:00'))).toBe(0);
    // ۲۰۲۶-۰۵-۰۳ یکشنبه (getDay = 0) ← ۱
    expect(weekdayIndex(new Date('2026-05-03T12:00:00'))).toBe(1);
    // ۲۰۲۶-۰۵-۰۱ جمعه (getDay = 5) ← ۶
    expect(weekdayIndex(new Date('2026-05-01T12:00:00'))).toBe(6);
  });

  it('ترتیبِ نمایش با روزِ آغازِ دلخواه می‌چرخد', () => {
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it('روزِ آغازِ نامعتبر به شنبه برمی‌گردد', () => {
    expect(weekOrder(99)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('پاک‌سازیِ ساعت', () => {
  it('فقط HH:MM ِ ۲۴ ساعته', () => {
    expect(cleanTime('09:30')).toBe('09:30');
    expect(cleanTime('23:59')).toBe('23:59');
    expect(cleanTime('24:00')).toBeNull();
    expect(cleanTime('9:30')).toBeNull();
    expect(cleanTime('09:60')).toBeNull();
    expect(cleanTime('abc')).toBeNull();
  });

  it('⚠️ بازهٔ ناقص یا وارونه حذف می‌شود، نه اینکه ذخیره را بشکند', () => {
    const out = cleanSlots([
      { from: '09:00', to: '12:00' },
      { from: '14:00', to: '' },      // ناقص
      { from: '18:00', to: '17:00' }, // وارونه
    ]);
    expect(out).toEqual([{ from: '09:00', to: '12:00' }]);
  });
});

describe('نمایش', () => {
  it('⚠️ فهرستِ خالی یعنی «تمام روز»، نه «در دسترس نیست»', () => {
    expect(formatSlots([])).toBe('تمام روز');
    expect(slotsSpan([])).toBe('تمام روز');
  });

  it('بازه‌ها با ویرگولِ فارسی', () => {
    expect(formatSlots([{ from: '09:00', to: '12:00' }, { from: '14:00', to: '18:00' }]))
      .toBe('09:00–12:00، 14:00–18:00');
  });

  it('خلاصه از زودترین تا دیرترین است', () => {
    expect(slotsSpan([{ from: '14:00', to: '18:00' }, { from: '09:00', to: '12:00' }]))
      .toBe('09:00–18:00 …');
  });

  it('یک بازه «…» نمی‌گیرد', () => {
    expect(slotsSpan([{ from: '09:00', to: '17:00' }])).toBe('09:00–17:00');
  });
});

describe('در این لحظه در دسترس است؟', () => {
  const noon = new Date('2026-05-02T12:00:00');

  it('تمام روز همیشه بله', () => {
    expect(isNowWithin([], noon)).toBe(true);
  });

  it('داخل و بیرونِ بازه', () => {
    expect(isNowWithin([{ from: '09:00', to: '17:00' }], noon)).toBe(true);
    expect(isNowWithin([{ from: '14:00', to: '17:00' }], noon)).toBe(false);
  });
});

describe('برنامهٔ ذخیره', () => {
  it('روزِ تیک‌خوردهٔ بی‌ساعت یک ردیفِ تمام‌روز می‌گیرد', () => {
    const rows = planWeek([1], {});
    expect(rows).toEqual([{ weekday: 1, ...ALL_DAY }]);
  });

  it('روزِ تیک‌نخورده هیچ ردیفی ندارد', () => {
    expect(planWeek([], { 3: [{ from: '09:00', to: '12:00' }] })).toEqual([]);
  });

  it('چند بازه، چند ردیف', () => {
    const rows = planWeek([2], {
      2: [{ from: '09:00', to: '12:00' }, { from: '14:00', to: '18:00' }],
    });
    expect(rows).toHaveLength(2);
  });

  it('روزِ نامعتبر و تکراری کنار می‌رود', () => {
    expect(planWeek([1, 1, 9, -1], {})).toEqual([{ weekday: 1, ...ALL_DAY }]);
  });

  it('رفت‌وبرگشت: تمام‌روز به فهرستِ خالی برمی‌گردد', () => {
    const rows = planWeek([0, 1], { 1: [{ from: '09:00', to: '12:00' }] });
    const map = slotsByWeekday(rows);
    expect(map.get(0)).toEqual([]);                                  // تمام روز
    expect(map.get(1)).toEqual([{ from: '09:00', to: '12:00' }]);
    expect(map.has(2)).toBe(false);                                  // تیک نخورده
  });

  it('تمام‌روز شناخته می‌شود', () => {
    expect(isAllDay(ALL_DAY)).toBe(true);
    expect(isAllDay({ from: '09:00', to: '17:00' })).toBe(false);
  });
});
