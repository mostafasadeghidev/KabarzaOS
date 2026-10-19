import { describe, expect, it } from 'vitest';
import { canSetTaskStatus, type TaskStatusAuthorityInput } from './task-status-authority';

const base: TaskStatusAuthorityInput = {
  userId: 7, managesProject: false, assignedTo: null, createdBy: null, roles: [], userRoleTagIds: [],
};

describe('چه کسی وضعیتِ تسک را عوض می‌کند', () => {
  it('مدیرِ پروژه همیشه', () => {
    expect(canSetTaskStatus({ ...base, managesProject: true, assignedTo: 99 })).toBe(true);
  });

  it('⚠️ تسکِ سپرده‌شده فقط برای خودِ مسئول — نه همکار، نه سازنده', () => {
    expect(canSetTaskStatus({ ...base, assignedTo: 7 })).toBe(true);
    expect(canSetTaskStatus({ ...base, assignedTo: 8 })).toBe(false);
    expect(canSetTaskStatus({ ...base, assignedTo: 8, createdBy: 7 })).toBe(false);
  });

  it('تسکِ نقشیِ بی‌مسئول: دارندهٔ نقشی که کسِ دیگری برنداشته', () => {
    const roles = [{ roleTagId: 3, claimedBy: null }];
    expect(canSetTaskStatus({ ...base, roles, userRoleTagIds: [3] })).toBe(true);
    expect(canSetTaskStatus({ ...base, roles, userRoleTagIds: [4] })).toBe(false);
    expect(canSetTaskStatus({ ...base, roles: [{ roleTagId: 3, claimedBy: 7 }], userRoleTagIds: [3] })).toBe(true);
    // ⚠️ هم‌نقشی که نقش را برداشته، کار را مالِ خودش کرده است.
    expect(canSetTaskStatus({ ...base, roles: [{ roleTagId: 3, claimedBy: 8 }], userRoleTagIds: [3] })).toBe(false);
  });

  it('تسکِ بی‌مسئول و بی‌نقش: فقط سازنده', () => {
    expect(canSetTaskStatus({ ...base, createdBy: 7 })).toBe(true);
    expect(canSetTaskStatus({ ...base, createdBy: 8 })).toBe(false);
  });
});
