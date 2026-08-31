import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles, userPermissions } from '../schema';
import { eq } from 'drizzle-orm';

/**
 * ⚠️ گاردِ تلهٔ حیاتیِ R-RBAC-11.
 *
 * در نسخهٔ قبلی، تابعی که در **هر ارتقای نسخهٔ دیتابیس** اجرا می‌شد، هر مجوزی را
 * که مستقیم روی کاربر نشسته بود پاک می‌کرد. دسترسی‌های همکارِ ادمین دقیقاً
 * همین‌طور ذخیره می‌شوند → اولین بامپِ DB همه را صفر می‌کرد.
 *
 * این تست ثابت می‌کند مجوزهای per-user از مایگریشن جانِ سالم به در می‌برند.
 */

let staffId: number;

beforeAll(async () => {
  await sql`truncate table user_permissions, user_roles, users restart identity cascade`;
  const rows = await db.insert(users)
    .values({ email: 'staff@test', name: 'همکارِ ادمین' })
    .returning({ id: users.id });
  staffId = rows[0]!.id;
  await db.insert(userRoles).values({ userId: staffId, role: 'admin' });
  await db.insert(userPermissions).values([
    { userId: staffId, permission: 'projects.view' },
    { userId: staffId, permission: 'reports.view' },
    { userId: staffId, permission: 'messages.send' },
  ]);
});

afterAll(async () => {
  await sql.end();
});

describe('R-RBAC-11 — مجوزهای per-user باید از مایگریشن جان سالم به در ببرند', () => {
  it('مجوزها ذخیره می‌شوند', async () => {
    const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, staffId));
    expect(rows).toHaveLength(3);
  });

  it('⚠️ اجرای دوبارهٔ مایگریشن مجوزها را پاک نمی‌کند', async () => {
    // مایگریشنِ Drizzle idempotent است و جدولِ کاربران را دست نمی‌زند.
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder: './src/db/migrations' });

    const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, staffId));
    expect(rows.map((r) => r.permission).sort()).toEqual(
      ['messages.send', 'projects.view', 'reports.view'],
    );
  });

  it('نقشِ کاربر هم دست‌نخورده می‌ماند', async () => {
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, staffId));
    expect(roles.map((r) => r.role)).toEqual(['admin']);
  });
});

describe('یکتاییِ مجوز', () => {
  it('مجوزِ تکراری برای یک کاربر رد می‌شود', async () => {
    let failed = false;
    try {
      await db.insert(userPermissions).values({ userId: staffId, permission: 'projects.view' });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});

describe('گرنتِ دسترسیِ خصوصی', () => {
  it('پیش‌فرض خاموش است', async () => {
    const rows = await db.select().from(users).where(eq(users.id, staffId));
    expect(rows[0]!.privateAccess).toBe(false);
  });

  it('⚠️ روشن/خاموش‌کردنش نقش را تغییر نمی‌دهد', async () => {
    await db.update(users).set({ privateAccess: true }).where(eq(users.id, staffId));
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, staffId));
    expect(roles.map((r) => r.role)).toEqual(['admin']); // نقش دست‌نخورده

    await db.update(users).set({ privateAccess: false }).where(eq(users.id, staffId));
    const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, staffId));
    expect(perms).toHaveLength(3); // مجوزها هم دست‌نخورده
  });
});
