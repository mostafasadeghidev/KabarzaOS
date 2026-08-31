import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles, userPermissions } from '../schema';
import { eq } from 'drizzle-orm';
import { getAccessForm, setUserAccess, visibleReportTabs } from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';
import { REPORT_TABS } from '@/domain/access/staff-levels';

/**
 * دسترسیِ همکارِ ادمین — گاردها و رفت‌وبرگشتِ ذخیره.
 *
 * ⚠️ این‌جا اشتباه یعنی نشتِ دسترسی، پس گاردها روی دیتابیسِ واقعی آزموده
 * می‌شوند، نه فقط در دامنه.
 */

let ownerId: number;
let staffId: number;
let memberId: number;

const actorOf = (id: number, roles: Actor['roles']): Actor =>
  ({ id, roles, permissions: [], privateAccess: true });

beforeAll(async () => {
  await sql`truncate table user_permissions, user_roles, users restart identity cascade`;
  const rows = await db.insert(users).values([
    { email: 'owner@t', name: 'مالک' },
    { email: 'staff@t', name: 'همکار' },
    { email: 'member@t', name: 'عضو' },
  ]).returning({ id: users.id });
  [ownerId, staffId, memberId] = rows.map((r) => r.id) as [number, number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: staffId, role: 'admin' },
    { userId: memberId, role: 'member' },
  ]);
});

afterAll(async () => {
  await sql.end();
});

describe('R-RBAC-10 — فقط مالک دسترسی‌ها را تغییر می‌دهد', () => {
  it('⚠️ همکاری که مدیریتِ اعضا دارد نمی‌تواند به خودش دسترسی بدهد', async () => {
    const staff = actorOf(staffId, ['admin']);
    staff.permissions = ['members.manage'] as Actor['permissions'];

    await expect(setUserAccess(staff, staffId, { levels: { finance: 'manage' }, visibleTabs: [] }))
      .rejects.toBeInstanceOf(ForbiddenError);

    const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, staffId));
    expect(rows).toHaveLength(0);
  });

  it('کاربری که همکارِ ادمین نیست دسترسیِ پیکربندی‌شدنی ندارد', async () => {
    await expect(
      setUserAccess(actorOf(ownerId, ['owner']), memberId, { levels: { projects: 'manage' }, visibleTabs: [] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ذخیره و بازخوانی', () => {
  it('سطوح رفت‌وبرگشت می‌کنند و پایدارند', async () => {
    const owner = actorOf(ownerId, ['owner']);
    await setUserAccess(owner, staffId, {
      levels: { projects: 'manage', messages: 'sendread', reports: 'view', finance: 'none' },
      visibleTabs: ['overall', 'hours'],
    });

    const form = await getAccessForm(owner, staffId);
    expect(form.levels.projects).toBe('manage');
    // ⚠️ نباید به «فقط ارسال» تنزل کند.
    expect(form.levels.messages).toBe('sendread');
    expect(form.levels.finance).toBe('none');
    expect(form.visibleTabs.sort()).toEqual(['hours', 'overall']);
  });

  it('ذخیرهٔ دوباره دسترسیِ قبلی را جایگزین می‌کند، نه انباشته', async () => {
    const owner = actorOf(ownerId, ['owner']);
    await setUserAccess(owner, staffId, { levels: { members: 'view' }, visibleTabs: [] });

    const form = await getAccessForm(owner, staffId);
    expect(form.levels.projects).toBe('none');
    expect(form.levels.members).toBe('view');
  });

  it('مقدارِ دلخواه ذخیره نمی‌شود', async () => {
    const owner = actorOf(ownerId, ['owner']);
    await setUserAccess(owner, staffId, {
      levels: { projects: 'superuser', settings: 'manage' },
      visibleTabs: ['overall'],
    });

    const rows = await db.select({ p: userPermissions.permission })
      .from(userPermissions).where(eq(userPermissions.userId, staffId));
    expect(rows.map((r) => r.p)).not.toContain('settings.manage');
    expect(rows.every((r) => r.p.startsWith('reports.hide:'))).toBe(true);
  });
});

describe('تب‌های گزارش', () => {
  it('مالک همیشه همهٔ تب‌ها را می‌بیند', async () => {
    // ⚠️ از خودِ فهرست مشتق می‌شود، نه عددِ ثابت — وگرنه افزودنِ هر تبِ تازه
    // این تست را می‌شکند بی‌آنکه چیزی واقعاً خراب شده باشد.
    expect(await visibleReportTabs(actorOf(ownerId, ['owner'])))
      .toHaveLength(REPORT_TABS.length);
  });

  it('تبِ پنهان‌شده به همکار نمی‌رسد', async () => {
    await setUserAccess(actorOf(ownerId, ['owner']), staffId, {
      levels: { reports: 'view' },
      visibleTabs: ['overall', 'hours'],
    });
    expect((await visibleReportTabs(actorOf(staffId, ['admin']))).sort()).toEqual(['hours', 'overall']);
  });
});
