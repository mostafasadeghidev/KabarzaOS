import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import { schedulerStamps, serviceGrants, services, userRoles, users } from '../schema';
import { linkMailAccount, listMailAccounts, setMailAliases } from '@/server/corp-mail/accounts';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * ایمیلِ شرکتی (۲.۶۰.۰) با دیتابیسِ واقعی و Stalwart ِ ساختگی (همان شکلِ پاسخ‌ها):
 * جفت = یک ردیفِ دفتر، جداکردن = قطع (تاریخچه می‌ماند)، یک صندوق برای یک عضو.
 */

const manager: Actor = { id: 1, roles: [], permissions: ['members.manage'] as Permission[], privateAccess: false };
const viewer: Actor = { id: 1, roles: [], permissions: ['members.view'] as Permission[], privateAccess: false };

const sent: Array<[string, Record<string, unknown>]> = [];
const accounts = [
  { id: 'b', name: 'admin', domainId: 'b', emailAddress: 'admin@example.com', aliases: {} },
  { id: 'c', name: 'test-smtp', domainId: 'b', emailAddress: 'test-smtp@example.com', aliases: { 0: { enable: true, name: 'test-smtp', domainId: 'c', description: null } } },
  { id: 'e', name: 'sara', domainId: 'b', emailAddress: 'sara@example.com', aliases: { 0: { enable: true, name: 'hi', domainId: 'b', description: null } } },
];

let sara: number, gone: number;

beforeAll(async () => {
  await sql`truncate table audit_log, service_grants, services, user_roles, users restart identity cascade`;
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, 'corp-mail:config'));
  await db.insert(schedulerStamps).values({ key: 'corp-mail:config', value: JSON.stringify({ domain: 'example.com', reserved: ['contact'] }) });
  const rows = await db.insert(users).values([
    { email: 'sara@example.com', name: 'Sara' },
    { email: 'gone@t', name: 'Gone', memberState: 'locked' },
  ]).returning({ id: users.id });
  [sara, gone] = rows.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: sara, role: 'member' }, { userId: gone, role: 'member' }]);

  process.env.STALWART_URL = 'http://stalwart.test';
  process.env.STALWART_API_KEY = 'k';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/jmap/session')) return Response.json({ primaryAccounts: { 'urn:stalwart:jmap': 'b' }, accounts: { b: {} } });
    const { methodCalls } = JSON.parse(String(init.body)) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
    return Response.json({
      methodResponses: methodCalls.map(([name, args, tag]) => {
        sent.push([name, args]);
        if (name === 'x:Domain/get') return [name, { list: [{ id: 'b', name: 'example.com' }, { id: 'c', name: 'box.example.com' }] }, tag];
        if (name === 'x:Account/get') {
          const ids = args.ids as string[] | null;
          return [name, { list: ids ? accounts.filter((a) => ids.includes(a.id)) : accounts }, tag];
        }
        if (name === 'x:Account/set') return [name, { updated: Object.fromEntries(Object.keys(args.update as object).map((k) => [k, null])) }, tag];
        return ['error', { ['type']: 'unknownMethod' }, tag];
      }),
    });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.STALWART_URL;
  delete process.env.STALWART_API_KEY;
});

beforeEach(() => { sent.length = 0; });

const openGrants = () => db.select().from(serviceGrants).where(isNull(serviceGrants.revokedAt));

describe('حساب‌های ایمیل', () => {
  it('فهرست: admin پنهان است و پیشنهاد از ایمیلِ عضو می‌آید', async () => {
    await expect(listMailAccounts(viewer)).rejects.toThrow();
    const view = await listMailAccounts(manager);
    expect(view.error).toBeNull();
    expect(view.accounts.map((a) => a.name)).toEqual(['sara', 'test-smtp']);
    expect(view.accounts.find((a) => a.name === 'sara')!.suggestedUserId).toBe(sara);
    // سرویسِ «ایمیلِ شرکتی» خودش ساخته شد.
    expect(await db.select().from(services).where(eq(services.provider, 'stalwart'))).toHaveLength(1);
  });

  it('⚠️ جفت = یک ردیفِ دفتر با شناسهٔ حساب؛ تکرار بی‌اثر است', async () => {
    await linkMailAccount(manager, 'e', sara);
    await linkMailAccount(manager, 'e', sara);
    const rows = await openGrants();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: sara, externalId: 'e', accountRef: 'sara@example.com' });
  });

  it('⚠️ یک عضو یک صندوق؛ عضوِ سابق و حسابِ admin رد می‌شوند', async () => {
    await expect(linkMailAccount(manager, 'c', sara)).rejects.toMatchObject({ code: 'member_has_mail' });
    await expect(linkMailAccount(manager, 'c', gone)).rejects.toMatchObject({ code: 'member_inactive' });
    await expect(linkMailAccount(manager, 'b', sara)).rejects.toMatchObject({ code: 'protected' });
  });

  it('⚠️ جداکردن قطع می‌کند و تاریخچه می‌ماند', async () => {
    await linkMailAccount(manager, 'e', null);
    expect(await openGrants()).toHaveLength(0);
    const all = await db.select().from(serviceGrants).where(and(eq(serviceGrants.externalId, 'e')));
    expect(all).toHaveLength(1);
    expect(all[0]!.revokedAt).not.toBeNull();
  });

  it('alias: نامِ گرفته یا رزرو پیش از فرستادن رد می‌شود؛ دامنهٔ قدیمی دست نمی‌خورد', async () => {
    await expect(setMailAliases(manager, 'c', ['hi'])).rejects.toMatchObject({ code: 'name_taken', detail: 'hi' });
    await expect(setMailAliases(manager, 'c', ['contact'])).rejects.toMatchObject({ code: 'reserved_name' });
    await expect(setMailAliases(manager, 'c', ['Bad Name'])).rejects.toMatchObject({ code: 'invalid_name' });
    expect(sent.some(([n]) => n === 'x:Account/set')).toBe(false);

    await setMailAliases(manager, 'c', ['Team']);
    const set = sent.find(([n]) => n === 'x:Account/set')![1] as { update: Record<string, { aliases: Record<string, { name: string; domainId: string }> }> };
    expect(Object.values(set.update.c!.aliases).map((a) => `${a.name}@${a.domainId}`)).toEqual(['test-smtp@c', 'team@b']);
  });
});
