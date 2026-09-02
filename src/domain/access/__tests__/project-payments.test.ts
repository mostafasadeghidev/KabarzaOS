import { describe, expect, it } from 'vitest';
import { visiblePayments } from '../project-payments';
import type { MoneyAudience } from '../project-money';

const rows = [
  { id: 1, direction: 'incoming', userId: 9 },
  { id: 2, direction: 'member_payout', userId: 5 },
  { id: 3, direction: 'member_payout', userId: 7 },
  { id: 4, direction: 'project_cost', userId: null },      // جذب‌شده — داخلی
  { id: 5, direction: 'project_expense', userId: null },   // قابلِ صورتحساب
];
const base: MoneyAudience = {
  hasGlobalProjectManage: false, hasGlobalFinanceManage: false,
  isClientOfProject: false, isMemberOfProject: false,
};

describe('visiblePayments — کدام ردیفِ پرداخت برای کیست', () => {
  it('مدیرِ سراسری همه را می‌بیند', () => {
    expect(visiblePayments({ ...base, hasGlobalProjectManage: true }, 1, rows).map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(visiblePayments({ ...base, hasGlobalFinanceManage: true }, 1, rows).map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('کارفرما فقط دریافتی و هزینهٔ قابلِ صورتحساب — نه پرداخت به عضو', () => {
    // ⚠️ همان نشتی که بسته شد: کارفرما دستمزدِ تک‌تکِ اعضا را می‌دید.
    expect(visiblePayments({ ...base, isClientOfProject: true }, 9, rows).map((r) => r.id)).toEqual([1, 5]);
  });

  it('عضوِ خالص فقط پرداخت‌های خودش', () => {
    expect(visiblePayments({ ...base, isMemberOfProject: true }, 5, rows).map((r) => r.id)).toEqual([2]);
  });

  it('کارفرمایی که عضو هم هست، کارفرما حساب می‌شود', () => {
    expect(visiblePayments({ ...base, isClientOfProject: true, isMemberOfProject: true }, 5, rows).map((r) => r.id)).toEqual([1, 5]);
  });

  it('بی‌نسبت هیچ', () => {
    expect(visiblePayments(base, 1, rows)).toEqual([]);
  });
});
