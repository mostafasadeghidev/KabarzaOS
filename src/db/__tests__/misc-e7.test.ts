import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { company, currencies, projects, tags, userRoles, users, workTimers } from '../schema';
import { removeCompanyLogo } from '@/server/files/service';
import { getDashboard } from '@/server/dashboard';
import { ForbiddenError } from '@/domain/access/guard';
import type { Actor } from '@/domain/access/permissions';

/** ریزه‌کاری‌های پایانی: حذفِ لوگوی شرکت، پنلِ زندهٔ داشبورد. */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });

beforeAll(async () => {
  await sql`truncate table audit_log, work_timers, projects, tags, company, user_roles, users, currencies restart identity cascade`;
  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const [inp] = await db.insert(tags).values({ name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' }).returning({ id: tags.id });
  const [p] = await db.insert(projects).values({ title: 'پروژه', price: '0', statusTagId: inp!.id }).returning({ id: projects.id });
  await db.insert(workTimers).values({ userId: M1, projectId: p!.id, startedAt: new Date(Date.now() - 30 * 60_000) });
  await db.insert(company).values({ id: 1, name: 'شرکت', logoFileId: null });
});

afterAll(async () => { await sql.end(); });

describe('لوگوی شرکت', () => {
  it('فقط مالک حذف می‌کند؛ بعد از حذف لوگو تهی است', async () => {
    await expect(removeCompanyLogo({ id: M1, roles: ['member'], permissions: [], privateAccess: false })).rejects.toBeInstanceOf(ForbiddenError);
    await removeCompanyLogo(owner());
    const [row] = await db.select({ logoFileId: company.logoFileId }).from(company).where(eq(company.id, 1));
    expect(row!.logoFileId).toBeNull();
  });
});

describe('پنلِ زندهٔ داشبورد', () => {
  it('تایمرهای روشن با نام/پروژه/دقیقه و آخرین رویدادها', async () => {
    const d = await getDashboard(owner());
    expect(d.today.timers.map((w) => [w.name, w.project])).toEqual([['سارا', 'پروژه']]);
    expect(d.today.timers[0]!.minutes).toBeGreaterThanOrEqual(29);
    expect(Array.isArray(d.today.activity)).toBe(true);
  });
});
