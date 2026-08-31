import { describe, it, expect } from 'vitest';
import { closedStatus, isOpen, statusLabel, toggleStatus } from './comments';

describe('R-PROJ-27 — حالتِ بستهٔ رشته به نوعش بستگی دارد', () => {
  it('⚠️ ریویو resolved می‌شود، کامنت done', () => {
    // یکی‌کردنشان شمارندهٔ «نیازمند بررسی» را برای یکی از دو نوع خراب می‌کرد.
    expect(closedStatus('review')).toBe('resolved');
    expect(closedStatus('comment')).toBe('done');
    expect(closedStatus('task_note')).toBe('done');
  });

  it('برچسب‌ها هم جدا هستند', () => {
    expect(statusLabel('review', 'resolved')).toBe('حل شد');
    expect(statusLabel('comment', 'done')).toBe('انجام شد');
    expect(statusLabel('review', 'needs_review')).toBe('بررسی بشه');
    expect(statusLabel('comment', 'needs_review')).toBe('نیاز به بررسی');
  });

  it('برچسبِ ناموجود رشتهٔ خالی است، نه undefined', () => {
    expect(statusLabel('comment', 'resolved')).toBe('');
  });
});

describe('تیکِ جابه‌جاکننده', () => {
  it('بازِ کامنت → done و مهرِ بستن می‌خورد', () => {
    expect(toggleStatus('comment', 'needs_review')).toEqual({ status: 'done', stampCloser: true });
  });

  it('بازِ ریویو → resolved', () => {
    expect(toggleStatus('review', 'needs_review')).toEqual({ status: 'resolved', stampCloser: true });
  });

  it('⚠️ بازکردنِ دوباره مهرِ «انجام شد توسط» را نمی‌زند', () => {
    // وگرنه نامِ بازکننده به‌جای بندنده می‌نشست.
    expect(toggleStatus('comment', 'done')).toEqual({ status: 'needs_review', stampCloser: false });
    expect(toggleStatus('review', 'resolved')).toEqual({ status: 'needs_review', stampCloser: false });
  });

  it('فقط needs_review باز است', () => {
    expect(isOpen('needs_review')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect(isOpen('resolved')).toBe(false);
  });
});
