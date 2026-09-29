import { describe, expect, it } from 'vitest';
import {
  canCreateProject, canManageProject, isGrantableCap, isOfficeManagerOfProject, mayCreateProjects, PM_CAP,
  type ProjectAuthority,
} from './project-scope';

const base = (over: Partial<ProjectAuthority> = {}): ProjectAuthority => ({
  hasGlobalManage: false,
  isPmOnProject: false,
  projectOfficeId: 1,
  managedOfficeIds: [],
  isMemberOfProject: false,
  ...over,
});

describe('اختیارِ مدیریتِ پروژه', () => {
  it('مجوزِ سراسری همه‌جا کافی است', () => {
    expect(canManageProject(base({ hasGlobalManage: true }))).toBe(true);
  });

  it('⚠️ عضوِ عادی نمی‌تواند — حتی روی پروژه‌ای که رویش امضا شده', () => {
    expect(canManageProject(base({ isMemberOfProject: true }))).toBe(false);
  });

  it('مدیرِ پروژه روی همان پروژه می‌تواند', () => {
    expect(canManageProject(base({ isPmOnProject: true }))).toBe(true);
  });

  it('⚠️ مدیرِ پروژه روی پروژهٔ دیگر نمی‌تواند', () => {
    // `isPmOnProject` خودش پروژه‌محور است؛ برای پروژهٔ دیگر false می‌آید.
    expect(canManageProject(base({ isPmOnProject: false, isMemberOfProject: true }))).toBe(false);
  });

  it('مدیرِ دفتر روی پروژهٔ دفترِ خودش، بدونِ امضا', () => {
    expect(canManageProject(base({
      managedOfficeIds: [1], projectOfficeId: 1, isMemberOfProject: false,
    }))).toBe(true);
  });

  it('⚠️ مدیرِ دفتر روی پروژهٔ دفترِ دیگر فقط با امضا', () => {
    expect(canManageProject(base({
      managedOfficeIds: [1], projectOfficeId: 2, isMemberOfProject: false,
    }))).toBe(false);

    expect(canManageProject(base({
      managedOfficeIds: [1], projectOfficeId: 2, isMemberOfProject: true,
    }))).toBe(true);
  });

  it('پروژهٔ بی‌دفتر برای مدیرِ دفتر فقط با امضا', () => {
    expect(canManageProject(base({
      managedOfficeIds: [1], projectOfficeId: null, isMemberOfProject: false,
    }))).toBe(false);
    expect(canManageProject(base({
      managedOfficeIds: [1], projectOfficeId: null, isMemberOfProject: true,
    }))).toBe(true);
  });

  it('کسی که دفتری مدیریت نمی‌کند، مدیرِ دفترِ پروژه هم نیست', () => {
    expect(isOfficeManagerOfProject(base({ managedOfficeIds: [], isMemberOfProject: true })))
      .toBe(false);
  });
});

describe('دسترسیِ تگ', () => {
  it('فقط مقدارهای شناخته‌شده', () => {
    expect(isGrantableCap(PM_CAP)).toBe(true);
    expect(isGrantableCap('')).toBe(true);
    expect(isGrantableCap('some_unknown_cap')).toBe(false);
  });
});

describe('ساختِ پروژه', () => {
  it('مدیرِ سراسری در هر دفتری و بی‌دفتر می‌سازد', () => {
    expect(canCreateProject({ hasGlobalManage: true, managedOfficeIds: [], officeId: null })).toBe(true);
    expect(canCreateProject({ hasGlobalManage: true, managedOfficeIds: [], officeId: 7 })).toBe(true);
  });

  it('مدیرِ دفتر فقط برای دفترِ خودش می‌سازد', () => {
    expect(canCreateProject({ hasGlobalManage: false, managedOfficeIds: [2, 3], officeId: 3 })).toBe(true);
  });

  it('⚠️ مدیرِ دفتر برای دفترِ دیگر یا بی‌دفتر نمی‌سازد', () => {
    // وگرنه پروژه‌ای می‌ساخت که خودش دیگر مدیرش نیست و نمی‌بیندش.
    expect(canCreateProject({ hasGlobalManage: false, managedOfficeIds: [2], officeId: 5 })).toBe(false);
    expect(canCreateProject({ hasGlobalManage: false, managedOfficeIds: [2], officeId: null })).toBe(false);
  });

  it('عضوِ بی‌دفترِ تحتِ مدیریت هرگز نمی‌سازد', () => {
    expect(canCreateProject({ hasGlobalManage: false, managedOfficeIds: [], officeId: 2 })).toBe(false);
    expect(mayCreateProjects({ hasGlobalManage: false, managedOfficeIds: [] })).toBe(false);
    expect(mayCreateProjects({ hasGlobalManage: false, managedOfficeIds: [4] })).toBe(true);
  });
});
