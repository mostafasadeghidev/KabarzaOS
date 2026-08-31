import { describe, expect, it } from 'vitest';
import {
  dueNudges, dueOffsets, iranianWeekday, localParts, needsTimerReminder,
  previousDay, retentionCutoff, shouldRunCleanup, TIMER_REMIND_MINUTES,
} from '../tick';

describe('ساعتِ محلی', () => {
  // ۲۰:۳۰ UTC — در تهران فردا ۰۰:۰۰، در برلین همان روز ۲۲:۳۰.
  const at = new Date('2026-05-15T20:30:00Z');

  it('⚠️ ساعت و تاریخ در منطقهٔ خودِ کاربر حساب می‌شوند', () => {
    // «ساعتِ ۲۲» برای برلین و تهران یکی نیست.
    expect(localParts(at, 'Europe/Berlin')).toEqual({ date: '2026-05-15', hour: 22 });
    expect(localParts(at, 'Asia/Tehran').date).toBe('2026-05-16');
  });

  it('منطقهٔ نامعتبر به UTC برمی‌گردد، نه استثنا', () => {
    // یک منطقهٔ خراب نباید کلِ تیک را بخواباند.
    expect(localParts(at, 'Mars/Olympus')).toEqual({ date: '2026-05-15', hour: 20 });
    expect(localParts(at, '')).toEqual({ date: '2026-05-15', hour: 20 });
  });

  it('نیمه‌شب ساعتِ صفر است، نه ۲۴', () => {
    expect(localParts(new Date('2026-05-15T00:30:00Z'), 'UTC').hour).toBe(0);
  });

  it('روزِ قبل درست حساب می‌شود، حتی سرِ ماه', () => {
    expect(previousDay('2026-05-01')).toBe('2026-04-30');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  it('⚠️ روزِ هفته ایرانی است: ۰ = شنبه', () => {
    // بدونِ جابه‌جایی، برنامهٔ هفتگیِ همه یک روز می‌لغزید.
    expect(iranianWeekday('2026-05-16')).toBe(0); // شنبه
    expect(iranianWeekday('2026-05-17')).toBe(1); // یکشنبه
    expect(iranianWeekday('2026-05-15')).toBe(6); // جمعه
  });
});

describe('تلنگرِ ثبتِ ساعت', () => {
  const base = {
    local: { date: '2026-05-16', hour: 22 }, // شنبه
    availableWeekdays: [0, 1, 2],
    lastTodayStamp: null,
    lastYesterdayStamp: null,
    absentDates: [] as string[],
    loggedDates: [] as string[],
  };

  it('شبِ روزِ در دسترس، تلنگرِ «امروز» می‌آید', () => {
    expect(dueNudges(base)).toContain('today');
  });

  it('پیش از ۲۲ نمی‌آید', () => {
    expect(dueNudges({ ...base, local: { date: '2026-05-16', hour: 21 } })).not.toContain('today');
  });

  it('⚠️ برای همان تاریخ دوبار نمی‌آید', () => {
    expect(dueNudges({ ...base, lastTodayStamp: '2026-05-16' })).not.toContain('today');
  });

  it('⚠️ تیکِ دیر رسیده باز هم تحویل می‌دهد', () => {
    // شرط «از ساعت گذشته» است، نه «دقیقاً ساعتِ ۲۲».
    expect(dueNudges({ ...base, local: { date: '2026-05-16', hour: 23 } })).toContain('today');
  });

  it('روزِ غیرِدر دسترس، مرخصی، یا روزی که ساعت ثبت شده تلنگر ندارد', () => {
    expect(dueNudges({ ...base, availableWeekdays: [3, 4] })).not.toContain('today');
    expect(dueNudges({ ...base, absentDates: ['2026-05-16'] })).not.toContain('today');
    expect(dueNudges({ ...base, loggedDates: ['2026-05-16'] })).not.toContain('today');
  });

  it('صبحِ روزِ بعد، تلنگرِ روزِ ازدست‌رفته می‌آید', () => {
    const morning = {
      ...base,
      local: { date: '2026-05-17', hour: 10 }, // یکشنبه
      availableWeekdays: [0], // روزِ قبل ۱۶ می است: شنبه
    };
    expect(dueNudges(morning)).toEqual(['yesterday']);
  });

  it('پیش از ۱۰ صبح نمی‌آید', () => {
    const early = { ...base, local: { date: '2026-05-17', hour: 9 }, availableWeekdays: [0] };
    expect(dueNudges(early)).toEqual([]);
  });

  it('هر دو می‌توانند هم‌زمان سررسیده باشند', () => {
    const both = {
      ...base,
      local: { date: '2026-05-17', hour: 22 },
      availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    expect(dueNudges(both).sort()).toEqual(['today', 'yesterday']);
  });
});

describe('فاصله‌های یادآور', () => {
  const at = new Date('2026-05-15T10:00:00Z');

  it('فاصله‌ای که وقتش رسیده می‌سوزد', () => {
    const r = { id: 1, remindAt: new Date('2026-05-15T10:00:00Z'), leadMinutes: [0, 60], sentOffsets: null };
    expect(dueOffsets(r, at)).toEqual([0, 60]);
  });

  it('فاصله‌ای که هنوز نرسیده نمی‌سوزد', () => {
    // هدف ۱۲:۰۰ است؛ فاصلهٔ ۶۰ دقیقه یعنی ۱۱:۰۰ که هنوز نیامده.
    const later = { id: 1, remindAt: new Date('2026-05-15T12:00:00Z'), leadMinutes: [0, 60], sentOffsets: null };
    expect(dueOffsets(later, at)).toEqual([]);

    // همان یادآور با هدفِ ۱۰:۳۰ ⇐ فاصلهٔ ۶۰ دقیقه (۰۹:۳۰) سررسیده، سرِ وقت نه.
    const soon = { id: 1, remindAt: new Date('2026-05-15T10:30:00Z'), leadMinutes: [0, 60], sentOffsets: null };
    expect(dueOffsets(soon, at)).toEqual([60]);
  });

  it('⚠️ فاصلهٔ فرستاده‌شده دوباره نمی‌سوزد', () => {
    const r = { id: 1, remindAt: new Date('2026-05-15T10:00:00Z'), leadMinutes: [0, 60], sentOffsets: [60] };
    expect(dueOffsets(r, at)).toEqual([0]);
  });

  it('یادآورِ بدونِ فاصله یعنی «سرِ وقت»', () => {
    const r = { id: 1, remindAt: new Date('2026-05-15T09:00:00Z'), leadMinutes: null, sentOffsets: null };
    expect(dueOffsets(r, at)).toEqual([0]);
  });
});

describe('تایمرِ رهاشده و پاک‌سازی', () => {
  /**
   * ⚠️ این تست عددِ **غلط** را قفل کرده بود (۳۰۰ به‌جای ۲۴۰) و همین باعث شد
   * اشتباه سه ممیزی زنده بماند: تستِ سبز، خطای پنهان. عدد از نسخهٔ قبلی می‌آید
   * (`Timelogs::REMIND_MINUTES`)، نه از حدس.
   */
  it('پس از چهار ساعت یک‌بار یادآوری می‌گیرد', () => {
    expect(TIMER_REMIND_MINUTES).toBe(240);
    expect(needsTimerReminder({ minutes: 240, alreadyReminded: false })).toBe(true);
    expect(needsTimerReminder({ minutes: 239, alreadyReminded: false })).toBe(false);
  });

  it('⚠️ دوبار یادآوری نمی‌شود', () => {
    expect(needsTimerReminder({ minutes: 600, alreadyReminded: true })).toBe(false);
  });

  it('پاک‌سازی روزی یک‌بار', () => {
    expect(shouldRunCleanup(null, '2026-05-15')).toBe(true);
    expect(shouldRunCleanup('2026-05-14', '2026-05-15')).toBe(true);
    expect(shouldRunCleanup('2026-05-15', '2026-05-15')).toBe(false);
  });

  it('مرزِ نگهداری درست حساب می‌شود', () => {
    expect(retentionCutoff(new Date('2026-05-15T00:00:00Z'), 30)).toBe('2026-04-15');
  });
});
