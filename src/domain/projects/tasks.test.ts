import { describe, it, expect } from 'vitest';
import { rolesToClaim, taskDoers, newlyAssigned, isDone, isOpen } from './tasks';

describe('R-PROJ-13 — ساین‌کردن per-role است', () => {
  const roles = [
    { roleTagId: 10, claimedBy: null },  // دولوپر، آزاد
    { roleTagId: 20, claimedBy: null },  // طراح، آزاد
  ];

  it('فقط نقشی که کاربر دارد ساین می‌شود', () => {
    expect(rolesToClaim(roles, [10])).toEqual([10]);
  });

  it('نقشِ دیگر آزاد می‌ماند — طراح تسکش را از دست نمی‌دهد', () => {
    expect(rolesToClaim(roles, [10])).not.toContain(20);
  });

  it('نقشِ ساین‌شده دوباره ساین نمی‌شود', () => {
    expect(rolesToClaim([{ roleTagId: 10, claimedBy: 7 }], [10])).toEqual([]);
  });

  it('کاربرِ بدونِ نقشِ مرتبط چیزی نمی‌گیرد', () => {
    expect(rolesToClaim(roles, [99])).toEqual([]);
  });

  it('کاربرِ دو-نقشه هر دو را می‌گیرد', () => {
    expect(rolesToClaim(roles, [10, 20])).toEqual([10, 20]);
  });
});

describe('انجام‌دهندگانِ تسک', () => {
  const holders = new Map([[10, [1, 2]], [20, [3]]]);

  it('مسئولِ مستقیم بر نقش مقدم است', () => {
    expect(taskDoers({ assignedTo: 9, roles: [{ roleTagId: 10, claimedBy: null }] }, holders)).toEqual([9]);
  });

  it('نقشِ ساین‌نشده یعنی همهٔ دارندگانِ آن نقش', () => {
    expect(taskDoers({ assignedTo: null, roles: [{ roleTagId: 10, claimedBy: null }] }, holders)).toEqual([1, 2]);
  });

  it('نقشِ ساین‌شده یعنی فقط همان شخص', () => {
    expect(taskDoers({ assignedTo: null, roles: [{ roleTagId: 10, claimedBy: 2 }] }, holders)).toEqual([2]);
  });

  it('چند نقش با هم جمع می‌شوند بدونِ تکرار', () => {
    const doers = taskDoers(
      { assignedTo: null, roles: [{ roleTagId: 10, claimedBy: null }, { roleTagId: 20, claimedBy: null }] },
      holders,
    );
    expect(doers.sort()).toEqual([1, 2, 3]);
  });
});

describe('R-PROJ-15 — فقط فردِ تازه اعلان می‌گیرد', () => {
  const holders = new Map([[10, [1, 2]]]);

  it('مسئولِ جدید اعلان می‌گیرد', () => {
    expect(newlyAssigned({ assignedTo: 1, roles: [] }, { assignedTo: 5, roles: [] }, holders, 9)).toEqual([5]);
  });

  it('ویرایش‌کننده به خودش اعلان نمی‌دهد', () => {
    expect(newlyAssigned({ assignedTo: 1, roles: [] }, { assignedTo: 5, roles: [] }, holders, 5)).toEqual([]);
  });

  it('کسی که از قبل بود دوباره اعلان نمی‌گیرد', () => {
    const before = { assignedTo: null, roles: [{ roleTagId: 10, claimedBy: null }] };
    const after = { assignedTo: null, roles: [{ roleTagId: 10, claimedBy: 1 }] };
    expect(newlyAssigned(before, after, holders, 9)).toEqual([]);
  });

  it('ذخیرهٔ بدونِ تغییر هیچ اعلانی نمی‌فرستد', () => {
    const snap = { assignedTo: 3, roles: [] };
    expect(newlyAssigned(snap, snap, holders, 9)).toEqual([]);
  });
});

describe('R-PROJ-16 — منطق به گروهِ وضعیت تکیه می‌کند، نه به نام', () => {
  it('تمام‌شدن از گروه می‌آید', () => {
    expect(isDone('complete')).toBe(true);
    expect(isDone('in_progress')).toBe(false);
    expect(isDone(null)).toBe(false);
  });

  it('باز بودن مکملِ تمام‌شدن است', () => {
    expect(isOpen('todo')).toBe(true);
    expect(isOpen('complete')).toBe(false);
    expect(isOpen(null)).toBe(true);
  });
});
