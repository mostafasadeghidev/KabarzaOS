import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { schedulerStamps, serviceGrants, services, userRoles, users } from '../schema';
import { connectMailbox, listMail, mailAttachment, mailboxState, readMail } from '@/server/corp-mail/mailbox';
import { seal } from '@/server/ai/secret-box';
import type { Actor } from '@/domain/access/permissions';

/**
 * صندوقِ خودِ کارمند (۲.۶۲.۰) با Stalwart ِ ساختگی: رمزِ اصلی فقط برای گرفتنِ
 * کلید، محدودیتِ تلاش، «دیدن به‌جای کاربر»، و پیوستِ فقط همان ایمیل.
 */

const REAL_PASSWORD = 'correct horse';
const sent: Array<{ auth: string; calls: string[] }> = [];
let me: number, other: number;
const actorOf = (id: number, over: Partial<Actor> = {}): Actor => ({ id, roles: [], permissions: [], privateAccess: false, ...over });

beforeAll(async () => {
  await sql`truncate table audit_log, service_grants, services, user_roles, users restart identity cascade`;
  await db.delete(schedulerStamps).where(eq(schedulerStamps.key, 'corp-mail:config'));
  await db.insert(schedulerStamps).values({ key: 'corp-mail:config', value: JSON.stringify({ domain: 'example.com', appIps: ['10.0.4.0/24'] }) });
  const rows = await db.insert(users).values([{ email: 'me@x', name: 'Me' }, { email: 'o@x', name: 'Other' }]).returning({ id: users.id });
  [me, other] = rows.map((r) => r.id) as [number, number];
  await db.insert(userRoles).values([{ userId: me, role: 'member' }, { userId: other, role: 'member' }]);
  const [svc] = await db.insert(services).values({ name: 'ایمیلِ شرکتی', provider: 'stalwart' }).returning({ id: services.id });
  await db.insert(serviceGrants).values([
    { serviceId: svc!.id, userId: me, accountRef: 'me@example.com', externalId: 'm' },
    { serviceId: svc!.id, userId: other, accountRef: 'o@example.com', externalId: 'o', appSecretEnc: seal('other-app') },
  ]);

  process.env.STALWART_URL = 'http://stalwart.test';
  process.env.STALWART_API_KEY = 'k';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const auth = String((init.headers as Record<string, string>).authorization ?? '');
    const [user, pass] = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString().split(':');
    const ok = (user === 'me@example.com' && (pass === REAL_PASSWORD || pass === 'app-secret'))
      || (user === 'o@example.com' && pass === 'other-app');
    if (!ok) return new Response('', { status: 401 });
    if (url.endsWith('/jmap/session')) return Response.json({ primaryAccounts: { 'urn:ietf:params:jmap:mail': user!.slice(0, 1) }, accounts: {} });
    if (url.includes('/jmap/download/')) return new Response('file');
    const { methodCalls } = JSON.parse(String(init.body)) as { methodCalls: Array<[string, Record<string, unknown>, string]> };
    sent.push({ auth: pass === REAL_PASSWORD ? 'password' : 'app', calls: methodCalls.map((c) => c[0]) });
    return Response.json({
      methodResponses: methodCalls.map(([name, args, tag]) => {
        if (name === 'x:AppPassword/set') return [name, { created: { k: { secret: 'app-secret' } } }, tag];
        if (name === 'Mailbox/get') return [name, { list: [{ id: 'i', name: 'Inbox', role: 'inbox', unreadEmails: 1, totalEmails: 1 }] }, tag];
        if (name === 'Email/query') return [name, { ids: ['e1'], total: 1 }, tag];
        if (name === 'Email/get') return [name, { list: [{ id: 'e1', subject: 's', keywords: {}, attachments: [{ blobId: 'b1', name: 'a.pdf', type: 'application/pdf', size: 3 }], htmlBody: [], textBody: [{ partId: 't' }], bodyValues: { t: { value: 'hi' } } }] }, tag];
        if (name === 'Email/set') return [name, { updated: { e1: null } }, tag];
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

describe('صندوقِ خودِ کارمند', () => {
  it('پیش از اتصال: «وصل‌شده ولی متصل‌نشده»؛ خواندن رد می‌شود', async () => {
    expect(await mailboxState(me)).toBe('linked');
    await expect(listMail(actorOf(me))).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('⚠️ «دیدن به‌جای کاربر» هیچ ایمیلی نشان نمی‌دهد', async () => {
    await expect(listMail(actorOf(other, { viewOnly: true }))).rejects.toMatchObject({ code: 'view_only' });
    await expect(connectMailbox(actorOf(me, { viewOnly: true }), REAL_PASSWORD)).rejects.toMatchObject({ code: 'view_only' });
  });

  it('⚠️ رمزِ اشتباه شمرده می‌شود و پس از ۵ بار قفل؛ رمز هیچ‌جا ذخیره نمی‌شود', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(connectMailbox(actorOf(me), 'wrong')).rejects.toMatchObject({ code: 'bad_password' });
    }
    await expect(connectMailbox(actorOf(me), REAL_PASSWORD)).rejects.toMatchObject({ code: 'too_many' });
    (globalThis as { __kbzMailFails?: Map<number, number[]> }).__kbzMailFails!.delete(me);
  });

  it('⚠️ اتصال: کلیدِ کم‌دسترسی با IP ِ مجاز؛ خواندن فقط با کلید، نه رمز', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (init?.body) calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return original(url, init);
    }));
    await connectMailbox(actorOf(me), REAL_PASSWORD);
    vi.stubGlobal('fetch', original);
    const create = JSON.stringify(calls[0]);
    expect(create).toContain('"@type":"Replace"');
    expect(create).toContain('"10.0.4.0/24":true');
    expect(create).not.toContain('sysAccount');
    expect(create).not.toContain('emailSend');

    expect(await mailboxState(me)).toBe('connected');
    const rows = await sql`select coalesce(before::text,'') || coalesce(after::text,'') as t from audit_log`;
    expect(rows.some((r) => String(r.t).includes(REAL_PASSWORD))).toBe(false);
    const [grant] = await db.select().from(serviceGrants).where(eq(serviceGrants.userId, me));
    expect(grant!.appSecretEnc).not.toContain('app-secret');

    sent.length = 0;
    const list = await listMail(actorOf(me));
    expect(list.items.map((i) => i.id)).toEqual(['e1']);
    const mail = await readMail(actorOf(me), 'e1');
    expect(mail.text).toBe('hi');
    expect(sent.every((s) => s.auth === 'app')).toBe(true);
    expect(sent.some((s) => s.calls.includes('Email/set'))).toBe(true);
  });

  it('⚠️ فقط پیوستِ واقعیِ همان ایمیل، و شناسه‌های خراب رد', async () => {
    await expect(mailAttachment(actorOf(me), 'e1', 'not-attached')).rejects.toMatchObject({ code: 'not_found' });
    await expect(mailAttachment(actorOf(me), '../x', 'b1')).rejects.toMatchObject({ code: 'not_found' });
    await expect(readMail(actorOf(me), 'e1/../../admin')).rejects.toMatchObject({ code: 'not_found' });
    const file = await mailAttachment(actorOf(me), 'e1', 'b1');
    expect(file.name).toBe('a.pdf');
  });

  it('کلیدِ باطل‌شده اتصال را پاک می‌کند تا کارمند دوباره وصل کند', async () => {
    await db.update(serviceGrants).set({ appSecretEnc: seal('revoked-key') }).where(eq(serviceGrants.userId, me));
    await expect(listMail(actorOf(me))).rejects.toMatchObject({ code: 'not_connected' });
    expect(await mailboxState(me)).toBe('linked');
  });
});
