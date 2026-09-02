import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { currencies, notifications, projects, tags, userRoles, users } from '../schema';
import * as service from '@/server/projects/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * «به پروژه اضافه شدید» — پورتِ `Notifications::project_signed()`.
 *
 * ⚠️ پیش از این کارفرمایی که به پروژه اضافه می‌شد هیچ خبری نمی‌گرفت، و
 * افزودنِ سریعِ عضو از کارت هم اعلانی نداشت؛ بدنهٔ اعلانِ عضو فقط نامِ پروژه بود.
 */

let owner: number, dev: number, client: number, projectId: number, devRole: number;
const ownerActor = (): Actor => ({ id: owner, roles: ['owner'], permissions: [], privateAccess: false });

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, project_clients, project_members, projects,
    tags, user_roles, users, currencies restart identity cascade`;

  const c = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  const u = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'd@t', name: 'دولوپر' },
    { email: 'c@t', name: 'شرکتِ الف' },
  ]).returning({ id: users.id });
  [owner, dev, client] = u.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([
    { userId: owner, role: 'owner' },
    { userId: dev, role: 'member' },
    { userId: client, role: 'client' },
  ]);
  const t = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  devRole = t[0]!.id;
  const p = await db.insert(projects).values({ title: 'وب‌سایت', price: '0', currencyId: c[0]!.id })
    .returning({ id: projects.id });
  projectId = p[0]!.id;
});

afterAll(async () => { await sql.end(); });

describe('project_signed', () => {
  it('⚠️ کارفرمایی که به پروژه اضافه می‌شود خبردار می‌شود — پیش از این هیچ', async () => {
    await service.addProjectClient(ownerActor(), projectId, client);
    const n = await db.select().from(notifications).where(eq(notifications.userId, client));
    expect(n).toHaveLength(1);
    expect(n[0]!.type).toBe('project.signed');
    expect(n[0]!.title).toBe('به پروژه اضافه شدید: وب‌سایت');
    expect(n[0]!.body).toBe('شما به‌عنوان کارفرما به پروژهٔ «وب‌سایت» اضافه شدید.');
    expect(n[0]!.url).toBe(`/projects/${projectId}`);

    // دوباره افزودن: بی‌اثر و بی‌اعلان.
    await service.addProjectClient(ownerActor(), projectId, client);
    expect(await db.select().from(notifications).where(eq(notifications.userId, client))).toHaveLength(1);
  });

  it('عضوِ افزوده از کارت، با نامِ نقشش خبردار می‌شود؛ بالابردنِ مبلغ اعلانِ تازه نمی‌سازد', async () => {
    await service.addProjectMember(ownerActor(), projectId, { userId: dev, roleTagId: devRole, agreedAmount: '100' });
    const n = await db.select().from(notifications).where(eq(notifications.userId, dev));
    expect(n).toHaveLength(1);
    expect(n[0]!.body).toBe('شما به‌عنوان عضو با نقش (دولوپر) به پروژهٔ «وب‌سایت» اضافه شدید.');

    await service.addProjectMember(ownerActor(), projectId, { userId: dev, roleTagId: devRole, agreedAmount: '200' });
    expect(await db.select().from(notifications).where(eq(notifications.userId, dev))).toHaveLength(1);
  });
});
