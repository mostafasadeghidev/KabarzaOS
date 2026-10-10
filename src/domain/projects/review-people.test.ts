import { describe, expect, it } from 'vitest';
import { canSeeReview } from './reviews';

/** مخاطبِ شخصیِ بازبینی (۲.۲۲.۰). */
const viewer = (userId: number, roleTagIds: number[] = [7]) => ({ userId, manages: false, isMember: true, isClient: false, roleTagIds });

describe('canSeeReview با اشخاص', () => {
  it('بی‌نقش و بی‌شخص یعنی کلِ تیم', () => {
    expect(canSeeReview(viewer(2), { createdBy: 1, roleTagIds: [], userIds: [], clientVisible: false })).toBe(true);
    expect(canSeeReview(viewer(2), { createdBy: 1, roleTagIds: [], clientVisible: false })).toBe(true);
  });

  it('فقط یک شخص: همکارِ هم‌نقش نمی‌بیند', () => {
    const review = { createdBy: 1, roleTagIds: [], userIds: [2], clientVisible: false };
    expect(canSeeReview(viewer(2), review)).toBe(true);
    expect(canSeeReview(viewer(3), review)).toBe(false);
  });

  it('نقش یا شخص — هر کدام کافی است', () => {
    const review = { createdBy: 1, roleTagIds: [9], userIds: [3], clientVisible: false };
    expect(canSeeReview(viewer(2, [9]), review)).toBe(true);
    expect(canSeeReview(viewer(3, [7]), review)).toBe(true);
    expect(canSeeReview(viewer(4, [7]), review)).toBe(false);
  });

  it('مدیر و سازنده همیشه؛ کارفرما فقط با «برای کارفرما»', () => {
    const review = { createdBy: 1, roleTagIds: [], userIds: [2], clientVisible: false };
    expect(canSeeReview({ ...viewer(5), manages: true }, review)).toBe(true);
    expect(canSeeReview(viewer(1), review)).toBe(true);
    expect(canSeeReview({ ...viewer(6), isMember: false, isClient: true }, review)).toBe(false);
    expect(canSeeReview({ ...viewer(6), isMember: false, isClient: true }, { ...review, clientVisible: true })).toBe(true);
  });
});
