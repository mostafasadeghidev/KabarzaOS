import { describe, expect, it } from 'vitest';
import { hasFinanceCap, permissionsFromCaps } from '../tag-caps';
import { FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP, OFFICE_MANAGER_CAP, PM_CAP } from '../project-scope';

describe('دسترسی از تگِ نقش — پورتِ sync_caps_from_tags', () => {
  it('⚠️ تگِ «مدیر حسابداری» دیدن و مدیریتِ مالی می‌دهد', () => {
    expect(permissionsFromCaps([MANAGE_FINANCE_CAP]).sort()).toEqual(['finance.manage', 'finance.view']);
  });

  it('تگِ «حسابدار» فقط دیدنِ مالی — دامنه‌اش حساب‌های تخصیص‌یافته است', () => {
    expect(permissionsFromCaps([FINANCE_SCOPED_CAP])).toEqual(['finance.view']);
  });

  it('pm و office_manager ساختاری‌اند و مجوزی نمی‌دهند؛ تکرار یکی می‌شود', () => {
    expect(permissionsFromCaps([PM_CAP, OFFICE_MANAGER_CAP, ''])).toEqual([]);
    expect(permissionsFromCaps([FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP, FINANCE_SCOPED_CAP]).sort())
      .toEqual(['finance.manage', 'finance.view']);
  });

  it('کاندیدای حسابداریِ حساب: دارندهٔ هر یک از دو تگِ مالی', () => {
    expect(hasFinanceCap([FINANCE_SCOPED_CAP])).toBe(true);
    expect(hasFinanceCap([MANAGE_FINANCE_CAP])).toBe(true);
    expect(hasFinanceCap([PM_CAP])).toBe(false);
  });
});
