import { describe, expect, it } from 'vitest';
import { canEditPerson } from '../people-edit';

describe('canEditPerson — چه کسی از صفحهٔ افراد ویرایش می‌شود', () => {
  it('عضو و کارفرما آزادند', () => {
    expect(canEditPerson({ actorRoles: ['admin'], targetRoles: ['member'] })).toBe('ok');
    expect(canEditPerson({ actorRoles: ['owner'], targetRoles: ['client'] })).toBe('ok');
  });

  it('مالک از این صفحه هرگز ویرایش نمی‌شود — حتی به دستِ خودش', () => {
    // ⚠️ همان حفره‌ای که بسته شد: همکارِ ادمین با «اعضا → مدیریت» شناسهٔ مالک را می‌فرستاد.
    expect(canEditPerson({ actorRoles: ['admin'], targetRoles: ['owner'] })).toBe('owner_protected');
    expect(canEditPerson({ actorRoles: ['owner'], targetRoles: ['owner'] })).toBe('owner_protected');
  });

  it('همکارِ ادمین را فقط مالک ویرایش می‌کند', () => {
    expect(canEditPerson({ actorRoles: ['admin'], targetRoles: ['admin'] })).toBe('owner_only');
    expect(canEditPerson({ actorRoles: ['finance'], targetRoles: ['admin', 'member'] })).toBe('owner_only');
    expect(canEditPerson({ actorRoles: ['owner'], targetRoles: ['admin'] })).toBe('ok');
  });

  it('نقشِ مالک بر نقش‌های دیگرِ همان شخص مقدم است', () => {
    expect(canEditPerson({ actorRoles: ['owner'], targetRoles: ['member', 'owner'] })).toBe('owner_protected');
  });
});
