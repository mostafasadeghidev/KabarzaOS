import { describe, expect, it } from 'vitest';
import { firstPage } from '../first-page';
import type { Actor, Permission } from '../permissions';

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 1, roles: [], permissions: [], privateAccess: false, ...over,
});

describe('firstPage — اولین صفحهٔ مجاز', () => {
  it('مالک به داشبورد', () => {
    expect(firstPage(actor({ roles: ['owner'], permissions: ['projects.view'] as Permission[] }))).toBe('/dashboard');
  });

  it('همکارِ ادمین با فقط «اعضا» به اعضا — نه به فرمِ ورود', () => {
    // ⚠️ همان بن‌بست: ریشه او را به /login می‌فرستاد و ورود دوباره به / برمی‌گشت.
    expect(firstPage(actor({ roles: ['admin'], permissions: ['members.view'] as Permission[] }))).toBe('/members');
  });

  it('فقط پیام‌ها → پیام‌ها؛ فقط مالی → مالی', () => {
    expect(firstPage(actor({ roles: ['admin'], permissions: ['messages.read'] as Permission[] }))).toBe('/messages');
    expect(firstPage(actor({ roles: ['admin'], permissions: ['finance.view'] as Permission[] }))).toBe('/finance');
  });

  it('عضو و کارفرما به پروژه‌ها', () => {
    expect(firstPage(actor({ roles: ['member'] }))).toBe('/dashboard');
    expect(firstPage(actor({ roles: ['client'] }))).toBe('/dashboard');
  });

  it('بی‌هیچ مجوز و نقشی، پروفایل — هرگز /login', () => {
    expect(firstPage(actor({ roles: ['admin'] }))).toBe('/profile');
  });
});
