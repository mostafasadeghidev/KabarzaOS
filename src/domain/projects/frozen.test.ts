import { describe, expect, it } from 'vitest';
import { isFrozenProject, isOpenProject } from './lifecycle';

describe('پروژهٔ منجمد', () => {
  it('بایگانی همیشه منجمد است', () => {
    expect(isFrozenProject({ isArchived: true, statusGroup: 'in_progress' })).toBe(true);
  });

  it('⚠️ لغوشده و متوقف هم منجمدند، حتی بدونِ بایگانی', () => {
    expect(isFrozenProject({ isArchived: false, statusGroup: 'cancelled' })).toBe(true);
    expect(isFrozenProject({ isArchived: false, statusGroup: 'on_hold' })).toBe(true);
  });

  it('در حالِ انجام و تکمیل‌شده منجمد نیستند', () => {
    // ⚠️ «تکمیل‌شده» بسته است ولی منجمد نیست: ثبتِ ساعتِ عقب‌افتاده هنوز
    // ممکن است لازم شود. نسخهٔ قبلی هم همین تفکیک را دارد.
    expect(isFrozenProject({ isArchived: false, statusGroup: 'in_progress' })).toBe(false);
    expect(isFrozenProject({ isArchived: false, statusGroup: 'completed' })).toBe(false);
  });

  it('بی‌وضعیت منجمد نیست', () => {
    expect(isFrozenProject({ isArchived: false, statusGroup: null })).toBe(false);
    expect(isFrozenProject({ isArchived: false })).toBe(false);
  });
});

describe('پروژهٔ باز', () => {
  it('⚠️ بی‌وضعیت باز است، نه بسته', () => {
    expect(isOpenProject({})).toBe(true);
    expect(isOpenProject({ isClosed: null })).toBe(true);
  });

  it('تگِ بسته یعنی بسته', () => {
    expect(isOpenProject({ isClosed: true })).toBe(false);
    expect(isOpenProject({ isClosed: false })).toBe(true);
  });
});
