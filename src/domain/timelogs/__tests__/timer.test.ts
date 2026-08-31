import { describe, expect, it } from 'vitest';
import {
  CAP_MINUTES, EDIT_WINDOW_DAYS, elapsedMinutes, hoursLabel, isEditable,
  mergeDescriptions, minutesFrom, planStop, resumeStartedAt, toDateString,
} from '../timer';

const at = (iso: string) => new Date(iso);

describe('سپری‌شده', () => {
  it('دقیقه‌ها را از لحظهٔ شروع می‌شمارد', () => {
    expect(elapsedMinutes(at('2026-05-01T09:00:00'), at('2026-05-01T10:30:00'))).toBe(90);
  });

  it('⚠️ ساعتِ عقب‌رفتهٔ سرور زمانِ منفی نمی‌سازد', () => {
    expect(elapsedMinutes(at('2026-05-01T10:00:00'), at('2026-05-01T09:00:00'))).toBe(0);
  });
});

describe('توقفِ تایمر', () => {
  it('زیرِ سقف ثبت می‌شود', () => {
    const out = planStop(
      { projectId: 3, startedAt: at('2026-05-01T09:00:00') },
      at('2026-05-01T12:00:00'),
    );
    expect(out).toEqual({ action: 'log', minutes: 180, projectId: 3, logDate: '2026-05-01' });
  });

  it('⚠️ بالای ۵ ساعت ثبت نمی‌شود، پارک می‌شود', () => {
    // ثبتِ خودکارِ ۹ ساعت روی حقوقِ کسی می‌نشیند که ۹ ساعت کار نکرده.
    const out = planStop(
      { projectId: 3, startedAt: at('2026-05-01T09:00:00') },
      at('2026-05-01T18:00:00'),
    );
    expect(out.action).toBe('park');
    expect(out.minutes).toBe(540);
  });

  it('دقیقاً روی سقف هنوز ثبت می‌شود', () => {
    const out = planStop(
      { projectId: null, startedAt: at('2026-05-01T09:00:00') },
      at('2026-05-01T14:00:00'),
    );
    expect(out.minutes).toBe(CAP_MINUTES);
    expect(out.action).toBe('log');
  });

  it('تاریخِ ثبت، روزِ **شروع** است نه روزِ توقف', () => {
    // تایمری که شب شروع شده و بامداد متوقف می‌شود مالِ دیروز است.
    const out = planStop(
      { projectId: 1, startedAt: at('2026-05-01T23:30:00') },
      at('2026-05-02T01:00:00'),
    );
    expect(out.logDate).toBe('2026-05-01');
  });

  it('پروژهٔ عمومی (بدونِ پروژه) هم پارک می‌شود', () => {
    const out = planStop(
      { projectId: null, startedAt: at('2026-05-01T00:00:00') },
      at('2026-05-01T09:00:00'),
    );
    expect(out.action).toBe('park');
    expect(out.projectId).toBeNull();
  });
});

describe('ازسرگیری', () => {
  it('زمانِ شمرده‌شده از دست نمی‌رود', () => {
    const started = resumeStartedAt(
      { projectId: 1, minutes: 400, logDate: '2026-05-01' },
      at('2026-05-01T18:00:00'),
    );
    expect(elapsedMinutes(started, at('2026-05-01T18:00:00'))).toBe(400);
  });
});

describe('ادغامِ توضیحات', () => {
  it('با نقطه‌وسط به هم می‌چسبند', () => {
    expect(mergeDescriptions('طراحی', 'بازبینی')).toBe('طراحی · بازبینی');
  });

  it('خالی‌ها جداکننده نمی‌سازند', () => {
    expect(mergeDescriptions('طراحی', '  ')).toBe('طراحی');
    expect(mergeDescriptions('', 'بازبینی')).toBe('بازبینی');
    expect(mergeDescriptions('', '')).toBe('');
  });
});

describe('پنجرهٔ ویرایش', () => {
  it('تا دو هفته قابلِ ویرایش است', () => {
    expect(EDIT_WINDOW_DAYS).toBe(14);
    expect(isEditable(at('2026-05-01T00:00:00'), at('2026-05-10T00:00:00'))).toBe(true);
  });

  it('بعد از پنجره بسته می‌شود', () => {
    expect(isEditable(at('2026-05-01T00:00:00'), at('2026-05-20T00:00:00'))).toBe(false);
  });
});

describe('کمکی‌ها', () => {
  it('ساعت:دقیقه', () => {
    expect(hoursLabel(90)).toBe('1:30');
    expect(hoursLabel(0)).toBe('0:00');
    expect(hoursLabel(605)).toBe('10:05');
  });

  it('⚠️ ورودیِ منفی ساعتِ کاری کم نمی‌کند', () => {
    expect(minutesFrom(-3, -20)).toBe(0);
    expect(minutesFrom(2, 30)).toBe(150);
  });

  it('تاریخِ محلی', () => {
    expect(toDateString(at('2026-05-09T23:00:00'))).toBe('2026-05-09');
  });
});
