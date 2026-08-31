import { describe, it, expect } from 'vitest';
import { planQaApply, qaProgress, qaToggle, type QaLibraryItem } from './qa';

const library: QaLibraryItem[] = [
  { id: 1, title: 'تست موبایل', description: '', roleTagId: 10, isTask: true },
  { id: 2, title: 'بررسی سرعت', description: '', roleTagId: 10, isTask: false },
  { id: 3, title: 'تأییدِ طرح', description: '', roleTagId: 0, isTask: true },   // کارفرما
  { id: 4, title: 'امضای قرارداد', description: '', roleTagId: 0, isTask: false },
  { id: 5, title: 'کارِ طراح', description: '', roleTagId: 20, isTask: true },
];

describe('اعمالِ چک‌لیستِ QA', () => {
  it('بدونِ مخاطب هیچ‌چیز اعمال نمی‌شود', () => {
    expect(planQaApply(library, []).entries).toEqual([]);
  });

  it('فقط آیتم‌های نقش‌های انتخاب‌شده می‌آیند', () => {
    const plan = planQaApply(library, [10]);
    expect(plan.appliedIds).toEqual([1, 2]);
  });

  it('آیتمِ تسک‌سازِ نقش، تسکی می‌سازد که به **نقش** تخصیص می‌یابد', () => {
    const plan = planQaApply(library, [10]);
    const first = plan.entries[0]!;
    expect(first.kind).toBe('task');
    expect(first.kind === 'task' && first.assignRoleTagId).toBe(10);
  });

  it('آیتمِ غیرِ تسک ردیفِ چک‌لیست می‌شود', () => {
    const plan = planQaApply(library, [10]);
    expect(plan.entries[1]!.kind).toBe('checklist');
  });

  it('⚠️ آیتمِ قبلاً اعمال‌شده دوباره اعمال نمی‌شود', () => {
    const plan = planQaApply(library, [10], { appliedItemIds: new Set([1]) });
    expect(plan.appliedIds).toEqual([2]);
  });

  it('R-QA-02 — مخاطبِ کارفرما با توکنِ client انتخاب می‌شود', () => {
    const plan = planQaApply(library, ['client'], { primaryClientId: 7 });
    expect(plan.appliedIds).toEqual([3, 4]);
  });

  it('⚠️ تسکِ کارفرما به **شخصِ** کارفرما می‌خورد، نه به نقش', () => {
    // کارفرما نقشِ تیمی ندارد، پس تخصیصِ نقشی برایش بی‌معناست.
    const plan = planQaApply(library, ['client'], { primaryClientId: 7 });
    const first = plan.entries[0]!;
    expect(first.kind).toBe('client_task');
    expect(first.kind === 'client_task' && first.assignUserId).toBe(7);
  });

  it('⚠️ تسکِ کارفرما روی پروژهٔ بی‌کارفرما به چک‌لیست تبدیل می‌شود، نه اینکه گم شود', () => {
    const plan = planQaApply(library, ['client'], { primaryClientId: null });
    expect(plan.entries.map((e) => e.kind)).toEqual(['checklist', 'checklist']);
    expect(plan.appliedIds).toEqual([3, 4]);
  });

  it('چند مخاطب با هم کار می‌کنند', () => {
    const plan = planQaApply(library, [10, 20, 'client'], { primaryClientId: 7 });
    expect(plan.appliedIds).toEqual([1, 2, 3, 4, 5]);
  });

  it('صفر به‌عنوانِ عدد هم مخاطبِ کارفرما است', () => {
    const plan = planQaApply(library, [0], { primaryClientId: 7 });
    expect(plan.appliedIds).toEqual([3, 4]);
  });
});

describe('تیک و پیشرفتِ چک‌لیست', () => {
  it('⚠️ مهرِ «انجام‌شده توسط» فقط هنگامِ تیک‌زدن می‌خورد', () => {
    // وگرنه نامِ کسی که تیک را برداشته به‌جای انجام‌دهنده می‌نشست.
    expect(qaToggle(false)).toEqual({ isDone: true, stampDoer: true });
    expect(qaToggle(true)).toEqual({ isDone: false, stampDoer: false });
  });

  it('پیشرفت بدونِ آیتم صفر است، نه NaN', () => {
    expect(qaProgress(0, 0)).toBe(0);
    expect(qaProgress(3, 1)).toBe(33);
    expect(qaProgress(4, 4)).toBe(100);
  });
});
