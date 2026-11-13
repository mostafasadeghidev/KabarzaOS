import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { serviceGrants, services, users } from '../schema';
import { findUserByIdentifier } from '@/server/auth/identify';
import { companyEmailsOf, userIdByCompanyEmail } from '@/server/corp-mail/directory';

/**
 * ایمیلِ شرکتی در کارت و ورود (۳.۱.۰): نشانی از ردیفِ بازِ دفترِ دسترسی؛ ورود با
 * ایمیلِ شخصی، نامِ کاربری یا نشانیِ اصلیِ صندوقِ شرکتی.
 */

let sara: number, ali: number, reza: number, mailSvc: number, otherSvc: number;

beforeAll(async () => {
  await sql`truncate table audit_log, service_grants, services, user_roles, users restart identity cascade`;
  const u = await db.insert(users).values([
    { email: 'sara@gmail.test', name: 'Sara', username: 'sara' },
    { email: 'ali@gmail.test', name: 'Ali' },
    { email: 'reza@gmail.test', name: 'Reza' },
  ]).returning({ id: users.id });
  [sara, ali, reza] = u.map((r) => r.id) as [number, number, number];
  const s = await db.insert(services).values([
    { name: 'ایمیلِ شرکتی', provider: 'stalwart' },
    { name: 'Figma', provider: '' },
  ]).returning({ id: services.id });
  [mailSvc, otherSvc] = s.map((r) => r.id) as [number, number];
  await db.insert(serviceGrants).values([
    { serviceId: mailSvc, userId: sara, accountRef: 'Sara@Kabarza.test', externalId: 'a1', level: 'member' },
    // صندوقِ بسته‌شده — دیگر نه نشانیِ کارت، نه راهِ ورود.
    { serviceId: mailSvc, userId: ali, accountRef: 'ali@kabarza.test', externalId: 'a2', level: 'member', revokedAt: new Date() },
    // سرویسِ دیگر با شناسهٔ ایمیل‌مانند — ربطی به ورود ندارد.
    { serviceId: otherSvc, userId: reza, accountRef: 'reza@kabarza.test', externalId: '', level: 'member' },
    // ردیفِ دستیِ قدیمیِ بی‌جفت (external_id خالی) — حساب نمی‌شود.
    { serviceId: mailSvc, userId: reza, accountRef: 'old@kabarza.test', externalId: '', level: 'member' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('ایمیلِ شرکتی', () => {
  it('کارت: فقط صندوقِ باز و جفت‌شده', async () => {
    const map = await companyEmailsOf([sara, ali, reza]);
    expect(map.get(sara)).toBe('Sara@Kabarza.test');
    expect(map.has(ali)).toBe(false);
    expect(map.has(reza)).toBe(false);
  });

  it('ورود با ایمیلِ شخصی، نامِ کاربری و نشانیِ شرکتی (بی‌اعتنا به حروف)', async () => {
    expect((await findUserByIdentifier('sara@gmail.test'))?.user.id).toBe(sara);
    expect((await findUserByIdentifier('sara'))?.user.id).toBe(sara);
    const viaCompany = await findUserByIdentifier('sara@kabarza.test');
    expect(viaCompany?.user.id).toBe(sara);
    expect(viaCompany?.viaCompanyEmail).toBe(true);
  });

  it('⚠️ صندوقِ بسته، سرویسِ دیگر و ردیفِ بی‌جفت راهِ ورود نیستند', async () => {
    expect(await findUserByIdentifier('ali@kabarza.test')).toBeNull();
    expect(await findUserByIdentifier('reza@kabarza.test')).toBeNull();
    expect(await findUserByIdentifier('old@kabarza.test')).toBeNull();
    expect(await userIdByCompanyEmail('not-an-email')).toBeNull();
  });

  it('⚠️ ایمیلِ شخصیِ کسی بر نشانیِ شرکتیِ دیگری مقدم است', async () => {
    await db.update(users).set({ email: 'sara@kabarza.test' }).where(eq(users.id, reza));
    const found = await findUserByIdentifier('sara@kabarza.test');
    expect(found?.user.id).toBe(reza);
    expect(found?.viaCompanyEmail).toBe(false);
    await db.update(users).set({ email: 'reza@gmail.test' }).where(eq(users.id, reza));
  });

  it('⚠️ دو ردیفِ باز با یک نشانی ← هیچ‌کس (ورود باید بی‌ابهام باشد)', async () => {
    await db.insert(serviceGrants).values({ serviceId: mailSvc, userId: ali, accountRef: 'sara@kabarza.test', externalId: 'a9', level: 'member' });
    expect(await userIdByCompanyEmail('sara@kabarza.test')).toBeNull();
    await db.delete(serviceGrants).where(eq(serviceGrants.externalId, 'a9'));
    expect(await userIdByCompanyEmail('sara@kabarza.test')).toBe(sara);
  });
});
