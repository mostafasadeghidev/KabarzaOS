import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { projectClients, projectMembers, projects, tags, userRoles, users } from '../schema';
import { createProject, listProjects, updateProject } from '@/server/projects/service';
import { createProjectSchema } from '@/app/(app)/projects/_form/schema';
import type { Actor } from '@/domain/access/permissions';

/**
 * لینکِ سایتِ پروژه (۲.۱۹.۰): دامنهٔ اصلی و آدرسِ آزمایشی اختیاری‌اند، نرمال
 * ذخیره می‌شوند، و کارفرما فقط با تیکِ «نمایش به کارفرما» می‌بیندشان —
 * خالی‌شدن در سرور است، نه در UI.
 */

let OWNER = 0, MEMBER = 0, CLIENT = 0, OUTSIDER = 0, P = 0;
const as = (id: number, roles: Actor['roles']): Actor => ({ id, roles, permissions: [], privateAccess: false });
const owner = () => as(OWNER, ['owner']);
const member = () => as(MEMBER, ['member']);
const client = () => as(CLIENT, ['client']);

const base = {
  description: '', regDate: null, deadline: null, statusTagId: null, price: '0', currencyId: null,
  officeId: null, parentId: null, isUnitBased: false, isTender: false, scope: 'company' as const,
};

/** فیلدهای فرمِ پروژه که اسکیما رشتهٔ خالی می‌خواهد. */
const form = { title: 'x', regDate: '', deadline: '', statusTagId: '', price: '', currencyId: '', officeId: '', parentId: '' };

const linksOf = async (actor: Actor) => {
  const row = (await listProjects(actor)).find((r) => r.id === P);
  return row ? { live: row.liveUrl, test: row.testUrl } : null;
};

beforeAll(async () => {
  await sql`truncate table project_members, project_clients, projects, user_roles, tags, audit_log, notifications, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'o@n', name: 'مالک' }, { email: 'm@n', name: 'عضو' },
    { email: 'c@n', name: 'کارفرما' }, { email: 'x@n', name: 'غریبه' },
  ]).returning({ id: users.id });
  [OWNER, MEMBER, CLIENT, OUTSIDER] = u.map((r) => r.id) as [number, number, number, number];
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: MEMBER, role: 'member' },
    { userId: CLIENT, role: 'client' }, { userId: OUTSIDER, role: 'member' },
  ]);
  const [role] = await db.insert(tags).values({ name: 'دولوپر', type: 'member_role' }).returning({ id: tags.id });
  P = await createProject(owner(), {
    ...base, title: 'Site links',
    liveUrl: 'https://example.com/', testUrl: 'https://example.webflow.io/', urlsClientVisible: false,
  });
  await db.insert(projectMembers).values({ projectId: P, userId: MEMBER, roleTagId: role!.id });
  await db.insert(projectClients).values({ projectId: P, userId: CLIENT });
});

describe('فرم', () => {
  it('هر دو اختیاری‌اند و بی‌طرح، https می‌گیرند', () => {
    const empty = createProjectSchema.parse({ ...form, liveUrl: '', testUrl: '' });
    expect(empty.liveUrl).toBe('');
    expect(empty.testUrl).toBe('');
    expect(empty.urlsClientVisible).toBe(false);
    const parsed = createProjectSchema.parse({ ...form, liveUrl: 'example.com', testUrl: 'https://p.webflow.io' });
    expect(parsed.liveUrl).toBe('https://example.com/');
    expect(parsed.testUrl).toBe('https://p.webflow.io/');
  });

  it('آدرسِ ناامن یا ناقص رد می‌شود', () => {
    for (const bad of ['javascript:alert(1)', 'localhost', 'ftp://x.com']) {
      const r = createProjectSchema.safeParse({ ...form, liveUrl: bad, testUrl: '' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain('liveUrl');
    }
  });
});

describe('نمایش', () => {
  it('تیم و مالک همیشه می‌بینند', async () => {
    expect(await linksOf(owner())).toEqual({ live: 'https://example.com/', test: 'https://example.webflow.io/' });
    expect(await linksOf(member())).toEqual({ live: 'https://example.com/', test: 'https://example.webflow.io/' });
  });

  it('کارفرما بی‌تیک لینک نمی‌بیند — خالی از سرور می‌آید', async () => {
    expect(await linksOf(client())).toEqual({ live: '', test: '' });
  });

  it('با تیکِ «نمایش به کارفرما» هر دو دیده می‌شوند و با برداشتنش دوباره پنهان', async () => {
    await updateProject(owner(), P, { ...base, title: 'Site links', urlsClientVisible: true });
    expect(await linksOf(client())).toEqual({ live: 'https://example.com/', test: 'https://example.webflow.io/' });
    await updateProject(owner(), P, { ...base, title: 'Site links', urlsClientVisible: false });
    expect(await linksOf(client())).toEqual({ live: '', test: '' });
  });

  it('فراخوانِ قدیمی بی‌فیلدِ لینک، مقدارِ قبلی را نگه می‌دارد؛ خالی‌ها پاک می‌کنند', async () => {
    await updateProject(owner(), P, { ...base, title: 'Site links' });
    const [kept] = await db.select({ l: projects.liveUrl, t: projects.testUrl }).from(projects).where(eq(projects.id, P));
    expect(kept).toEqual({ l: 'https://example.com/', t: 'https://example.webflow.io/' });
    await updateProject(owner(), P, { ...base, title: 'Site links', liveUrl: '', testUrl: '' });
    const [cleared] = await db.select({ l: projects.liveUrl, t: projects.testUrl }).from(projects).where(eq(projects.id, P));
    expect(cleared).toEqual({ l: '', t: '' });
  });

  it('کسی که عضو نیست پروژه را نمی‌بیند', async () => {
    expect(await linksOf(as(OUTSIDER, ['member']))).toBeNull();
  });
});
