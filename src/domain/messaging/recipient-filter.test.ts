import { describe, expect, it } from 'vitest';
import {
  allowedRecipients, audienceIds, keepsProject, matchesName, pickableRecipients, projectTeamIds,
  switchAutoPicks, visibleProjects,
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

describe('انتخابِ گیرندگان', () => {
  const recipients = [
    { id: 1, role: 'member' }, { id: 2, role: 'member' }, { id: 3, role: 'member' },
    { id: 90, role: 'client' }, { id: 91, role: 'client' },
  ];

  it('جستجوی نام «ي/ك» ِ عربی و نیم‌فاصله را یکی می‌گیرد', () => {
    expect(matchesName('علي كريمي', 'علی کریمی')).toBe(true);
    expect(matchesName('محمد‌رضا', 'محمد رضا')).toBe(true);
    expect(matchesName('Sara', 'sa')).toBe(true);
    expect(matchesName('Sara', '  ')).toBe(true);
    expect(matchesName('Sara', 'x')).toBe(false);
  });

  it('⚠️ انتخابِ پروژه اعضای تیم را تیک می‌زند، نه کارفرما را', () => {
    expect(projectTeamIds({ projects, officeMembers, recipients, officeId: null, projectId: 1 }))
      .toEqual([1, 2]);
    // زیرِ دفتر فقط اعضای همان دفتر.
    expect(projectTeamIds({ projects, officeMembers, recipients, officeId: 20, projectId: 3 }))
      .toEqual([3]);
    expect(projectTeamIds({ projects, officeMembers, recipients, officeId: null, projectId: null }))
      .toEqual([]);
  });

  it('عضوی که گیرندهٔ ممکن نیست (عضوِ سابق) تیک نمی‌خورد', () => {
    expect(projectTeamIds({
      projects, officeMembers, recipients: recipients.filter((r) => r.id !== 2),
      officeId: null, projectId: 1,
    })).toEqual([1]);
  });

  it('⚠️ عوض‌کردنِ پروژه تیک‌های خودکارِ قبلی را برمی‌دارد ولی تیکِ دستی را نه', () => {
    // پروژهٔ ۱ ← [۱، ۲] خودکار؛ کاربر ۹۰ را دستی زده است.
    const first = switchAutoPicks({ picked: new Set([90]), auto: new Set(), team: [1, 2] });
    expect([...first.picked].sort()).toEqual([1, 2, 90]);
    expect([...first.auto].sort()).toEqual([1, 2]);

    // پروژهٔ ۲ ← [۳].
    const second = switchAutoPicks({ picked: first.picked, auto: first.auto, team: [3] });
    expect([...second.picked].sort()).toEqual([3, 90]);

    // بی‌پروژه ← فقط دستی‌ها.
    const none = switchAutoPicks({ picked: second.picked, auto: second.auto, team: [] });
    expect([...none.picked]).toEqual([90]);
  });

  it('کسی که دستی هم زده شده بود با عوض‌شدنِ پروژه نمی‌افتد', () => {
    const r = switchAutoPicks({ picked: new Set([1]), auto: new Set(), team: [1, 2] });
    expect([...r.auto]).toEqual([2]);
    const back = switchAutoPicks({ picked: r.picked, auto: r.auto, team: [] });
    expect([...back.picked]).toEqual([1]);
  });

  it('شمارِ مخاطبِ آماده — دفتر فقط برای «همهٔ اعضا»', () => {
    const base = { recipients, officeMembers };
    expect(audienceIds({ ...base, audience: 'members', officeId: null })).toEqual([1, 2, 3]);
    expect(audienceIds({ ...base, audience: 'members', officeId: 10 })).toEqual([1, 2]);
    expect(audienceIds({ ...base, audience: 'clients', officeId: 10 })).toEqual([90, 91]);
    expect(audienceIds({ ...base, audience: 'all', officeId: null })).toEqual([1, 2, 3, 90, 91]);
  });
});
