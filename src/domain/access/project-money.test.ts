import { describe, expect, it } from 'vitest';
import {
  canSeeProjectFinance, canSeeProjectPrice, isPlainMember, type MoneyAudience,
} from './project-money';

const base: MoneyAudience = {
  hasGlobalProjectManage: false,
  hasGlobalFinanceManage: false,
  isClientOfProject: false,
  isMemberOfProject: false,
};

describe('دیدنِ پولِ پروژه', () => {
  it('مالک/مدیرِ سراسریِ پروژه‌ها قیمت را می‌بیند', () => {
    expect(canSeeProjectPrice({ ...base, hasGlobalProjectManage: true })).toBe(true);
  });

  it('مدیرِ مالی قیمت را می‌بیند', () => {
    expect(canSeeProjectPrice({ ...base, hasGlobalFinanceManage: true })).toBe(true);
  });

  it('کارفرمای همین پروژه قیمت را می‌بیند — صورت‌حسابِ خودش است', () => {
    expect(canSeeProjectPrice({ ...base, isClientOfProject: true })).toBe(true);
  });

  /**
   * ⚠️ همان باگی که کاربر گزارش کرد: قیمت بی‌محافظ رندر می‌شد و هر عضوی
   * مبلغِ قراردادِ کارفرما را می‌دید.
   */
  it('عضوِ عادی قیمت را نمی‌بیند', () => {
    expect(canSeeProjectPrice({ ...base, isMemberOfProject: true })).toBe(false);
  });

  /**
   * ⚠️ مدیرِ پروژه و مدیرِ دفتر عمداً بیرون‌اند — کامنتِ نسخهٔ قبلی:
   * «A team/office manager or pure project manager does NOT».
   * اینها `canManageProject` را رد می‌کنند ولی مجوزِ **سراسری** ندارند.
   */
  it('مدیرِ پروژه/دفتر بدونِ مجوزِ سراسری، نه قیمت می‌بیند نه تبِ مالی', () => {
    const pm = { ...base, isMemberOfProject: false };
    expect(canSeeProjectPrice(pm)).toBe(false);
    expect(canSeeProjectFinance(pm)).toBe(false);
  });

  it('عضوِ خالص تبِ مالی دارد — برای دستمزدِ خودش', () => {
    const member = { ...base, isMemberOfProject: true };
    expect(isPlainMember(member)).toBe(true);
    expect(canSeeProjectFinance(member)).toBe(true);
  });

  it('کارفرمایی که عضو هم هست، عضوِ خالص نیست', () => {
    const both = { ...base, isMemberOfProject: true, isClientOfProject: true };
    expect(isPlainMember(both)).toBe(false);
    expect(canSeeProjectPrice(both)).toBe(true);
  });

  it('مالکی که روی پروژه امضا شده هم عضوِ خالص نیست', () => {
    const owner = { ...base, isMemberOfProject: true, hasGlobalProjectManage: true };
    expect(isPlainMember(owner)).toBe(false);
  });
});
