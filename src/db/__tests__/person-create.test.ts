import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { auditLog, users } from '../schema';
import { createPerson } from '@/server/people/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * ساختِ عضو — گاردهایی که تا پیش از این نبودند.
 */

let admin: Actor;

const base = {
  name: 'عضوِ تازه', email: 'New@Example.com', phone: '',
  tagIds: [], officeIds: [], managedOfficeIds: [],
};

beforeEach(async () => {
  await sql`truncate table user_roles, user_offices, tag_relations, audit_log, users restart identity cascade`;
  // ⚠️ `id` از نوعِ GENERATED ALWAYS است؛ شناسه را از خودِ درج می‌گیریم.
  const [owner] = await db.insert(users)
    .values({ name: 'مدیر', email: 'owner@x.com' })
    .returning({ id: users.id });
  admin = {
    id: owner!.id, roles: ['owner'], permissions: ['members.manage'], privateAccess: true,
  };
});

afterAll(async () => { await sql.end(); });

describe('ساختِ عضو', () => {
  it('ایمیل و نامِ کاربری نرمال ذخیره می‌شوند', async () => {
    const id = await createPerson(admin, 'member', { ...base, username: '  NewGuy  ' });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.email).toBe('new@example.com');
    expect(row!.username).toBe('newguy');
  });

  /**
   * ⚠️ پیش‌تر مقایسه حساس‌به‌حروف بود، ولی شاخصِ یکتاییِ دیتابیس نیست —
   * پس این مورد از گارد رد می‌شد و به خطای خامِ Postgres می‌خورد.
   */
  it('ایمیلِ تکراری با حروفِ متفاوت هم رد می‌شود', async () => {
    await createPerson(admin, 'member', base);
    await expect(createPerson(admin, 'member', { ...base, email: 'NEW@EXAMPLE.COM' }))
      .rejects.toThrow();
  });

  it('نامِ کاربریِ تکراری رد می‌شود', async () => {
    await createPerson(admin, 'member', { ...base, username: 'taken' });
    await expect(createPerson(admin, 'member', {
      ...base, email: 'other@example.com', username: 'TAKEN',
    })).rejects.toThrow();
  });

  /** همان سیاستی که تغییرِ رمز اعمال می‌کند. */
  it('رمزِ ضعیف در ساخت هم رد می‌شود', async () => {
    await expect(createPerson(admin, 'member', { ...base, password: 'short' })).rejects.toThrow();
    await expect(createPerson(admin, 'member', { ...base, password: 'password' })).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.email, 'new@example.com'))).toHaveLength(0);
  });

  it('⚠️ رمزِ خام در ردِ ممیزی نمی‌نشیند', async () => {
    const secret = 'a-good-enough-secret-42';
    await createPerson(admin, 'member', { ...base, password: secret });

    const rows = await db.select().from(auditLog);
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows[0]!.after).toMatchObject({ hasPassword: true });
  });

  it('بدونِ رمز ساخته می‌شود ولی ورود ممکن نیست', async () => {
    const id = await createPerson(admin, 'member', base);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.passwordHash).toBeNull();
  });
});

/**
 * گرنتِ دیدِ خصوصی.
 *
 * ⚠️ این یک **ترفیعِ دسترسی** است: کسی که خودش دیدِ خصوصی ندارد نباید
 * بتواند برای دیگری (یا با ویرایشِ خودش، برای خودش) بسازدش.
 */
describe('گرنتِ دیدِ خصوصی', () => {
  const withPrivate = (a: Actor): Actor => ({ ...a, privateAccess: true });
  const withoutPrivate = (a: Actor): Actor => ({
    ...a, roles: ['finance'], privateAccess: false,
  });

  it('کسی که خودش دارد، می‌تواند بدهد', async () => {
    const id = await createPerson(withPrivate(admin), 'member', { ...base, privateAccess: true });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.privateAccess).toBe(true);
  });

  it('⚠️ کسی که ندارد، نمی‌تواند بدهد — بی‌صدا نادیده گرفته می‌شود', async () => {
    const id = await createPerson(
      withoutPrivate(admin), 'member', { ...base, privateAccess: true },
    );
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.privateAccess).toBe(false);
  });

  it('پیش‌فرض خاموش است', async () => {
    const id = await createPerson(withPrivate(admin), 'member', base);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row!.privateAccess).toBe(false);
  });
});
