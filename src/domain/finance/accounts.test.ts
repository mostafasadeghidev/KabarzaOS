import { describe, it, expect } from 'vitest';
import {
  accountMessage, AccountError, assertAccountDeletable, canSeeAccount, visibleAccountIds,
} from './accounts';

describe('R-ACC-01 — ⚠️ حسابِ دارای ردیف حذف نمی‌شود', () => {
  it('حسابِ دارای ردیفِ دفتر رد می‌شود', () => {
    // حذفش ردیف‌ها را بی‌صاحب و مانده‌ها را از تراز خارج می‌کرد.
    expect(() => assertAccountDeletable(1)).toThrow(AccountError);
  });

  it('حسابِ خالی حذف می‌شود', () => {
    expect(() => assertAccountDeletable(0)).not.toThrow();
  });

  it('پیام راهِ درست را پیشنهاد می‌دهد', () => {
    expect(accountMessage('in_use')).toContain('غیرفعال');
  });
});

describe('R-ACC-02 — ⚠️ دامنهٔ حسابدار', () => {
  const all = [1, 2, 3];

  it('مدیرِ مالی همهٔ حساب‌ها را می‌بیند', () => {
    expect(visibleAccountIds({ seesAll: true, assignedAccountIds: [], allAccountIds: all }))
      .toEqual([1, 2, 3]);
  });

  it('⚠️ حسابدارِ محدود فقط حساب‌های تخصیص‌یافته را می‌بیند', () => {
    // بدونِ این، هر کسی با مجوزِ خواندنِ مالی مانده و تراکنشِ همهٔ حساب‌ها را می‌دید.
    expect(visibleAccountIds({ seesAll: false, assignedAccountIds: [2], allAccountIds: all }))
      .toEqual([2]);
  });

  it('حسابدارِ بی‌تخصیص هیچ حسابی نمی‌بیند', () => {
    expect(visibleAccountIds({ seesAll: false, assignedAccountIds: [], allAccountIds: all }))
      .toEqual([]);
  });

  it('تخصیصِ حسابی که وجود ندارد چیزی اضافه نمی‌کند', () => {
    expect(visibleAccountIds({ seesAll: false, assignedAccountIds: [99], allAccountIds: all }))
      .toEqual([]);
  });

  it('گاردِ حسابِ منفرد هم همان قاعده را دارد', () => {
    expect(canSeeAccount(2, { seesAll: false, assignedAccountIds: [2] })).toBe(true);
    expect(canSeeAccount(3, { seesAll: false, assignedAccountIds: [2] })).toBe(false);
    expect(canSeeAccount(3, { seesAll: true, assignedAccountIds: [] })).toBe(true);
  });
});
