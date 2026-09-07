import { describe, it, expect } from 'vitest';
import {
  isDoneStatus, queuedStatusId, readyStatusId, statusForDependency, tasksToRelease,
  type StatusInfo,
} from '../dependency';

/** «در نوبت» یعنی پشتِ کارِ دیگری در صف — نه یک برچسبِ تزیینی. */

const STATUSES: StatusInfo[] = [
  { id: 1, group: 'todo', slug: 'not-started' },
  { id: 2, group: 'todo', slug: 'next-up' },
  { id: 3, group: 'in_progress', slug: 'in-progress' },
  { id: 4, group: 'complete', slug: 'done', isClosed: true },
];

describe('شناختِ وضعیت‌ها', () => {
  it('«در نوبت» و «آمادهٔ شروع» را از هم جدا می‌کند', () => {
    expect(queuedStatusId(STATUSES)).toBe(2);
    expect(readyStatusId(STATUSES)).toBe(1);
  });

  it('نبودِ تگِ «در نوبت» خطا نمی‌دهد', () => {
    const without = STATUSES.filter((s) => s.slug !== 'next-up');
    expect(queuedStatusId(without)).toBeNull();
  });

  it('تمام‌شده = پرچمِ بسته یا گروهِ complete', () => {
    expect(isDoneStatus(STATUSES[3])).toBe(true);
    expect(isDoneStatus(STATUSES[0])).toBe(false);
    expect(isDoneStatus(null)).toBe(false);
  });
});

describe('statusForDependency', () => {
  it('وابستگیِ باز → تسک «در نوبت» می‌شود', () => {
    expect(statusForDependency(1, false, STATUSES)).toBe(2);
    expect(statusForDependency(null, false, STATUSES)).toBe(2);
  });

  it('بدونِ وابستگی یا با وابستگیِ تمام‌شده، انتخابِ کاربر می‌ماند', () => {
    expect(statusForDependency(1, null, STATUSES)).toBe(1);
    expect(statusForDependency(1, true, STATUSES)).toBe(1);
  });

  it('⚠️ کاری که واقعاً شروع شده به صف برنمی‌گردد', () => {
    expect(statusForDependency(3, false, STATUSES)).toBe(3);
    expect(statusForDependency(4, false, STATUSES)).toBe(4);
  });

  it('بدونِ تگِ «در نوبت»، همان انتخاب می‌ماند', () => {
    const without = STATUSES.filter((s) => s.slug !== 'next-up');
    expect(statusForDependency(1, false, without)).toBe(1);
  });
});

describe('tasksToRelease', () => {
  it('فقط تسک‌های «در نوبت» آزاد می‌شوند و به «آمادهٔ شروع» می‌روند', () => {
    const out = tasksToRelease(
      [{ id: 10, statusTagId: 2 }, { id: 11, statusTagId: 3 }, { id: 12, statusTagId: 2 }],
      STATUSES,
    );
    expect(out.taskIds).toEqual([10, 12]);
    expect(out.statusTagId).toBe(1);
  });

  it('⚠️ تسکی که کاربر خودش جای دیگری برده دست نمی‌خورد', () => {
    const out = tasksToRelease([{ id: 10, statusTagId: 3 }], STATUSES);
    expect(out.taskIds).toEqual([]);
  });

  it('بدونِ تگِ «در نوبت» چیزی آزاد نمی‌شود', () => {
    const without = STATUSES.filter((s) => s.slug !== 'next-up');
    expect(tasksToRelease([{ id: 10, statusTagId: 2 }], without).taskIds).toEqual([]);
  });
});
