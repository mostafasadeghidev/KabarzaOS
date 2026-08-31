import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, or, sql as raw } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles, userPermissions } from '../schema';
import { hashPassword } from '@/domain/auth/password';
import { attemptLogin, type AuthUser } from '@/domain/auth/login';
import { effectivePermissions, canManageSection, type Actor, type Permission, type Role } from '@/domain/access/permissions';

/** ورودِ واقعی از دیتابیس تا مجوزها — اثباتِ اتصالِ کلِ زنجیره. */

const lookup = {
  async findByIdentifier(identifier: string): Promise<AuthUser | null> {
    // همان قاعدهٔ سرور: ایمیل یا نامِ کاربری، بی‌اعتنا به حروف.
    const rows = await db.select().from(users).where(or(
      raw`lower(${users.email}) = ${identifier}`,
      raw`lower(${users.username}) = ${identifier}`,
    ));
    const u = rows[0];
    return u ? { id: u.id, email: u.email, passwordHash: u.passwordHash, isActive: u.memberState === 'active', deletedAt: u.deletedAt } : null;
  },
};

/** همان کاری که server/auth.ts می‌کند — مجوزها از دیتابیس، نه از توکن. */
async function loadActor(userId: number): Promise<Actor> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  return {
    id: u!.id,
    roles: roles.map((r) => r.role as Role),
    permissions: perms.map((p) => p.permission as Permission),
    privateAccess: u!.privateAccess,
  };
}

let staffId: number;

beforeAll(async () => {
  await sql`truncate table user_permissions, user_roles, users restart identity cascade`;
  const hash = await hashPassword('a-good-passphrase');

  const rows = await db.insert(users).values([
    { email: 'staff@test', name: 'همکار', passwordHash: hash },
    { email: 'gone@test', name: 'عضوِ سابق', passwordHash: hash, memberState: 'locked' },
  ]).returning({ id: users.id });
  staffId = rows[0]!.id;

  await db.insert(userRoles).values({ userId: staffId, role: 'admin' });
  await db.insert(userPermissions).values([
    { userId: staffId, permission: 'projects.manage' },
    { userId: staffId, permission: 'messages.send' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('ورود انتها به انتها', () => {
  it('اطلاعاتِ درست از دیتابیس تأیید می‌شود', async () => {
    const r = await attemptLogin(lookup, 'staff@test', 'a-good-passphrase');
    expect(r).toEqual({ ok: true, userId: staffId });
  });

  it('رمزِ غلط رد می‌شود', async () => {
    const r = await attemptLogin(lookup, 'staff@test', 'wrong');
    expect(r.ok).toBe(false);
  });

  it('کاربرِ غیرفعال وارد نمی‌شود', async () => {
    const r = await attemptLogin(lookup, 'gone@test', 'a-good-passphrase');
    expect(r).toEqual({ ok: false, reason: 'inactive' });
  });

  it('⚠️ ایمیلِ ناموجود همان پاسخِ رمزِ غلط را می‌دهد', async () => {
    const a = await attemptLogin(lookup, 'nobody@test', 'x');
    const b = await attemptLogin(lookup, 'staff@test', 'x');
    expect(a).toEqual(b);
  });
});

describe('مجوزها از دیتابیس خوانده می‌شوند، نه از توکن', () => {
  it('بازیگر با نقش و مجوزهای واقعی ساخته می‌شود', async () => {
    const actor = await loadActor(staffId);
    expect(actor.roles).toEqual(['admin']);
    expect(canManageSection(actor, 'projects')).toBe(true);
  });

  it('R-RBAC-01 — مدیریت خودبه‌خود مشاهده را هم می‌دهد', async () => {
    const actor = await loadActor(staffId);
    expect(effectivePermissions(actor).has('projects.view')).toBe(true);
  });

  it('⚠️ پس‌گرفتنِ مجوز بلافاصله اثر می‌کند (نشست کش نمی‌کند)', async () => {
    await db.delete(userPermissions)
      .where(eq(userPermissions.userId, staffId));

    const actor = await loadActor(staffId);
    expect(canManageSection(actor, 'projects')).toBe(false);
  });
});
