import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { accounts, currencies, ledger, projectClients, projects, unitEntries, userRoles, users } from '../schema';
import * as service from '@/server/finance/service';
import { assertUnitPayable, markUnitPaid, PayoutError } from '@/server/finance/payouts';
import type { Actor } from '@/domain/access/permissions';

/**
 * انتخابگرِ کارکرد داخلِ فرمِ دفتر — پورتِ `unitUnpaid` / `from_unit`: فهرستِ
 * پرداخت‌نشده‌ها به تفکیکِ «پروژه:عضو»، اعتبارسنجیِ کارکردِ انتخاب‌شده پیش از ثبت،
 * و بسته‌شدنِ کارکرد با شناسهٔ ردیفِ دفتر.
 */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let eur = 0, P1 = 0, P2 = 0, acc = 0, u1 = 0, u2 = 0, u3 = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, unit_entries, payment_requests, project_clients, accounts, projects,
    user_roles, users, currencies restart identity cascade`;
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c!.id;
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const p = await db.insert(projects).values([
    { title: 'تعدادی', price: '0', currencyId: eur, isUnitBased: true },
    { title: 'دیگری', price: '0', currencyId: eur },
  ]).returning({ id: projects.id });
  P1 = p[0]!.id;
  P2 = p[1]!.id;
  const [a] = await db.insert(accounts).values({ name: 'بانک', type: 'business', currencyId: eur, openingBalance: '1000' })
    .returning({ id: accounts.id });
  acc = a!.id;
  const rows = await db.insert(unitEntries).values([
    { projectId: P1, userId: M1, entryDate: '2026-08-10', quantity: '3', amount: '50', currencyId: eur },
    { projectId: P1, userId: M1, entryDate: '2026-08-11', quantity: '1', amount: '20', currencyId: eur, status: 'requested' },
    { projectId: P2, userId: M1, entryDate: '2026-08-12', quantity: '2', amount: '30', currencyId: eur },
  ]).returning({ id: unitEntries.id });
  [u1, u2, u3] = rows.map((r) => r.id) as [number, number, number];
});

afterAll(async () => { await sql.end(); });

describe('انتخابگرِ کارکرد در فرمِ دفتر', () => {
  it('فقط پرداخت‌نشده‌ها، به تفکیکِ «پروژه:عضو»، با متنِ تاریخ · تعداد × · مبلغ', async () => {
    const o = await service.getEntryFormOptions(owner());
    expect(Object.keys(o.unitUnpaid).sort()).toEqual([`${P1}:${M1}`, `${P2}:${M1}`]);
    expect(o.unitUnpaid[`${P1}:${M1}`]).toEqual([
      { id: u1, amount: '50.0000', currencyId: eur, text: '2026-08-10 · 3× · € 50.00' },
    ]);
  });

  it('کارکردِ پروژه/گیرندهٔ دیگر، درخواست‌شده یا پرداخت‌شده رد می‌شود', async () => {
    await expect(assertUnitPayable(owner(), u3, { projectId: P1, receiverUserId: M1 }))
      .rejects.toMatchObject({ code: 'mismatch' });
    await expect(assertUnitPayable(owner(), u1, { projectId: P1, receiverUserId: OWNER }))
      .rejects.toMatchObject({ code: 'mismatch' });
    await expect(assertUnitPayable(owner(), u2, { projectId: P1, receiverUserId: M1 }))
      .rejects.toMatchObject({ code: 'has_request' });
    await expect(assertUnitPayable(owner(), 999, { projectId: P1, receiverUserId: M1 }))
      .rejects.toBeInstanceOf(PayoutError);
    expect((await assertUnitPayable(owner(), u1, { projectId: P1, receiverUserId: M1 })).id).toBe(u1);
  });

  it('پس از ثبتِ ردیف، کارکرد «پرداخت‌شده» و به ردیف وصل می‌شود و از فهرست می‌رود', async () => {
    const ledgerId = await service.createEntry(owner(), {
      accountId: acc, entryDate: '2026-08-20', direction: 'out', amount: '50', currencyId: eur,
      amountSettled: '50', settledCurrencyId: eur,
      description: 'پرداختِ کارکرد', projectId: P1, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: M1, receiverLabel: 'سارا',
    });
    await markUnitPaid(owner(), u1, ledgerId);
    const [row] = await db.select({ status: unitEntries.status, ledgerId: unitEntries.ledgerId })
      .from(unitEntries).where(eq(unitEntries.id, u1));
    expect(row).toEqual({ status: 'paid', ledgerId });
    expect((await db.select({ id: ledger.id }).from(ledger).where(eq(ledger.id, ledgerId))).length).toBe(1);

    const o = await service.getEntryFormOptions(owner());
    expect(o.unitUnpaid[`${P1}:${M1}`]).toBeUndefined();
    await expect(assertUnitPayable(owner(), u1, { projectId: P1, receiverUserId: M1 }))
      .rejects.toMatchObject({ code: 'already_paid' });
  });
});

describe('باریک‌سازیِ فیلتر و انتخابگرِ پروژه (پورتِ projects_in_account / projectUsers)', () => {
  it('فیلترِ پروژهٔ دفتر فقط پروژه‌های همین حساب را می‌دهد؛ کارفرمایان به تفکیکِ پروژه می‌آیند', async () => {
    await db.insert(projectClients).values({ projectId: P2, userId: M1 });
    const l = await service.getLedger(owner(), { accountId: acc });
    expect(l.accountProjectIds).toEqual([P1]);
    const o = await service.getEntryFormOptions(owner());
    expect(o.projectClientIds).toEqual({ [P2]: [M1] });
  });
});
