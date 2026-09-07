import { describe, it, expect } from 'vitest';
import { closedStatus, isOpen, statusLabel, toggleStatus } from './comments';

/**
 * ⚠️ نوعِ «بازبینی» برداشته شد (مهاجرتِ 0026) — یک واژگان برای هر رشته.
 * پیش‌تر بستهٔ ریویو `resolved` بود و بستهٔ کامنت `done`، و همین دوگانگی
 * کارتِ «کامنت باز» ِ پروژه را خراب می‌کرد: بازبینیِ حل‌شده هنوز باز شمرده
 * می‌شد. ردیف‌های قدیمی در مهاجرت به `done` تبدیل شدند.
 */

describe('حالتِ بستهٔ رشته', () => {
  it('برای هر نوع done است', () => {
    expect(closedStatus('comment')).toBe('done');
    expect(closedStatus('task_note')).toBe('done');
    expect(closedStatus()).toBe('done');
  });

  it('برچسب‌ها', () => {
    expect(statusLabel('comment', 'done')).toBe('انجام شد');
    expect(statusLabel('comment', 'needs_review')).toBe('نیاز به بررسی');
  });

  it('⚠️ «resolved» ِ قدیمی دیگر برچسبی ندارد — مهاجرت باید آن را برده باشد', () => {
    expect(statusLabel('comment', 'resolved')).toBe('');
  });
});

describe('تیکِ جابه‌جاکننده', () => {
  it('باز → done و مهرِ بستن می‌خورد', () => {
    expect(toggleStatus('comment', 'needs_review')).toEqual({ status: 'done', stampCloser: true });
  });

  it('⚠️ بازکردنِ دوباره مهرِ «انجام شد توسط» را نمی‌زند', () => {
    // وگرنه نامِ بازکننده به‌جای بندنده می‌نشست.
    expect(toggleStatus('comment', 'done')).toEqual({ status: 'needs_review', stampCloser: false });
  });

  it('فقط needs_review باز است', () => {
    expect(isOpen('needs_review')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect(isOpen('resolved')).toBe(false);
  });
});
