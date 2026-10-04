import { describe, expect, it } from 'vitest';
import { canSeeReview, detectSource, normalizeTiming, reviewProgress, seesClientHidden, withoutClientHidden } from './reviews';

const viewer = (over: Partial<Parameters<typeof canSeeReview>[0]> = {}) => ({
  userId: 5, manages: false, isMember: false, isClient: false, roleTagIds: [], ...over,
});
const review = (over: Partial<Parameters<typeof canSeeReview>[1]> = {}) => ({
  createdBy: 1, roleTagIds: [], clientVisible: false, ...over,
});

describe('دیدنِ بازبینی', () => {
  it('مدیر و سازنده همیشه', () => {
    expect(canSeeReview(viewer({ manages: true }), review({ roleTagIds: [9] }))).toBe(true);
    expect(canSeeReview(viewer(), review({ createdBy: 5, roleTagIds: [9] }))).toBe(true);
  });

  it('عضو: بازبینیِ کلِ تیم، یا نقشِ مشترک', () => {
    expect(canSeeReview(viewer({ isMember: true, roleTagIds: [2] }), review())).toBe(true);
    expect(canSeeReview(viewer({ isMember: true, roleTagIds: [2] }), review({ roleTagIds: [2, 3] }))).toBe(true);
    expect(canSeeReview(viewer({ isMember: true, roleTagIds: [4] }), review({ roleTagIds: [2, 3] }))).toBe(false);
  });

  it('⚠️ کارفرما فقط با «برای کارفرما» — حتی بازبینیِ کلِ تیم را نه', () => {
    expect(canSeeReview(viewer({ isClient: true }), review())).toBe(false);
    expect(canSeeReview(viewer({ isClient: true }), review({ clientVisible: true }))).toBe(true);
  });

  it('عضوِ کارفرما از راهِ عضویتش می‌بیند', () => {
    expect(canSeeReview(viewer({ isClient: true, isMember: true, roleTagIds: [2] }), review({ roleTagIds: [2] }))).toBe(true);
  });
});

describe('پنهان از کارفرما', () => {
  it('فقط کسی که تنها کارفرماست محروم است', () => {
    expect(seesClientHidden({ manages: false, isMember: false, isClient: true })).toBe(false);
    expect(seesClientHidden({ manages: false, isMember: true, isClient: true })).toBe(true);
    // کادرِ بی‌رابطه (بینندهٔ مجوزی) کارفرما نیست.
    expect(seesClientHidden({ manages: false, isMember: false, isClient: false })).toBe(true);
    const rows = [{ id: 1, clientHidden: true }, { id: 2, clientHidden: false }];
    expect(withoutClientHidden(rows, { manages: false, isMember: false, isClient: true }).map((r) => r.id)).toEqual([2]);
  });
});

describe('منبع، زمان و پیشرفت', () => {
  it('منبع از پیوند؛ انتخابِ صریح مقدم است', () => {
    expect(detectSource(null, 'https://youtu.be/dQw4w9WgXcQ', false)).toBe('youtube');
    expect(detectSource('video', null, true)).toBe('upload');
    expect(detectSource('whatsapp', 'https://youtu.be/dQw4w9WgXcQ', false)).toBe('whatsapp');
    expect(detectSource(null, 'https://drive.google.com/x', false)).toBe('other');
  });

  it('بازهٔ برعکس جابه‌جا و پایانِ بی‌آغاز آغاز می‌شود', () => {
    expect(normalizeTiming(80, 65)).toEqual({ start: 65, end: 80 });
    expect(normalizeTiming(null, 30)).toEqual({ start: 30, end: null });
    expect(normalizeTiming(30, 30)).toEqual({ start: 30, end: null });
  });

  it('پیشرفت', () => {
    expect(reviewProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3, percent: 67 });
    expect(reviewProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
