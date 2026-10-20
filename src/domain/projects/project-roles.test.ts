import { describe, expect, it } from 'vitest';
import { changesProjectManagers, needsExplicitRole, roleChoices } from './project-roles';

const DEV = 6, DESIGN = 25, PM = 29, TEAM = 16;
const all = [DESIGN, DEV, PM, TEAM];

describe('نقشِ روی پروژه', () => {
  it('⚠️ «مدیر پروژه» برای هر کسی هست، حتی بی‌آنکه روی پروفایلش باشد', () => {
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [DEV], canAssignPm: true })).toEqual([DEV, PM]);
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [DEV, DESIGN], canAssignPm: true })).toEqual([DESIGN, DEV, PM]);
  });

  it('⚠️ کسی که اختیارِ تعیینِ مدیر ندارد گزینه‌اش را نمی‌بیند — مگر نقشِ فعلیِ همان ردیف باشد', () => {
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [DEV], canAssignPm: false })).toEqual([DEV]);
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [DEV], canAssignPm: false, currentRoleId: PM })).toEqual([DEV, PM]);
  });

  it('نفرِ بی‌نقش همهٔ نقش‌های کاری را می‌بیند؛ «مدیر پروژه» ِ روی پروفایل نقشِ کاری حساب نمی‌شود', () => {
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [], canAssignPm: false })).toEqual([DESIGN, DEV, TEAM]);
    expect(roleChoices({ allRoleIds: all, pmRoleIds: [PM], ownRoleIds: [PM], canAssignPm: true })).toEqual(all);
  });

  it('«نقشِ خودش» فقط با یک نقشِ کاری؛ با چند نقش انتخاب اجباری است', () => {
    expect(needsExplicitRole([DEV], [PM])).toBe(false);
    expect(needsExplicitRole([DEV, PM], [PM])).toBe(false);
    expect(needsExplicitRole([DEV, DESIGN], [PM])).toBe(true);
    expect(needsExplicitRole([], [PM])).toBe(false);
  });

  it('جابه‌جاییِ مدیرِ پروژه — افزودن، برداشتن، عوض‌کردن؛ بقیه نه', () => {
    const before = [{ userId: 1, roleTagId: DEV }, { userId: 2, roleTagId: PM }];
    expect(changesProjectManagers(before, before, [PM])).toBe(false);
    expect(changesProjectManagers(before, [...before, { userId: 3, roleTagId: DESIGN }], [PM])).toBe(false);
    expect(changesProjectManagers(before, [...before, { userId: 1, roleTagId: PM }], [PM])).toBe(true);
    expect(changesProjectManagers(before, [{ userId: 1, roleTagId: DEV }], [PM])).toBe(true);
    expect(changesProjectManagers(before, [{ userId: 1, roleTagId: DEV }, { userId: 2, roleTagId: DEV }], [PM])).toBe(true);
  });
});
