import { describe, expect, it } from 'vitest';
import {
  currentLevel, hiddenTabsFrom, hideRowsFor, isStorablePermission,
  levelsOf, permissionsFor, REPORT_TABS, SECTION_ACCESS,
} from '../staff-levels';

const section = (key: string) => SECTION_ACCESS.find((s) => s.key === key)!;

describe('currentLevel', () => {
  it('غنی‌ترین سطح را برمی‌دارد، نه اولین سطحِ منطبق', () => {
    // اگر از اول می‌گشت، «ارسال و خواندن» به «فقط ارسال» تنزل می‌کرد.
    const granted = new Set(['messages.send', 'messages.read']);
    expect(currentLevel(section('messages'), granted)).toBe('sendread');
  });

  it('سطحی که همهٔ مجوزهایش را ندارد انتخاب نمی‌شود', () => {
    expect(currentLevel(section('messages'), new Set(['messages.send']))).toBe('send');
  });

  it('گزارش‌ها فقط سطحِ دسترسی دارد', () => {
    expect(currentLevel(section('reports'), new Set(['reports.view']))).toBe('view');
    expect(section('reports').levels.map((l) => l.value)).toEqual(['none', 'view']);
  });

  it('مالی نمای فقط‌خواندنی ندارد', () => {
    expect(section('finance').levels.map((l) => l.value)).toEqual(['none', 'manage']);
  });

  it('بدونِ مجوز، none است', () => {
    expect(currentLevel(section('projects'), new Set())).toBe('none');
  });
});

describe('permissionsFor', () => {
  it('سطوح را به مجوز تبدیل می‌کند', () => {
    expect(permissionsFor({ projects: 'manage', reports: 'view' }).sort())
      .toEqual(['projects.manage', 'reports.view']);
  });

  it('سطحِ ناشناخته دسترسی نمی‌دهد', () => {
    expect(permissionsFor({ finance: 'superuser' })).toEqual([]);
  });

  it('رفت‌وبرگشت پایدار است', () => {
    const perms = permissionsFor({ messages: 'sendread', members: 'view' });
    expect(levelsOf(perms).messages).toBe('sendread');
    expect(levelsOf(perms).members).toBe('view');
  });
});

describe('تب‌های گزارش', () => {
  it('پنهان ذخیره می‌شود تا تبِ جدید پیش‌فرض دیده شود', () => {
    expect(hideRowsFor(REPORT_TABS.map((t) => t.key))).toEqual([]);
    expect(hideRowsFor(['overall'])).toContain('reports.hide:members');
  });

  it('کلیدِ ناشناخته خوانده نمی‌شود', () => {
    expect(hiddenTabsFrom(['reports.hide:members', 'reports.hide:junk'])).toEqual(['members']);
  });

  it('فقط مقادیرِ شناخته‌شده ذخیره‌شدنی‌اند', () => {
    expect(isStorablePermission('projects.view')).toBe(true);
    expect(isStorablePermission('reports.hide:hours')).toBe(true);
    expect(isStorablePermission('reports.hide:junk')).toBe(false);
    expect(isStorablePermission('manage_options')).toBe(false);
  });
});
