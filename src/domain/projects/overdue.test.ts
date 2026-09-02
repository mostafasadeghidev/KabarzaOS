import { describe, expect, it } from 'vitest';
import { isDeadlineSoon, isOverdueProject } from './lifecycle';

describe('گذشته از ددلاین — همان رفتارِ نسخهٔ قبلی', () => {
  const today = '2026-09-02';

  it('ددلاینِ گذشته روی پروژهٔ فعال یا حتی تکمیل‌شده', () => {
    expect(isOverdueProject({ deadline: '2026-09-01', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(true);
    // تکمیل‌شده تا وقتی بایگانی نشده شمرده می‌شود.
    expect(isOverdueProject({ deadline: '2026-09-01', isArchived: false, statusGroup: 'completed' }, today)).toBe(true);
  });

  it('⚠️ پروژهٔ منجمد (کنسل/نگه‌داشته/بایگانی) هرگز «گذشته از ددلاین» نیست', () => {
    expect(isOverdueProject({ deadline: '2026-09-01', isArchived: false, statusGroup: 'cancelled' }, today)).toBe(false);
    expect(isOverdueProject({ deadline: '2026-09-01', isArchived: false, statusGroup: 'on_hold' }, today)).toBe(false);
    expect(isOverdueProject({ deadline: '2026-09-01', isArchived: true, statusGroup: 'in_progress' }, today)).toBe(false);
  });

  it('امروز و آینده گذشته نیست؛ بدونِ ددلاین هم نه', () => {
    expect(isOverdueProject({ deadline: '2026-09-02', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(false);
    expect(isOverdueProject({ deadline: null, isArchived: false, statusGroup: 'in_progress' }, today)).toBe(false);
  });

  it('ددلاینِ نزدیک: تا هفت روز، و نه روی پروژهٔ منجمد', () => {
    expect(isDeadlineSoon({ deadline: '2026-09-02', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(true);
    expect(isDeadlineSoon({ deadline: '2026-09-09', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(true);
    expect(isDeadlineSoon({ deadline: '2026-09-10', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(false);
    expect(isDeadlineSoon({ deadline: '2026-09-05', isArchived: false, statusGroup: 'on_hold' }, today)).toBe(false);
    expect(isDeadlineSoon({ deadline: '2026-09-01', isArchived: false, statusGroup: 'in_progress' }, today)).toBe(false);
  });
});
