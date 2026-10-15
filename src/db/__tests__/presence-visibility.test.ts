import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles } from '../schema';
import { livePresence } from '@/server/availability/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * نشانِ حضور روی همهٔ آواتارها (۲.۳۲.۰) — چه کسی حضورِ چه کسی را می‌بیند.
 * ⚠️ عضوِ عادی همکارِ داخلی را می‌بیند؛ کارفرما هیچ‌کس را؛ حضورِ کارفرما و
 * عضوِ قطع‌شده به هیچ بیننده‌ای داده نمی‌شود.
 */

let member: Actor;
let client: Actor;
let ids: { a: number; b: number; c: number; gone: number };

beforeEach(async () => {
  await sql`truncate table user_roles, users, scheduler_stamps restart identity cascade`;
  const now = new Date();
  const rows = await db.insert(users).values([
    { name: 'A', email: 'a@x.com', lastSeenAt: now, lastActiveAt: now },
    { name: 'B', email: 'b@x.com', lastSeenAt: now, lastActiveAt: now },
    { name: 'Client', email: 'c@x.com', lastSeenAt: now, lastActiveAt: now },
    { name: 'Gone', email: 'g@x.com', lastSeenAt: now, lastActiveAt: now, memberState: 'locked' },
  ]).returning({ id: users.id });
  ids = { a: rows[0]!.id, b: rows[1]!.id, c: rows[2]!.id, gone: rows[3]!.id };
  await db.insert(userRoles).values([
    { userId: ids.a, role: 'member' }, { userId: ids.b, role: 'member' },
    { userId: ids.c, role: 'client' }, { userId: ids.gone, role: 'member' },
  ]);
  member = { id: ids.a, roles: ['member'], permissions: [], privateAccess: false };
  client = { id: ids.c, roles: ['client'], permissions: [], privateAccess: false };
});

afterAll(async () => { await sql.end(); });

describe('حضورِ روی آواتارها', () => {
  it('عضوِ عادی حضورِ همکارِ داخلی را می‌بیند (بی‌مجوزِ members.view)', async () => {
    const states = await livePresence(member, [ids.b]);
    expect(states[ids.b]).toBe('active');
  });

  it('⚠️ حضورِ کارفرما و عضوِ قطع‌شده داده نمی‌شود', async () => {
    const states = await livePresence(member, [ids.c, ids.gone]);
    expect(states).toEqual({});
  });

  it('⚠️ کارفرما حضورِ هیچ‌کس را نمی‌بیند', async () => {
    expect(await livePresence(client, [ids.a, ids.b])).toEqual({});
  });
});
