import { describe, it, expect } from 'vitest';
import { isOwnTask, visibleTasksForMember, type TaskRoleRef, type VisibilityTask } from '../task-visibility';

/** دیدِ عضوِ ساده روی تختهٔ پروژه: کارِ خودم، نقشِ برنداشته، و آنچه منتظرش هستم. */

const DEV1 = 10, DEV2 = 20, MANAGER = 1;
const DEV_ROLE = 5, DESIGN_ROLE = 6;

const task = (over: Partial<VisibilityTask> & { id: number }): VisibilityTask => ({
  assignedTo: null, isPrivate: false, createdBy: MANAGER, dependsOn: null, ...over,
});

const dev1 = { userId: DEV1, roleTagIds: [DEV_ROLE] };
const dev2 = { userId: DEV2, roleTagIds: [DEV_ROLE] };

describe('isOwnTask', () => {
  it('تسکِ سپرده‌شده به خودم دیده می‌شود، مالِ دیگری نه', () => {
    const mine = task({ id: 1, assignedTo: DEV1 });
    expect(isOwnTask(mine, [], dev1)).toBe(true);
    expect(isOwnTask(mine, [], dev2)).toBe(false);
  });

  it('تسکِ نقشیِ برنداشته برای همهٔ دارندگانِ نقش دیده می‌شود', () => {
    const roleTask = task({ id: 2 });
    const roles: TaskRoleRef[] = [{ taskId: 2, roleTagId: DEV_ROLE, claimedBy: null }];
    expect(isOwnTask(roleTask, roles, dev1)).toBe(true);
    expect(isOwnTask(roleTask, roles, dev2)).toBe(true);
  });

  it('پس از برداشتن، فقط برای برداشتش می‌ماند', () => {
    const roleTask = task({ id: 2 });
    const roles: TaskRoleRef[] = [{ taskId: 2, roleTagId: DEV_ROLE, claimedBy: DEV1 }];
    expect(isOwnTask(roleTask, roles, dev1)).toBe(true);
    expect(isOwnTask(roleTask, roles, dev2)).toBe(false);
  });

  it('نقشی که ندارم تسکش را نشان نمی‌دهد', () => {
    const roles: TaskRoleRef[] = [{ taskId: 3, roleTagId: DESIGN_ROLE, claimedBy: null }];
    expect(isOwnTask(task({ id: 3 }), roles, dev1)).toBe(false);
  });

  it('تسکِ خصوصیِ خودم دیده می‌شود', () => {
    expect(isOwnTask(task({ id: 4, isPrivate: true, createdBy: DEV1 }), [], dev1)).toBe(true);
    expect(isOwnTask(task({ id: 4, isPrivate: true, createdBy: DEV1 }), [], dev2)).toBe(false);
  });
});

describe('visibleTasksForMember', () => {
  it('وابستگی استثناست: تسکِ نفرِ دیگر که تسکِ من به آن وابسته است دیده می‌شود', () => {
    const rows = [
      task({ id: 1, assignedTo: DEV1 }),
      task({ id: 2, assignedTo: DEV2, dependsOn: 1 }),
      task({ id: 3, assignedTo: DEV1 }),
    ];
    expect(visibleTasksForMember(rows, [], dev2).map((t) => t.id)).toEqual([1, 2]);
  });

  it('زنجیرهٔ وابستگی تا ته دنبال می‌شود', () => {
    const rows = [
      task({ id: 1, assignedTo: MANAGER }),
      task({ id: 2, assignedTo: MANAGER, dependsOn: 1 }),
      task({ id: 3, assignedTo: DEV2, dependsOn: 2 }),
    ];
    expect(visibleTasksForMember(rows, [], dev2).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('حلقهٔ وابستگیِ خراب باعثِ گیر نمی‌شود', () => {
    const rows = [
      task({ id: 1, assignedTo: DEV2, dependsOn: 2 }),
      task({ id: 2, assignedTo: MANAGER, dependsOn: 1 }),
    ];
    expect(visibleTasksForMember(rows, [], dev2).map((t) => t.id)).toEqual([1, 2]);
  });

  it('ترتیبِ ورودی می‌ماند و چیزی تکرار نمی‌شود', () => {
    const rows = [task({ id: 9, assignedTo: DEV1 }), task({ id: 3, assignedTo: DEV1 })];
    expect(visibleTasksForMember(rows, [], dev1).map((t) => t.id)).toEqual([9, 3]);
  });
});
