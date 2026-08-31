import { describe, it, expect } from 'vitest';
import {
  canSignIn, hasFinanceAccess, isInactive, isLocked, normalizeState,
  planRemovePerson, removeMessage, stateLabel, type RemoveContext,
} from './offboarding';

const ctx = (over: Partial<RemoveContext> = {}): RemoveContext => ({
  exists: true, hasOtherRoles: false, isSystemAdmin: false, hasFootprint: false, ...over,
});

describe('R-PEOPLE-01 — سه حالتِ عضو', () => {
  it('فقط «فعال» فعال است', () => {
    expect(isInactive('active')).toBe(false);
    expect(isInactive('finance')).toBe(true);
    expect(isInactive('locked')).toBe(true);
  });

  it('⚠️ «فقط مالی» با «قطع‌شده» یکی نیست', () => {
    // کسی که رفته ولی تسویه‌نشده دارد باید صورت‌حسابِ خودش را ببیند.
    expect(hasFinanceAccess('finance')).toBe(true);
    expect(hasFinanceAccess('locked')).toBe(false);
    expect(isLocked('locked')).toBe(true);
    expect(isLocked('finance')).toBe(false);
  });

  it('برچسبِ کارت برای هر حالت', () => {
    expect(stateLabel('active')).toBeNull();
    expect(stateLabel('finance')).toBe('سابق · فقط مالی');
    expect(stateLabel('locked')).toBe('سابق · قطع‌شده');
  });

  it('حالتِ ناشناخته به «فعال» می‌افتد', () => {
    expect(normalizeState('bogus')).toBe('active');
    expect(normalizeState('')).toBe('active');
    expect(normalizeState('finance')).toBe('finance');
  });
});

describe('R-PEOPLE-02 — «حذف» چهار سرانجام دارد', () => {
  it('کاربرِ ناموجود کاری ندارد', () => {
    expect(planRemovePerson(ctx({ exists: false }))).toBe('noop');
  });

  it('⚠️ مالک/ادمین هرگز از این صفحه حذف نمی‌شود — فقط نقشش برداشته می‌شود', () => {
    expect(planRemovePerson(ctx({ isSystemAdmin: true }))).toBe('detached');
    // حتی اگر ردِ پا هم داشته باشد.
    expect(planRemovePerson(ctx({ isSystemAdmin: true, hasFootprint: true }))).toBe('detached');
  });

  it('کاربری با نقشِ دیگر فقط از این بخش جدا می‌شود', () => {
    expect(planRemovePerson(ctx({ hasOtherRoles: true }))).toBe('detached');
  });

  it('⚠️ کاربری با ردِ پای مالی/کاری حذف نمی‌شود؛ قطع می‌شود', () => {
    // وگرنه ردیفِ پرداختش بی‌صاحب می‌ماند.
    expect(planRemovePerson(ctx({ hasFootprint: true }))).toBe('deactivated');
  });

  it('کاربرِ خالص و بی‌ردِ پا واقعاً حذف می‌شود', () => {
    expect(planRemovePerson(ctx())).toBe('deleted');
  });

  it('⚠️ پیام سرانجامِ واقعی را می‌گوید، نه آنچه کاربر کلیک کرده', () => {
    expect(removeMessage('deactivated')).toContain('دسترسی‌اش قطع شد');
    expect(removeMessage('deleted')).toContain('حذف/جدا شد');
    expect(removeMessage('detached')).toContain('حذف/جدا شد');
    expect(removeMessage('noop')).toContain('یافت نشد');
  });
});

describe('R-PEOPLE-03 — چه کسی می‌تواند وارد شود', () => {
  it('عضوِ فعال وارد می‌شود', () => {
    expect(canSignIn('active', false)).toBe(true);
  });

  it('⚠️ عضوِ «فقط مالی» هم وارد می‌شود', () => {
    // وگرنه قابلیتی که این حالت برایش ساخته شده بی‌اثر می‌شد.
    expect(canSignIn('finance', false)).toBe(true);
  });

  it('عضوِ «قطع‌شده» مسدود است', () => {
    expect(canSignIn('locked', false)).toBe(false);
  });

  it('کاربرِ حذف‌شده در هر حالتی مسدود است', () => {
    expect(canSignIn('active', true)).toBe(false);
    expect(canSignIn('finance', true)).toBe(false);
  });
});
