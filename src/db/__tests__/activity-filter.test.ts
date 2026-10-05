import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../client';
import { auditLog, users } from '../schema';
import { listActivity } from '@/server/activity/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * فیلترِ «رویدادها» (۲.۴.۰): بازهٔ تاریخ و جستجوی آزاد روی **همهٔ** رویدادها.
 * ⚠️ هر ردیف واژهٔ یکتای خودش را دارد تا رویدادهای تست‌های دیگر نتیجه را
 * به‌هم نزنند؛ تاریخ‌ها ظهرِ UTC‌اند تا منطقهٔ زمانیِ سامانه روزشان را عوض نکند.
 */
const owner: Actor = { id: 1, roles: ['owner'], permissions: ['activity.view'] as Permission[], privateAccess: false };
let userId = 0;
const ids: number[] = [];

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: 'af-zz@t', name: 'ژاله‌فیلتر' }).returning({ id: users.id });
  userId = u!.id;
  const rows = await db.insert(auditLog).values([
    { actorType: 'user', actorId: userId, action: 'project.create', objectType: 'project', objectId: 990001,
      after: { title: 'پروژهٔ کهکشانی' }, createdAt: new Date('2026-03-10T12:00:00Z') },
    { actorType: 'user', actorId: userId, action: 'task.create', objectType: 'task', objectId: 990002,
      after: { title: 'تخفیف ۱۰۰% زمستانی' }, createdAt: new Date('2026-03-20T12:00:00Z') },
    { actorType: 'system', actorId: null, action: 'backup.run', objectType: 'system', objectId: null,
      after: { name: 'zzqx-سامانه' }, createdAt: new Date('2026-04-01T12:00:00Z') },
  ]).returning({ id: auditLog.id });
  ids.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  await db.delete(auditLog).where(inArray(auditLog.id, ids));
  await db.delete(users).where(inArray(users.id, [userId]));
});

describe('listActivity — فیلتر', () => {
  it('جستجو روی نامِ کننده', async () => {
    const page = await listActivity(owner, { q: 'ژاله‌فیلتر' });
    expect(page.rows.map((r) => r.id).sort()).toEqual(ids.slice(0, 2).sort());
    expect(page.total).toBe(2);
  });

  it('جستجو روی نامِ مورد در خودِ رویداد', async () => {
    const page = await listActivity(owner, { q: 'کهکشانی' });
    expect(page.rows.map((r) => r.id)).toEqual([ids[0]]);
  });

  it('⚠️ «%» ِ کاربر حرفِ خودش است، نه «هرچیز»', async () => {
    const page = await listActivity(owner, { q: '۱۰۰%' });
    expect(page.rows.map((r) => r.id)).toEqual([ids[1]]);
  });

  it('بازهٔ تاریخ، هر دو سر شامل', async () => {
    const page = await listActivity(owner, { q: 'ژاله‌فیلتر', from: '2026-03-15', to: '2026-03-20' });
    expect(page.rows.map((r) => r.id)).toEqual([ids[1]]);
  });

  it('کلیدهای رویدادی که برچسبشان خوانده شد', async () => {
    const page = await listActivity(owner, { q: 'zzqx-سامانه-نیست', actions: ['backup.run'], from: '2026-04-01', to: '2026-04-01' });
    expect(page.rows.map((r) => r.id)).toContain(ids[2]);
  });
});
