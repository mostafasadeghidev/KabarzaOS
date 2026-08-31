import { describe, expect, it } from 'vitest';
import {
  allowedRecipients, keepsProject, pickableRecipients, visibleProjects,
} from './recipient-filter';

const projects = [
  { id: 1, officeId: 10, memberIds: [1, 2], clientIds: [90] },
  { id: 2, officeId: 20, memberIds: [3], clientIds: [] },
  // پروژهٔ بی‌دفتر.
  { id: 3, officeId: null, memberIds: [1, 3], clientIds: [91] },
];

const officeMembers = { 10: [1, 2], 20: [3] };

describe('فیلترِ زندهٔ گیرندگان', () => {
  it('⚠️ پروژهٔ بی‌دفتر زیرِ فیلترِ دفتر هم دیده می‌شود', () => {
    expect(visibleProjects(projects, 10).map((p) => p.id)).toEqual([1, 3]);
    expect(visibleProjects(projects, null).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('پروژه‌ای که به دفترِ دیگری تعلق دارد باید صفر شود', () => {
    expect(keepsProject(projects, 2, 10)).toBe(false);
    expect(keepsProject(projects, 1, 10)).toBe(true);
    // بی‌دفتر همیشه می‌ماند.
    expect(keepsProject(projects, 3, 10)).toBe(true);
    expect(keepsProject(projects, null, 10)).toBe(true);
  });

  it('بدونِ انتخاب، فیلتری نیست — و «بدونِ فیلتر» با «هیچ‌کس» یکی نیست', () => {
    expect(allowedRecipients({ projects, officeMembers, officeId: null, projectId: null }))
      .toBeNull();
  });

  it('فقط دفتر ← اعضای همان دفتر', () => {
    const allowed = allowedRecipients({ projects, officeMembers, officeId: 10, projectId: null });
    expect([...allowed!]).toEqual([1, 2]);
  });

  it('پروژه ← اعضا و کارفرمایانِ همان پروژه', () => {
    const allowed = allowedRecipients({ projects, officeMembers, officeId: null, projectId: 1 });
    expect([...allowed!].sort()).toEqual([1, 2, 90]);
  });

  it('⚠️ دفتر ∩ پروژه اعضا را باریک می‌کند ولی کارفرما را نگه می‌دارد', () => {
    // پروژهٔ ۳ عضوهای ۱ و ۳ دارد؛ دفترِ ۱۰ فقط ۱ و ۲ را دارد → عضو ۳ می‌افتد.
    const allowed = allowedRecipients({ projects, officeMembers, officeId: 10, projectId: 3 });
    expect([...allowed!].sort()).toEqual([1, 91]);
  });

  it('⚠️ گیرندهٔ از پیش انتخاب‌شده هرگز از فهرست نمی‌افتد', () => {
    const people = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const allowed = new Set([1]);
    expect(pickableRecipients(people, allowed, new Set()).map((p) => p.id)).toEqual([1]);
    // ۳ انتخاب شده بود → می‌ماند، هرچند مجاز نیست.
    expect(pickableRecipients(people, allowed, new Set([3])).map((p) => p.id)).toEqual([1, 3]);
  });

  it('پروژهٔ ناموجود ← هیچ‌کس (نه همه)', () => {
    const allowed = allowedRecipients({ projects, officeMembers, officeId: null, projectId: 999 });
    expect(allowed).not.toBeNull();
    expect(allowed!.size).toBe(0);
  });
});
