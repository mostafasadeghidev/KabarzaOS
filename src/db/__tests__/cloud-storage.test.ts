import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import { auditLog, cloudConnections, serviceGrants, services, userRoles, users } from '../schema';
import {
  deleteCloudConnection, listCloudConnections, saveCloudConnection, testCloudConnection,
} from '@/server/cloud/connections';
import {
  createCloudAccount, linkCloudAccount, listCloudAccounts, resetCloudPassword, setCloudEnabled, setCloudQuota,
} from '@/server/cloud/accounts';
import { deleteService, grantAccess, revealGrantSecret, revokeAccess, revokeMany } from '@/server/access/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * فضای ابری (۳.۴.۰) با دیتابیسِ واقعی و Nextcloud ِ ساختگی (همان شکلِ پاسخ‌های OCS):
 * چند اتصال، جفت = ردیفِ دفتر، قطع = غیرفعال روی Nextcloud، رمزِ برنامه هرگز بیرون نمی‌آید.
 */

const owner: Actor = { id: 1, roles: ['owner'], permissions: ['members.manage'] as Permission[], privateAccess: false };
const manager: Actor = { id: 1, roles: [], permissions: ['members.manage'] as Permission[], privateAccess: false };
const viewer: Actor = { id: 1, roles: [], permissions: ['members.view'] as Permission[], privateAccess: false };

type NcUser = { id: string; displayname: string; enabled: boolean; groups: string[]; quota: { used?: number; quota: number }; password?: string };
const ncUsers = new Map<string, NcUser>();
const calls: Array<{ method: string; path: string; body: URLSearchParams; auth: string }> = [];
let down = false;

const ok = (data: unknown) => Response.json({ ocs: { meta: { status: 'ok', statuscode: 200, message: 'OK' }, data } });
const fail = (http: number, statuscode: number, message: string) =>
  Response.json({ ocs: { meta: { status: 'failure', statuscode, message }, data: [] } }, { status: http });

let sara: number, reza: number, gone: number;

beforeAll(async () => {
  await sql`truncate table audit_log, service_grants, cloud_connections, services, user_roles, users restart identity cascade`;
  const rows = await db.insert(users).values([
    { email: 'sara@example.com', name: 'Sara' },
    { email: 'reza@example.com', name: 'Reza', username: 'rz' },
    { email: 'gone@example.com', name: 'Gone', memberState: 'locked' },
  ]).returning({ id: users.id });
  [sara, reza, gone] = rows.map((r) => r.id) as [number, number, number];
  await db.insert(userRoles).values([{ userId: sara, role: 'member' }, { userId: reza, role: 'member' }, { userId: gone, role: 'member' }]);

  for (const u of [
    { id: 'kabarza-os', displayname: 'bot', enabled: true, groups: ['team'], quota: { quota: -3 } },
    { id: 'sara', displayname: 'Sara', enabled: true, groups: ['team'], quota: { used: 2048, quota: 10737418240 } },
    { id: 'boss', displayname: 'Boss', enabled: true, groups: ['admin'], quota: { quota: -3 } },
  ] as NcUser[]) ncUsers.set(u.id, u);

  vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^.*\/ocs\/v2\.php\//, '');
    const body = new URLSearchParams(String(init.body ?? ''));
    calls.push({ method: String(init.method), path, body, auth: String((init.headers as Record<string, string>).Authorization) });
    if (down) throw new TypeError('fetch failed');
    if ((init.headers as Record<string, string>).Authorization !== `Basic ${Buffer.from('kabarza-os:app-secret').toString('base64')}`) {
      return fail(401, 997, 'Current user is not logged in');
    }
    if (url.searchParams.get('format') !== 'json') return new Response('xml', { status: 500 });

    let m: RegExpMatchArray | null;
    if (path === 'cloud/user') return ok({ id: 'kabarza-os', groups: ['team'] });
    if ((m = path.match(/^cloud\/groups\/([^/]+)\/users\/details$/))) {
      const group = decodeURIComponent(m[1]!);
      if (group !== 'team') return fail(403, 403, 'Not viewable');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const list = [...ncUsers.values()].filter((u) => u.groups.includes(group)).slice(offset, offset + 500);
      return ok({ users: Object.fromEntries(list.map((u) => [u.id, u])) });
    }
    if (path === 'cloud/users' && init.method === 'POST') {
      const id = body.get('userid')!;
      if (ncUsers.has(id)) return fail(400, 102, 'User already exists');
      if ((body.get('password') ?? '').length < 10) return fail(400, 107, 'Password is too short');
      if (!body.getAll('groups[]').includes('team')) return fail(403, 106, 'No group specified');
      ncUsers.set(id, { id, displayname: body.get('displayName') ?? id, enabled: true, groups: body.getAll('groups[]'), quota: { quota: 1 }, password: body.get('password')! });
      return ok({ id });
    }
    if ((m = path.match(/^cloud\/users\/([^/]+)(?:\/(enable|disable))?$/))) {
      const user = ncUsers.get(decodeURIComponent(m[1]!));
      if (!user) return fail(404, 998, 'User does not exist');
      if (init.method === 'GET') return ok(user);
      if (m[2]) { user.enabled = m[2] === 'enable'; return ok([]); }
      if (body.get('key') === 'password') { user.password = body.get('value')!; return ok([]); }
      if (body.get('key') === 'quota') { user.quota.quota = 1; return ok([]); }
      return fail(400, 103, 'Invalid key');
    }
    return fail(404, 998, 'nope');
  }));
});

afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => { calls.length = 0; down = false; });

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Main', baseUrl: 'https://cloud.example.com/', username: 'kabarza-os', groupId: 'team', defaultQuotaGb: '20', isActive: true, ...over,
});
let main: number;

describe('اتصال‌ها (فقط مالک)', () => {
  it('⚠️ فقط مالک؛ اتصالِ تازه بی رمز رد می‌شود؛ ورودیِ بد همهٔ مشکل‌ها را می‌گوید', async () => {
    await expect(saveCloudConnection(manager, null, form(), 'app-secret')).rejects.toThrow();
    await expect(saveCloudConnection(owner, null, form(), '')).rejects.toMatchObject({ code: 'no_secret' });
    await expect(saveCloudConnection(owner, null, form({ baseUrl: 'http://cloud.example.com', groupId: '' }), 'x'))
      .rejects.toMatchObject({ code: 'invalid', detail: 'url, group' });
  });

  it('اتصال = یک سرویس در دفتر با provider ِ خودش؛ رمز رمزگذاری‌شده است و به فهرست نمی‌رسد', async () => {
    main = await saveCloudConnection(owner, null, form(), 'app-secret');
    const [row] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, main));
    expect(row!.baseUrl).toBe('https://cloud.example.com');
    expect(row!.secretEnc).not.toContain('app-secret');
    const [svc] = await db.select().from(services).where(eq(services.id, row!.serviceId));
    expect(svc).toMatchObject({ provider: `nextcloud:${main}`, name: 'Main', downloadUrl: 'https://cloud.example.com' });
    const list = await listCloudConnections(owner);
    expect(list[0]).toMatchObject({ id: main, hasSecret: true, grants: 0 });
    expect(JSON.stringify(list)).not.toContain('app-secret');
    // هیچ‌جای رویدادها رمز ندارد.
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain('app-secret');
  });

  it('آزمون: موفق با شمارِ گروه؛ رمزِ غلط ← unauthorized و ذخیره در وضعیت', async () => {
    expect(await testCloudConnection(owner, main)).toMatchObject({ ok: true, users: 1, isAdmin: false });
    const second = await saveCloudConnection(owner, null, form({ name: 'Archive', baseUrl: 'https://archive.example.com' }), 'wrong');
    expect(await testCloudConnection(owner, second)).toMatchObject({ ok: false, error: 'unauthorized' });
    // ⚠️ رمزِ خالی در ویرایش = همان قبلی؛ رمزِ تازه وضعیت را پاک می‌کند.
    await saveCloudConnection(owner, second, form({ name: 'Archive 2', baseUrl: 'https://archive.example.com' }), '');
    expect((await listCloudConnections(owner)).find((c) => c.id === second)).toMatchObject({ name: 'Archive 2', hasSecret: true });
    await deleteCloudConnection(owner, second);
    expect(await listCloudConnections(owner)).toHaveLength(1);
  });

  it('⚠️ http فقط به localhost و آن هم بیرون از production', async () => {
    const id = await saveCloudConnection(owner, null, form({ name: 'Local', baseUrl: 'http://127.0.0.1:18500' }), 'app-secret');
    await deleteCloudConnection(owner, id);
    vi.stubEnv('NODE_ENV', 'production');
    await expect(saveCloudConnection(owner, null, form({ baseUrl: 'http://127.0.0.1:18500' }), 'app-secret'))
      .rejects.toMatchObject({ code: 'invalid' });
    vi.unstubAllEnvs();
  });
});

describe('حساب‌ها', () => {
  it('فهرست: فقط گروهِ اتصال، بی حسابِ خودِ اتصال، با پیشنهادِ عضو', async () => {
    await expect(listCloudAccounts(viewer, main)).rejects.toThrow();
    const view = await listCloudAccounts(manager, main);
    expect(view.error).toBeNull();
    expect(view.accounts.map((a) => a.id)).toEqual(['sara']);
    expect(view.accounts[0]).toMatchObject({ usedBytes: 2048, quotaBytes: 10737418240, suggestedUserId: sara, link: null });
  });

  it('⚠️ جفت = یک ردیفِ دفتر؛ حسابِ بیرونِ گروه و حسابِ اتصال دست نمی‌خورند؛ عضوِ سابق رد می‌شود', async () => {
    await linkCloudAccount(manager, main, 'sara', sara);
    await linkCloudAccount(manager, main, 'sara', sara);
    const open = await db.select().from(serviceGrants).where(isNull(serviceGrants.revokedAt));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ userId: sara, externalId: 'sara', accountRef: 'sara' });
    await expect(linkCloudAccount(manager, main, 'boss', reza)).rejects.toMatchObject({ code: 'protected' });
    await expect(linkCloudAccount(manager, main, 'kabarza-os', reza)).rejects.toMatchObject({ code: 'protected' });
    await expect(linkCloudAccount(manager, main, 'sara', gone)).rejects.toMatchObject({ code: 'member_inactive' });
    await expect(setCloudEnabled(manager, main, 'boss', false)).rejects.toMatchObject({ code: 'protected' });
    expect(ncUsers.get('boss')!.enabled).toBe(true);
  });

  it('⚠️ ردیفِ دستی روی سرویسِ فضای ابری ساخته نمی‌شود؛ سرویسش از دفتر حذف یا خاموش نمی‌شود', async () => {
    const [conn] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, main));
    await expect(grantAccess(manager, { serviceId: conn!.serviceId, userId: reza, accountRef: 'x', level: 'member', note: '' }))
      .rejects.toMatchObject({ code: 'managed_service' });
    await expect(deleteService(manager, conn!.serviceId)).rejects.toMatchObject({ code: 'cloud_service' });
  });

  it('ساختن: در گروهِ اتصال، رمزِ تصادفی در ردیفِ دفترِ عضو؛ نامِ گرفته و نامِ بد رد می‌شوند', async () => {
    await expect(createCloudAccount(manager, main, { memberId: reza, userId: 'Bad Name', quotaGb: 5 })).rejects.toMatchObject({ code: 'invalid_name' });
    await expect(createCloudAccount(manager, main, { memberId: reza, userId: 'sara', quotaGb: 5 })).rejects.toMatchObject({ code: 'name_taken' });
    await expect(createCloudAccount(manager, main, { memberId: sara, userId: 'sara2', quotaGb: 5 })).rejects.toMatchObject({ code: 'member_has_account' });
    await expect(createCloudAccount(manager, main, { memberId: reza, userId: 'rz', quotaGb: 0 })).rejects.toMatchObject({ code: 'invalid_quota' });

    const { grantId } = await createCloudAccount(manager, main, { memberId: reza, userId: 'rz', quotaGb: 15 });
    const post = calls.filter((c) => c.method === 'POST').at(-1)!;
    expect(post.body.getAll('groups[]')).toEqual(['team']);
    expect(post.body.get('quota')).toBe('15 GB');
    expect(post.body.get('displayName')).toBe('Reza');
    expect(await revealGrantSecret(manager, grantId)).toBe(ncUsers.get('rz')!.password);
    // رمز هیچ‌جای رویدادها نیست.
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(ncUsers.get('rz')!.password!);
  });

  it('⚠️ شمارِ دسترسی‌های اتصال فقط ردیف‌های سرویسِ خودش است (۳.۱۵.۰)', async () => {
    // پیش از این زیرپرسش «"service_id" = "service_id"» می‌شد — همهٔ دسترسی‌های همهٔ سرویس‌ها شمرده می‌شد.
    const [conn] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, main));
    const own = (await db.select().from(serviceGrants).where(eq(serviceGrants.serviceId, conn!.serviceId))).length;
    const [other] = await db.insert(services).values({ name: 'سرویسِ دیگر' }).returning({ id: services.id });
    await db.insert(serviceGrants).values([{ serviceId: other!.id, userId: reza }, { serviceId: other!.id, userId: sara }]);
    const listed = (await listCloudConnections(owner)).find((c) => c.id === main)!;
    expect(listed.grants).toBe(own);
    await db.delete(services).where(eq(services.id, other!.id));
  });

  it('حجم و رمزِ تازه (دستی و خودکار)', async () => {
    await setCloudQuota(manager, main, 'rz', 25.5);
    expect(calls.find((c) => c.method === 'PUT')!.body.get('value')).toBe('25.5 GB');
    await expect(setCloudQuota(manager, main, 'rz', 20000)).rejects.toMatchObject({ code: 'invalid_quota' });

    await expect(resetCloudPassword(manager, main, 'rz', 'short')).rejects.toMatchObject({ code: 'weak_password' });
    const r = await resetCloudPassword(manager, main, 'rz', 'NewPassw0rd2026');
    expect(r.password).toBeUndefined();
    expect(ncUsers.get('rz')!.password).toBe('NewPassw0rd2026');
    expect(await revealGrantSecret(manager, r.grantId!)).toBe('NewPassw0rd2026');
  });

  it('⚠️ قطع از دفتر = غیرفعال روی Nextcloud؛ سرورِ خاموش = ردیف باز می‌ماند', async () => {
    const [grant] = await db.select().from(serviceGrants)
      .where(and(eq(serviceGrants.externalId, 'rz'), isNull(serviceGrants.revokedAt)));
    down = true;
    await expect(revokeAccess(manager, grant!.id)).rejects.toMatchObject({ code: 'server' });
    expect((await db.select().from(serviceGrants).where(eq(serviceGrants.id, grant!.id)))[0]!.revokedAt).toBeNull();
    expect(ncUsers.get('rz')!.enabled).toBe(true);

    down = false;
    await revokeAccess(manager, grant!.id);
    expect(ncUsers.get('rz')!.enabled).toBe(false);
    const [after] = await db.select().from(serviceGrants).where(eq(serviceGrants.id, grant!.id));
    expect(after!.revokedAt).not.toBeNull();
    expect(after!.secretEnc).toBe('');
  });

  it('قطعِ گروهی (چک‌لیستِ خروج) حساب را هم می‌بندد؛ حسابی که دیگر نیست فقط ردیفش قطع می‌شود', async () => {
    const [sGrant] = await db.select().from(serviceGrants).where(and(eq(serviceGrants.externalId, 'sara'), isNull(serviceGrants.revokedAt)));
    expect(await revokeMany(manager, [sGrant!.id])).toBe(1);
    expect(ncUsers.get('sara')!.enabled).toBe(false);

    // وصلِ دوباره فقط حساب را روشن می‌کند؛ صاحب دوباره انتخاب می‌شود.
    await setCloudEnabled(manager, main, 'sara', true);
    expect(ncUsers.get('sara')!.enabled).toBe(true);
    await linkCloudAccount(manager, main, 'sara', sara);
    ncUsers.delete('sara');
    const [again] = await db.select().from(serviceGrants).where(and(eq(serviceGrants.externalId, 'sara'), isNull(serviceGrants.revokedAt)));
    await revokeAccess(manager, again!.id);
    expect((await db.select().from(serviceGrants).where(eq(serviceGrants.id, again!.id)))[0]!.revokedAt).not.toBeNull();
  });

  it('⚠️ اتصالی که تاریخچه دارد حذف نمی‌شود؛ خاموش از صفحه بیرون می‌رود', async () => {
    await expect(deleteCloudConnection(owner, main)).rejects.toMatchObject({ code: 'in_use' });
    await saveCloudConnection(owner, main, form({ isActive: false }), '');
    const view = await listCloudAccounts(manager, main);
    expect(view.current).toBeNull();
    const [conn] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, main));
    expect((await db.select().from(services).where(eq(services.id, conn!.serviceId)))[0]!.isActive).toBe(false);
  });
});
