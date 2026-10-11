import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  accounts, currencies, paymentRequests, projectMembers, projects, unitEntries, unitPayments, userRoles, users,
} from '../schema';
import * as service from '@/server/finance/service';
import { markUnitPaid, payRequest, payUnit, listUnpaidUnits } from '@/server/finance/payouts';
import { listUnitEntries, myUnpaidUnits, requestForUnit } from '@/server/finance/member-service';
import type { Actor } from '@/domain/access/permissions';

/**
 * پرداختِ چندقسطیِ کارکرد (۲.۲۵.۰): ۳۶۰ یورو در دو یا چند قسط، از هر سه مسیر —
 * «کارِ پرداخت‌نشده»، فرمِ دفتر و درخواستِ عضو — و برگشتِ مانده با حذفِ ردیفِ دفتر.
 */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
const sara = (): Actor => ({ id: M1, roles: ['member'], permissions: [], privateAccess: false });
let eur = 0, P = 0, acc = 0, unit = 0;

const row = async () => (await db.select().from(unitEntries).where(eq(unitEntries.id, unit)))[0]!;

beforeAll(async () => {
  await sql`truncate table audit_log, notifications, ledger, unit_payments, unit_entries, payment_requests, project_payments,
    project_members, accounts, projects, user_roles, users, currencies restart identity cascade`;
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c!.id;
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const [p] = await db.insert(projects).values({ title: 'تعدادی', price: '0', currencyId: eur, isUnitBased: true })
    .returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: M1, unitRate: '120', currencyId: eur });
  const [a] = await db.insert(accounts).values({ name: 'بانک', type: 'business', currencyId: eur, openingBalance: '5000' })
    .returning({ id: accounts.id });
  acc = a!.id;
  const [u] = await db.insert(unitEntries).values({
    projectId: P, userId: M1, entryDate: '2026-10-01', quantity: '3', amount: '360', currencyId: eur, name: 'CAT',
  }).returning({ id: unitEntries.id });
  unit = u!.id;
});

afterAll(async () => { await sql.end(); });

describe('قسط‌های کارکرد', () => {
  let firstLedger = 0;

  it('قسطِ اول از «کارِ پرداخت‌نشده»: ۲۰۰ از ۳۶۰ ← بخشی پرداخت‌شده', async () => {
    firstLedger = (await payUnit(owner(), unit, { accountId: acc, entryDate: '2026-10-02', part: '200' })).ledgerId;
    const r = await row();
    expect(r.status).toBe('unpaid');
    expect(Number(r.paidAmount)).toBe(200);
    const listed = (await listUnpaidUnits(owner())).find((x) => x.id === unit)!;
    expect(Number(listed.remaining)).toBe(160);
    expect(Number(await myUnpaidUnits(sara(), P))).toBe(160);
  });

  it('بیشتر از مانده پذیرفته نمی‌شود', async () => {
    await expect(payUnit(owner(), unit, { accountId: acc, entryDate: '2026-10-03', part: '161' })).rejects.toThrow();
  });

  it('درخواستِ عضو = مانده (۱۶۰)، و پرداختش ردیف را می‌بندد', async () => {
    const requestId = await requestForUnit(sara(), unit);
    const [req] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, requestId));
    expect(Number(req!.amount)).toBe(160);
    expect((await row()).status).toBe('requested');

    await payRequest(owner(), requestId, { accountId: acc, entryDate: '2026-10-05' });
    const r = await row();
    expect(r.status).toBe('paid');
    expect(Number(r.paidAmount)).toBe(360);
    const list = (await listUnitEntries(sara(), P)).find((x) => x.id === unit)!;
    expect(list.installments.map((i) => Number(i.amount))).toEqual([200, 160]);
  });

  it('حذفِ ردیفِ دفترِ قسطِ اول، ۲۰۰ را به مانده برمی‌گرداند', async () => {
    await service.deleteEntry(owner(), firstLedger);
    const r = await row();
    expect(r.status).toBe('unpaid');
    expect(Number(r.paidAmount)).toBe(160);
    expect((await db.select().from(unitPayments).where(eq(unitPayments.unitEntryId, unit))).length).toBe(1);
  });

  it('فرمِ دفتر: قسطِ دلخواه با markUnitPaid، و پیش‌فرض = کلِ مانده', async () => {
    const ledgerId = await service.createEntry(owner(), {
      accountId: acc, entryDate: '2026-10-06', direction: 'out', amount: '50', currencyId: eur,
      amountSettled: '50', settledCurrencyId: eur,
      description: 'قسط', projectId: P, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: M1, receiverLabel: 'سارا',
    });
    await markUnitPaid(owner(), unit, ledgerId, '50');
    expect(Number((await row()).paidAmount)).toBe(210);

    const last = await service.createEntry(owner(), {
      accountId: acc, entryDate: '2026-10-07', direction: 'out', amount: '150', currencyId: eur,
      amountSettled: '150', settledCurrencyId: eur,
      description: 'قسطِ آخر', projectId: P, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: M1, receiverLabel: 'سارا',
    });
    await markUnitPaid(owner(), unit, last);
    const r = await row();
    expect(r.status).toBe('paid');
    expect(Number(r.paidAmount)).toBe(360);
  });
});
