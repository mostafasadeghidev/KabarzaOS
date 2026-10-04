import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { userRoles, users } from '../schema';
import { FileNotFoundError, serveUserAvatar, setAvatar } from '@/server/files/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * مسیرِ `/api/users/[id]/avatar` — چه کسی چهرهٔ چه کسی را می‌گیرد (۱.۱۱۸.۰).
 * ⚠️ آینهٔ پنهان‌کردنِ نام: کارفرما چهرهٔ اعضا را نمی‌گیرد، عضو چهرهٔ
 * کارفرما و دستیارِ مدیر را نه.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 40 }, (_, i) => i)]);
const O = 1, M = 2, M2 = 3, C = 4, A = 5;
const actor = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });

beforeAll(async () => {
  await sql`truncate table user_avatars, files, user_roles, users restart identity cascade`;
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm@t', name: 'سارا' }, { email: 'm2@t', name: 'علی' },
    { email: 'c@t', name: 'آلفا' }, { email: 'a@t', name: 'دستیار' },
  ]);
  await db.insert(userRoles).values([
    { userId: O, role: 'owner' }, { userId: M, role: 'member' }, { userId: M2, role: 'member' },
    { userId: C, role: 'client' }, { userId: A, role: 'admin' },
  ]);
  const owner = actor(O, ['owner']);
  for (const id of [O, M, C, A]) await setAvatar(owner, id, { name: 'a.png', mime: 'image/png', bytes: PNG });
});

afterAll(async () => { await sql.end(); });

const gets = async (viewer: Actor, id: number) => {
  try { await serveUserAvatar(viewer, id); return true; } catch (e) {
    if (e instanceof FileNotFoundError) return false;
    throw e;
  }
};

describe('آواتار با شناسهٔ کاربر', () => {
  it('همکار چهرهٔ همکار را می‌گیرد؛ کسی که عکس ندارد «یافت نشد» است', async () => {
    expect(await gets(actor(M2, ['member']), M)).toBe(true);
    expect(await gets(actor(M, ['member']), M2)).toBe(false);
  });

  it('⚠️ عضو چهرهٔ کارفرما و دستیارِ مدیر را نمی‌گیرد', async () => {
    expect(await gets(actor(M, ['member']), C)).toBe(false);
    expect(await gets(actor(M, ['member']), A)).toBe(false);
  });

  it('⚠️ کارفرما چهرهٔ هیچ عضوی — حتی مالک — را نمی‌گیرد؛ خودش را می‌گیرد', async () => {
    expect(await gets(actor(C, ['client']), M)).toBe(false);
    expect(await gets(actor(C, ['client']), O)).toBe(false);
    expect(await gets(actor(C, ['client']), C)).toBe(true);
  });

  it('مالک همه را می‌گیرد', async () => {
    for (const id of [M, C, A]) expect(await gets(actor(O, ['owner']), id)).toBe(true);
  });
});
