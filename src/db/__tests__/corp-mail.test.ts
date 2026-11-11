import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, sql } from '../client';
import { schedulerStamps, serviceGrants, services, userRoles, users } from '../schema';
import {
  closeMailAccount, createMailAccount, generateMailPassword, linkMailAccount, listMailAccounts, resetMailPassword, setMailAliases,
} from '@/server/corp-mail/accounts';
import { grantAccess, revealGrantSecret, revokeAccess, revokeMany } from '@/server/access/service';
import type { Actor, Permission } from '@/domain/access/permissions';

/**
 * ایمیلِ شرکتی (۲.۶۰.۰) با دیتابیسِ واقعی و Stalwart ِ ساختگی (همان شکلِ پاسخ‌ها):
 * جفت = یک ردیفِ دفتر، جداکردن = قطع (تاریخچه می‌ماند)، یک صندوق برای یک عضو.
 */

const manager: Actor = { id: 1, roles: [], permissions: ['members.manage'] as Permission[], privateAccess: false };
const viewer: Actor = { id: 1, roles: [], permissions: ['members.view'] as Permission[], privateAccess: false };

const sent: Array<[string, Record<string, unknown>]> = [];
const accounts: Array<{ id: string; name: string; domainId: string; emailAddress: string; aliases: Record<string, unknown> }> = [
  { id: 'b', name: 'admin', domainId: 'b', emailAddress: 'admin@example.com', aliases: {} },
  { id: 'c', name: 'test-smtp', domainId: 'b', emailAddress: 'test-smtp@example.com', aliases: { 0: { enable: true, name: 'test-smtp', domainId: 'c', description: null } } },
  { id: 'e', name: 'sara', domainId: 'b', emailAddress: 'sara@example.com', aliases: { 0: { enable: true, name: 'hi', domainId: 'b', description: null } } },
];

let sara: number, gone: number;
let failSets = false;

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
        if (name === 'x:Account/set') {
          if (failSets) return [name, { notUpdated: Object.fromEntries(Object.keys((args.update ?? {}) as object).map((k) => [k, { ['type']: 'serverFail' }])) }, tag];
          const created: Record<string, { id: string }> = {};
          for (const [key, acc] of Object.entries((args.create ?? {}) as Record<string, { name: string; aliases: Record<string, unknown> }>)) {
            const id = 'n' + accounts.length;
            accounts.push({ id, name: acc.name, domainId: 'b', emailAddress: `${acc.name}@example.com`, aliases: acc.aliases as never });
            created[key] = { id };
          }
          for (const [id, patch] of Object.entries((args.update ?? {}) as Record<string, { aliases?: unknown }>)) {
            const acc = accounts.find((a) => a.id === id);
            if (acc && patch.aliases) acc.aliases = patch.aliases as never;
          }
          return [name, { updated: Object.fromEntries(Object.keys((args.update ?? {}) as object).map((k) => [k, null])), created }, tag];
        }
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

describe('ساختن، رمزِ تازه، بستن (۲.۶۱.۰)', () => {
  let ali: number;
  beforeAll(async () => {
    const [row] = await db.insert(users).values({ email: 'ali@x', name: 'Ali' }).returning({ id: users.id });
    ali = row!.id;
    await db.insert(userRoles).values({ userId: ali, role: 'member' });
  });

  const credentialOf = (call: [string, Record<string, unknown>] | undefined, key: string) => {
    const args = call![1] as { create?: Record<string, { credentials: Record<string, { secret: string }> }>; update?: Record<string, { credentials?: Record<string, { secret: string }> }> };
    return (args.create?.[key] ?? args.update?.[key])?.credentials?.['0']?.secret;
  };

  it('رمزِ تصادفی: طول و الفبای بی‌ابهام', () => {
    const pw = generateMailPassword();
    expect(pw).toHaveLength(20);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(new Set(Array.from({ length: 50 }, () => generateMailPassword())).size).toBe(50);
  });

  it('⚠️ ساختن: حساب با همان رمزی که کارمند می‌بیند؛ رمز در گزارش نیست', async () => {
    await expect(createMailAccount(manager, { userId: ali, local: 'hi', aliases: [] })).rejects.toMatchObject({ code: 'name_taken' });
    await expect(createMailAccount(manager, { userId: ali, local: 'contact', aliases: [] })).rejects.toMatchObject({ code: 'reserved_name' });
    await expect(createMailAccount(manager, { userId: gone, local: 'gone', aliases: [] })).rejects.toMatchObject({ code: 'member_inactive' });
    expect(sent.some(([n]) => n === 'x:Account/set')).toBe(false);

    const { grantId, address } = await createMailAccount(manager, { userId: ali, local: 'Ali', aliases: ['ali.m'] });
    expect(address).toBe('ali@example.com');
    const secret = credentialOf(sent.find(([n]) => n === 'x:Account/set'), 'n');
    expect(secret).toHaveLength(20);
    expect(await revealGrantSecret({ ...manager, id: ali }, grantId)).toBe(secret);

    const logs = await sql`select coalesce(before::text,'') || coalesce(after::text,'') as t from audit_log`;
    expect(logs.some((r) => String(r.t).includes(secret!))).toBe(false);
    await expect(createMailAccount(manager, { userId: ali, local: 'ali2', aliases: [] })).rejects.toMatchObject({ code: 'member_has_mail' });
  });

  it('⚠️ دفترِ عادی ردیفِ ایمیلِ شرکتی نمی‌سازد و جابه‌جایش نمی‌کند', async () => {
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.provider, 'stalwart'));
    await expect(grantAccess(manager, { serviceId: svc!.id, userId: sara, accountRef: 'x', level: 'member', note: '' }))
      .rejects.toMatchObject({ code: 'managed_service' });
    const [row] = await openGrants().then((r) => r.filter((g) => g.userId === ali));
    await expect(grantAccess(manager, { grantId: row!.id, serviceId: svc!.id, userId: sara, accountRef: 'x', level: 'member', note: '' }))
      .rejects.toMatchObject({ code: 'managed_service' });
    // یادداشت و سطح آزاد است.
    await grantAccess(manager, { grantId: row!.id, serviceId: svc!.id, userId: ali, accountRef: row!.accountRef, level: 'admin', note: 'ok' });
  });

  it('رمزِ تازه فقط برای صندوقِ وصل، و در همان ردیف', async () => {
    const [row] = (await openGrants()).filter((g) => g.userId === ali);
    await expect(resetMailPassword(manager, 'c')).rejects.toMatchObject({ code: 'not_linked' });
    sent.length = 0;
    await resetMailPassword(manager, row!.externalId);
    const secret = credentialOf(sent.find(([n]) => n === 'x:Account/set'), row!.externalId);
    expect(await revealGrantSecret(manager, row!.id)).toBe(secret);
  });

  it('⚠️ قطع در دفتر صندوق را واقعاً می‌بندد؛ اگر سرور نپذیرد ردیف باز می‌ماند', async () => {
    const [row] = (await openGrants()).filter((g) => g.userId === ali);
    failSets = true;
    await expect(revokeAccess(manager, row!.id)).rejects.toMatchObject({ code: 'stalwart' });
    expect(await revokeMany(manager, [row!.id])).toBe(0);
    expect((await openGrants()).some((g) => g.id === row!.id)).toBe(true);
    failSets = false;

    sent.length = 0;
    await revokeAccess(manager, row!.id);
    const set = sent.find(([n]) => n === 'x:Account/set')![1] as { update: Record<string, { aliases: Record<string, { enable: boolean }>; credentials: Record<string, { secret: string }> }> };
    const patch = set.update[row!.externalId]!;
    expect(Object.values(patch.aliases).every((a) => a.enable === false)).toBe(true);
    expect(patch.credentials['0']!.secret).toHaveLength(32);
    const [after] = await db.select().from(serviceGrants).where(eq(serviceGrants.id, row!.id));
    expect(after!.revokedAt).not.toBeNull();
    expect(after!.secretEnc).toBe('');
  });

  it('بستنِ صندوقِ بی‌صاحب هم ممکن است', async () => {
    await closeMailAccount(manager, 'c');
  });
});

describe('پیامِ ردِ Stalwart', () => {
  it('⚠️ علتِ ردِ یک ورودی به مدیر می‌رسد، نه فقط «کلید پذیرفته نشد»', async () => {
    const { corpMailMessage } = await import('@/server/corp-mail/accounts');
    expect(corpMailMessage('stalwart', 'forbidden: Missing permission sysAccountUpdate')).toBe('سرورِ ایمیل این تغییر را نپذیرفت: {name}');
    expect(corpMailMessage('stalwart', 'forbidden')).toContain('کلید را نپذیرفت');
    expect(corpMailMessage('stalwart', 'network')).toContain('کمی بعد');
  });
});
