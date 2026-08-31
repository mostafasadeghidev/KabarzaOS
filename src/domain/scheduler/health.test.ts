import { describe, expect, it } from 'vitest';
import { agoParts, schedulerHealth, STALE_AFTER_MINUTES } from './health';

const now = new Date('2026-05-10T12:00:00Z');
const minutesBefore = (n: number) =>
  new Date(now.getTime() - n * 60_000).toISOString();

describe('سلامتِ زمان‌بند', () => {
  it('تیکِ تازه سبز است', () => {
    expect(schedulerHealth(minutesBefore(3), now)).toEqual({ tone: 'ok', minutesAgo: 3 });
  });

  it('⚠️ تأخیرِ کوتاه زرد است، نه قرمز', () => {
    // تیک هر ۵ دقیقه است؛ قرمزکردنِ تأخیرِ کوچک هشدار را بی‌ارزش می‌کند.
    expect(schedulerHealth(minutesBefore(STALE_AFTER_MINUTES + 10), now).tone).toBe('warn');
  });

  it('سکوتِ طولانی قرمز است', () => {
    expect(schedulerHealth(minutesBefore(STALE_AFTER_MINUTES * 5), now).tone).toBe('bad');
  });

  it('⚠️ «هرگز نرفته» قرمز است، نه سبز', () => {
    expect(schedulerHealth(null, now)).toEqual({ tone: 'bad', minutesAgo: null });
    expect(schedulerHealth('چرند', now).tone).toBe('bad');
  });

  it('مرزِ دقیقاً روی آستانه هنوز سبز است', () => {
    expect(schedulerHealth(minutesBefore(STALE_AFTER_MINUTES), now).tone).toBe('ok');
  });

  it('واحد از خودِ عدد می‌آید', () => {
    expect(agoParts(12)).toEqual({ value: 12, unit: 'minute' });
    expect(agoParts(150)).toEqual({ value: 2, unit: 'hour' });
    expect(agoParts(60 * 30)).toEqual({ value: 1, unit: 'day' });
  });
});
