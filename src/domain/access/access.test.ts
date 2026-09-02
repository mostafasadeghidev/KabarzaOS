import { describe, it, expect } from 'vitest';
import { can, canViewSection, canManageSection, effectivePermissions, isOwner, type Actor } from './permissions';
import {
  assertCanManage, assertParticipant, ForbiddenError,
  canSeePrivateRecord, filterVisible, visibleScopes, canSeeScope,
} from './guard';

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

describe('R-RBAC-01 — ⚠️ قانونِ طلایی: مدیریت ⇐ مشاهده', () => {
  it('دادنِ manage خودبه‌خود view را هم می‌دهد', () => {
    const a = actor({ permissions: ['projects.manage'] });
    expect(can(a, 'projects.view')).toBe(true);
  });

  it('بدونِ این قاعده، مدیر منویِ گیت‌شده روی view را نمی‌دید', () => {
    const a = actor({ permissions: ['members.manage'] });
    expect(canViewSection(a, 'members')).toBe(true);
  });

  it('اما view به manage تعمیم نمی‌یابد', () => {
    const a = actor({ permissions: ['projects.view'] });
    expect(can(a, 'projects.manage')).toBe(false);
  });
});

describe('نقش‌ها', () => {
  it('مالک همه‌چیز را دارد', () => {
    const a = actor({ roles: ['owner'] });
    expect(isOwner(a)).toBe(true);
    expect(can(a, 'settings.manage')).toBe(true);
    expect(can(a, 'finance.manage')).toBe(true);
  });

  it('⚠️ حسابدار فقط مالی — همان محدودهٔ Lockdown ِ نسخهٔ قبلی', () => {
    const a = actor({ roles: ['finance'] });
    expect(can(a, 'finance.manage')).toBe(true);
    expect(can(a, 'finance.view')).toBe(true);
    expect(can(a, 'reports.view')).toBe(false);
    expect(can(a, 'settings.manage')).toBe(false);
    expect(can(a, 'projects.manage')).toBe(false);
  });

  it('همکارِ ادمین پیش‌فرض هیچ‌چیز ندارد — دسترسی per-user داده می‌شود', () => {
    const a = actor({ roles: ['admin'] });
    expect(effectivePermissions(a).size).toBe(0);
  });

  it('همکار فقط چیزی را دارد که صریح داده شده', () => {
    const a = actor({ roles: ['admin'], permissions: ['reports.view'] });
    expect(can(a, 'reports.view')).toBe(true);
    expect(can(a, 'finance.view')).toBe(false);
  });
});

describe('R-MSG-10 — ⚠️ پیام‌ها دو مجوزِ مستقل دارند', () => {
  it('«فقط ارسال» می‌تواند بفرستد ولی صندوق را نمی‌بیند', () => {
    const a = actor({ permissions: ['messages.send'] });
    expect(canManageSection(a, 'messages')).toBe(true);
    expect(can(a, 'messages.read')).toBe(false);
  });

  it('«ارسال و خواندن» هر دو را دارد', () => {
    const a = actor({ permissions: ['messages.send', 'messages.read'] });
    expect(can(a, 'messages.send')).toBe(true);
    expect(can(a, 'messages.read')).toBe(true);
  });

  it('خواندن به‌تنهایی حقِ ارسال نمی‌دهد', () => {
    const a = actor({ permissions: ['messages.read'] });
    expect(canManageSection(a, 'messages')).toBe(false);
  });
});

describe('R-RBAC-05 — گاردِ اکشن واقعاً جلو را می‌گیرد', () => {
  it('بدونِ مجوز خطا می‌دهد', () => {
    expect(() => assertCanManage(actor(), 'projects')).toThrow(ForbiddenError);
  });

  it('با مجوز رد نمی‌شود', () => {
    expect(() => assertCanManage(actor({ permissions: ['projects.manage'] }), 'projects')).not.toThrow();
  });

  it('پیامِ خطا می‌گوید چه مجوزی لازم بود', () => {
    try {
      assertCanManage(actor(), 'finance');
    } catch (e) {
      expect((e as ForbiddenError).required).toBe('finance.manage');
    }
  });
});

describe('R-RBAC-08 — ⚠️ مجوز کافی نیست، مالکیت هم لازم است', () => {
  it('غیرِ شرکت‌کننده رد می‌شود حتی با مجوزِ خواندن', () => {
    const a = actor({ id: 5, permissions: ['messages.read'] });
    expect(() => assertParticipant(a, [1, 2, 3])).toThrow(ForbiddenError);
  });

  it('شرکت‌کننده مجاز است', () => {
    const a = actor({ id: 2, permissions: ['messages.read'] });
    expect(() => assertParticipant(a, [1, 2, 3])).not.toThrow();
  });
});

describe('R-RBAC-12 — ⚠️ رکوردِ خصوصی (باگِ واقعیِ نسخهٔ قبلی)', () => {
  const priv = { isPrivate: true, createdBy: 10, assignedTo: 20 };

  it('رکوردِ عمومی برای همه دیده می‌شود', () => {
    expect(canSeePrivateRecord(actor({ id: 99 }), { isPrivate: false, createdBy: 1, assignedTo: null }, 'projects')).toBe(true);
  });

  it('سازنده می‌بیند', () => {
    expect(canSeePrivateRecord(actor({ id: 10 }), priv, 'projects')).toBe(true);
  });

  it('مسئول می‌بیند', () => {
    expect(canSeePrivateRecord(actor({ id: 20 }), priv, 'projects')).toBe(true);
  });

  it('شخصِ ثالث نمی‌بیند', () => {
    expect(canSeePrivateRecord(actor({ id: 99 }), priv, 'projects')).toBe(false);
  });

  it('مدیرِ بخش می‌بیند', () => {
    const mgr = actor({ id: 99, permissions: ['projects.manage'] });
    expect(canSeePrivateRecord(mgr, priv, 'projects')).toBe(true);
  });

  it('همان گارد روی فهرست هم اعمال می‌شود (نشتی از شمارنده)', () => {
    const records = [
      { id: 1, isPrivate: false, createdBy: 1, assignedTo: null },
      { id: 2, isPrivate: true, createdBy: 10, assignedTo: null },
      { id: 3, isPrivate: true, createdBy: 99, assignedTo: null },
    ];
    const visible = filterVisible(actor({ id: 99 }), records, 'projects');
    expect(visible.map((r) => r.id)).toEqual([1, 3]);
    // شمارنده هم باید از همین فهرست بیاید، نه از کلِ رکوردها
    expect(visible.length).toBe(2);
  });
});

describe('درزِ scope — گرنتِ دسترسیِ خصوصی', () => {
  it('پیش‌فرض فقط دادهٔ شرکتی', () => {
    expect(visibleScopes(actor())).toEqual(['company']);
    expect(canSeeScope(actor(), 'private')).toBe(false);
  });

  it('با گرنت، دادهٔ خصوصی هم دیده می‌شود', () => {
    expect(canSeeScope(actor({ privateAccess: true }), 'private')).toBe(true);
  });

  it('مالک همیشه هر دو را می‌بیند', () => {
    expect(visibleScopes(actor({ roles: ['owner'] }))).toEqual(['company', 'private']);
  });

  it('⚠️ گرنت جدا از نقش است — گرفتنش تنزلِ نقش نیست', () => {
    const a = actor({ roles: ['admin'], permissions: ['projects.manage'], privateAccess: false });
    expect(canSeeScope(a, 'private')).toBe(false);
    expect(can(a, 'projects.manage')).toBe(true); // نقشش دست‌نخورده
  });
});
