import { describe, it, expect } from 'vitest';
import { handoverPlan, tasksToAutoAssign, type OpenRoleTask } from '../role-assignment';

const DEV_ROLE = 5, DESIGN_ROLE = 6;
const DEV1 = 10, DEV2 = 20, NEW = 30;

const roleTask = (over: Partial<OpenRoleTask> & { taskId: number }): OpenRoleTask => ({
  roleTagId: DEV_ROLE, claimedBy: null, assignedTo: null, ...over,
});

describe('tasksToAutoAssign', () => {
  const open = [
    roleTask({ taskId: 1 }),
    roleTask({ taskId: 2, claimedBy: DEV1 }),
    roleTask({ taskId: 3, assignedTo: DEV1 }),
    roleTask({ taskId: 4, roleTagId: DESIGN_ROLE }),
  ];

  it('تنها دارندهٔ نقش → تسک‌های بازِ همان نقش خودکار به نامش می‌خورند', () => {
    const out = tasksToAutoAssign(open, { userId: NEW, roleTagId: DEV_ROLE }, new Map([[DEV_ROLE, 1]]));
    expect(out).toEqual([1]);
  });

  it('چند دارنده → هیچ‌کدام خودکار نمی‌خورد (خودشان برمی‌دارند)', () => {
    const out = tasksToAutoAssign(open, { userId: NEW, roleTagId: DEV_ROLE }, new Map([[DEV_ROLE, 2]]));
    expect(out).toEqual([]);
  });

  it('عضوِ بی‌نقش چیزی نمی‌گیرد', () => {
    expect(tasksToAutoAssign(open, { userId: NEW, roleTagId: null }, new Map())).toEqual([]);
  });

  it('نقشِ دیگر تسکِ این نقش را برنمی‌دارد', () => {
    const out = tasksToAutoAssign(open, { userId: NEW, roleTagId: DESIGN_ROLE }, new Map([[DESIGN_ROLE, 1]]));
    expect(out).toEqual([4]);
  });
});

describe('handoverPlan', () => {
  it('یک جانشینِ هم‌نقش → تسک به او منتقل می‌شود', () => {
    const plan = handoverPlan(
      [{ taskId: 1, roleTagIds: [DEV_ROLE] }],
      { userId: DEV1, roleTagIds: [DEV_ROLE] },
      new Map([[DEV_ROLE, [DEV1, DEV2]]]),
    );
    expect(plan).toEqual([{ taskId: 1, toUserId: DEV2 }]);
  });

  it('بدونِ جانشین → به نقش برمی‌گردد', () => {
    const plan = handoverPlan(
      [{ taskId: 1, roleTagIds: [DEV_ROLE] }],
      { userId: DEV1, roleTagIds: [DEV_ROLE] },
      new Map([[DEV_ROLE, [DEV1]]]),
    );
    expect(plan).toEqual([{ taskId: 1, toUserId: null }]);
  });

  it('چند جانشین → به نقش برمی‌گردد تا یکی برش دارد', () => {
    const plan = handoverPlan(
      [{ taskId: 1, roleTagIds: [DEV_ROLE] }],
      { userId: DEV1, roleTagIds: [DEV_ROLE] },
      new Map([[DEV_ROLE, [DEV1, DEV2, NEW]]]),
    );
    expect(plan).toEqual([{ taskId: 1, toUserId: null }]);
  });

  it('تسکِ بی‌نقش از نقشِ خودِ فردِ در حالِ رفتن استفاده می‌کند', () => {
    const plan = handoverPlan(
      [{ taskId: 7, roleTagIds: [] }],
      { userId: DEV1, roleTagIds: [DEV_ROLE] },
      new Map([[DEV_ROLE, [DEV1, DEV2]]]),
    );
    expect(plan).toEqual([{ taskId: 7, toUserId: DEV2 }]);
  });
});
