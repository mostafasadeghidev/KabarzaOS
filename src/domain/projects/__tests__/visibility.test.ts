import { describe, expect, it } from 'vitest';
import { isOpenTask, isTaskVisibleToMember } from '../visibility';

const ME = 7, OTHER = 8;
const DEV = 3, DESIGN = 4;
const mine = new Set([DEV]);

describe('دیدِ عضو — پورتِ visible_to_user_sql', () => {
  it('تسکِ سپرده‌شده به خودم همیشه دیده می‌شود، حتی خصوصی', () => {
    expect(isTaskVisibleToMember({ assignedTo: ME, createdBy: OTHER, isPrivate: true, roles: [] }, ME, mine)).toBe(true);
  });

  it('تسکِ خصوصی فقط برای سازنده‌اش', () => {
    expect(isTaskVisibleToMember({ assignedTo: null, createdBy: ME, isPrivate: true, roles: [] }, ME, mine)).toBe(true);
    expect(isTaskVisibleToMember({ assignedTo: null, createdBy: OTHER, isPrivate: true, roles: [{ roleTagId: DEV, claimedBy: null }] }, ME, mine)).toBe(false);
  });

  it('تسکِ نقشیِ بی‌مسئول: نقشِ من و ادعانشده یا ادعای خودم', () => {
    const roleTask = (claimedBy: number | null, role = DEV) => ({
      assignedTo: null, createdBy: OTHER, isPrivate: false, roles: [{ roleTagId: role, claimedBy }],
    });
    expect(isTaskVisibleToMember(roleTask(null), ME, mine)).toBe(true);
    expect(isTaskVisibleToMember(roleTask(ME), ME, mine)).toBe(true);
    // ⚠️ هم‌نقشی که نقش را برداشت، تسک را از دیدِ من می‌برد.
    expect(isTaskVisibleToMember(roleTask(OTHER), ME, mine)).toBe(false);
    expect(isTaskVisibleToMember(roleTask(null, DESIGN), ME, mine)).toBe(false);
  });

  it('تسکِ سپرده‌شده به دیگری دیده نمی‌شود، حتی اگر نقشِ من را داشته باشد', () => {
    expect(isTaskVisibleToMember({
      assignedTo: OTHER, createdBy: OTHER, isPrivate: false, roles: [{ roleTagId: DEV, claimedBy: null }],
    }, ME, mine)).toBe(false);
  });
});

describe('تسکِ باز — پورتِ count_open_for_user', () => {
  it('نه بسته، نه در انتظارِ بررسی', () => {
    expect(isOpenTask({ statusGroup: 'in_progress', isReview: false })).toBe(true);
    expect(isOpenTask({ statusGroup: null, isReview: null })).toBe(true);
    expect(isOpenTask({ statusGroup: 'complete', isReview: false })).toBe(false);
    expect(isOpenTask({ statusGroup: 'review', isReview: true })).toBe(false);
  });
});
