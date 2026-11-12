import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users } from '../schema';
import { markOffline, touch } from '@/server/people/presence-service';
import type { Actor } from '@/domain/access/permissions';

/** «آخرین حضور» (۲.۶۴.۰): با ضربان نوشته می‌شود و با آفلاین شدن پاک نمی‌شود. */
let id: number;
const actor = (): Actor => ({ id, roles: ['member'], permissions: [], privateAccess: false });
const row = async () => (await db.select().from(users).where(eq(users.id, id)))[0]!;

beforeAll(async () => {
  await sql`truncate table users restart identity cascade`;
  const [u] = await db.insert(users).values({ email: 'lo@t', name: 'LO' }).returning({ id: users.id });
  id = u!.id;
});

describe('آخرین حضور', () => {
  it('ضربان می‌نویسدش', async () => {
    expect((await row()).lastOnlineAt).toBeNull();
    await touch(actor(), true);
    expect((await row()).lastOnlineAt).not.toBeNull();
  });

  it('⚠️ آفلاین شدن حضورِ زنده را پاک می‌کند ولی «آخرین حضور» می‌ماند', async () => {
    await markOffline(actor());
    const r = await row();
    expect(r.lastSeenAt).toBeNull();
    expect(r.lastOnlineAt).not.toBeNull();
    expect(Date.now() - r.lastOnlineAt!.getTime()).toBeLessThan(60_000);
  });
});
