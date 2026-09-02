import { describe, expect, it } from 'vitest';
import {
  canCreateGeneralMeeting, canManageMeeting, generalOfficeScope,
} from '../meeting-authority';

describe('جلسهٔ عمومی — چه کسی و از کدام دفتر', () => {
  it('مالک/مدیرِ بخش: دفترِ انتخابی، یا همهٔ دفاتر', () => {
    const ctx = { hasGlobal: true, managedOfficeIds: [] };
    expect(canCreateGeneralMeeting(ctx)).toBe(true);
    expect(generalOfficeScope(ctx, 4)).toEqual({ officeId: 4, officeIds: [4] });
    expect(generalOfficeScope(ctx, null)).toEqual({ officeId: null, officeIds: null });
  });

  it('⚠️ مدیرِ دفتر فقط دفاترِ خودش — دفترِ غریبه بی‌صدا به دفاترِ خودش می‌افتد', () => {
    // نسخهٔ قبلی دفترِ درخواستیِ مدیرِ دفتر را نادیده می‌گرفت؛ اینجا اگر مالِ
    // خودش باشد پذیرفته می‌شود، وگرنه همان رفتار.
    const ctx = { hasGlobal: false, managedOfficeIds: [2, 3] };
    expect(canCreateGeneralMeeting(ctx)).toBe(true);
    expect(generalOfficeScope(ctx, 2)).toEqual({ officeId: 2, officeIds: [2] });
    expect(generalOfficeScope(ctx, 9)).toEqual({ officeId: null, officeIds: [2, 3] });
    expect(generalOfficeScope(ctx, null)).toEqual({ officeId: null, officeIds: [2, 3] });
  });

  it('عضوِ عادی جلسهٔ عمومی نمی‌سازد', () => {
    const ctx = { hasGlobal: false, managedOfficeIds: [] };
    expect(canCreateGeneralMeeting(ctx)).toBe(false);
    expect(generalOfficeScope(ctx, 1)).toBeNull();
  });
});

describe('ویرایش/حذف — سازنده، مدیرِ پروژه‌اش، یا مدیرِ سراسری', () => {
  it('هر یک از سه شرط کافی است', () => {
    expect(canManageMeeting({ isCreator: true, hasGlobal: false, managesProject: false })).toBe(true);
    expect(canManageMeeting({ isCreator: false, hasGlobal: true, managesProject: false })).toBe(true);
    expect(canManageMeeting({ isCreator: false, hasGlobal: false, managesProject: true })).toBe(true);
  });

  it('⚠️ دعوت‌شده‌ای که هیچ‌کدام نیست، نمی‌تواند', () => {
    expect(canManageMeeting({ isCreator: false, hasGlobal: false, managesProject: false })).toBe(false);
  });
});
