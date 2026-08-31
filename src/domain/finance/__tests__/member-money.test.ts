import { describe, expect, it } from 'vitest';
import {
  availableToRequest, canCancelRequest, canDeleteUnit, isArchivedRequest,
  isOpenRequest, isValidQuantity, REQUEST_MESSAGES, unitAmount, validateRequest,
} from '../member-money';

describe('کارکردِ تعدادی', () => {
  it('مبلغ = تعداد × نرخِ واحد', () => {
    expect(unitAmount(12, '2.5000')).toBe('30.0000');
  });

  it('⚠️ نرخِ نداشته یعنی صفر، نه خطا — حسابدار بعداً می‌گذارد', () => {
    expect(unitAmount(12, null)).toBe('0.0000');
    expect(unitAmount(12, '0')).toBe('0.0000');
  });

  it('تعدادِ منفی مبلغِ منفی نمی‌سازد', () => {
    expect(unitAmount(-5, '10')).toBe('0.0000');
  });

  it('تعداد باید عددِ صحیحِ دستِ‌کم یک باشد', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(2.5)).toBe(false);
    expect(isValidQuantity(-1)).toBe(false);
  });

  it('⚠️ ردیفِ پرداخت‌شده حذف نمی‌شود', () => {
    expect(canDeleteUnit('unpaid', false)).toBe(true);
    expect(canDeleteUnit('paid', false)).toBe(false);
  });

  it('پروژهٔ منجمد حذف نمی‌پذیرد', () => {
    expect(canDeleteUnit('unpaid', true)).toBe(false);
  });
});

describe('⚠️ مبلغِ قابلِ درخواست', () => {
  it('مانده منهای درخواست‌های باز', () => {
    // بدونِ کسرِ درخواست‌های باز، عضو یک بدهی را دو بار می‌گرفت.
    expect(availableToRequest('1000.0000', '400.0000')).toBe('600.0000');
  });

  it('هرگز منفی نمی‌شود', () => {
    expect(availableToRequest('300.0000', '500.0000')).toBe('0.0000');
  });

  it('درخواستِ باز یعنی در انتظار یا تأییدشده', () => {
    expect(isOpenRequest('pending')).toBe(true);
    expect(isOpenRequest('approved')).toBe(true);
    expect(isOpenRequest('paid')).toBe(false);
    expect(isOpenRequest('rejected')).toBe(false);
  });
});

describe('اعتبارسنجیِ درخواست', () => {
  it('مبلغِ سالم مجاز است', () => {
    expect(validateRequest({ amount: '500', available: '600.0000' })).toBeNull();
  });

  it('⚠️ بیش از باقی‌مانده رد می‌شود', () => {
    expect(validateRequest({ amount: '700', available: '600.0000' })).toBe('exceeds_available');
  });

  it('دقیقاً برابرِ باقی‌مانده مجاز است', () => {
    expect(validateRequest({ amount: '600.0000', available: '600.0000' })).toBeNull();
  });

  it('صفر و منفی رد می‌شوند', () => {
    expect(validateRequest({ amount: '0', available: '600' })).toBe('amount_invalid');
    expect(validateRequest({ amount: '-5', available: '600' })).toBe('amount_invalid');
    expect(validateRequest({ amount: 'abc', available: '600' })).toBe('amount_invalid');
  });

  it('⚠️ ردیفی که درخواستِ باز دارد دوباره درخواست نمی‌گیرد', () => {
    expect(validateRequest({ amount: '10', available: '600', hasOpenForUnit: true }))
      .toBe('already_open');
  });

  it('هر دلیلِ رد پیامِ فارسی دارد', () => {
    for (const key of ['amount_invalid', 'exceeds_available', 'already_open'] as const) {
      expect(REQUEST_MESSAGES[key]).toBeTruthy();
    }
  });
});

describe('لغو و بایگانی', () => {
  it('⚠️ فقط درخواستِ در انتظار لغو می‌شود، نه تأییدشده', () => {
    expect(canCancelRequest('pending')).toBe(true);
    expect(canCancelRequest('approved')).toBe(false);
    expect(canCancelRequest('paid')).toBe(false);
  });

  it('تصمیمِ داخلِ دورهٔ قفل بایگانی است', () => {
    expect(isArchivedRequest({ status: 'paid', decidedAt: '2026-01-15' }, '2026-03-31')).toBe(true);
  });

  it('در انتظار هرگز بایگانی نیست — هنوز زنده است', () => {
    expect(isArchivedRequest({ status: 'pending', decidedAt: null }, '2026-03-31')).toBe(false);
  });

  it('⚠️ بدونِ قفل هیچ چیز بایگانی نیست — با بازکردنِ دوره برمی‌گردد', () => {
    expect(isArchivedRequest({ status: 'paid', decidedAt: '2026-01-15' }, null)).toBe(false);
  });

  it('تصمیمِ بعد از مرزِ قفل بایگانی نیست', () => {
    expect(isArchivedRequest({ status: 'paid', decidedAt: '2026-05-01' }, '2026-03-31')).toBe(false);
  });
});
