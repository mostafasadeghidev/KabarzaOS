import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  accounts, currencies, exchangeRates, ledger, projectMembers, projectPayments, projects, userRoles, users,
} from '../schema';
import * as service from '@/server/finance/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * «از طلبِ … کم شود» (۲.۲۵.۰): عضو می‌گوید «۲ میلیون واریز کن»؛ مبلغ ریالی است،
 * ۱۰۵٫۲۶ یورو از طلبش کم می‌شود. یوروی ردیفِ دفتر (گزارش‌ها) باید همان ۱۰۵٫۲۶ باشد —
 * هم هنگامِ ثبت و هم بعد از «بازمحاسبهٔ معادل یورو» با نرخِ تازه‌تر.
 */

const OWNER = 1, M1 = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let eur = 0, irr = 0, P = 0, acc = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, project_payments, exchange_rates, project_members, accounts, projects,
    user_roles, users, currencies restart identity cascade`;
  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id;
  irr = c[1]!.id;
  await db.insert(exchangeRates).values({ fromCurrencyId: eur, toCurrencyId: irr, rate: '19000', effectiveDate: '2026-10-05' });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'علی' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }]);
  const [p] = await db.insert(projects).values({ title: 'تست', price: '0', currencyId: eur }).returning({ id: projects.id });
  P = p!.id;
  await db.insert(projectMembers).values({ projectId: P, userId: M1, agreedAmount: '500', currencyId: eur });
  const [a] = await db.insert(accounts).values({ name: 'Blue', type: 'business', currencyId: irr, openingBalance: '0' })
    .returning({ id: accounts.id });
  acc = a!.id;
});

afterAll(async () => { await sql.end(); });

describe('یوروی ردیف = عددی که از طلبِ عضو کم شد', () => {
  let id = 0;

  it('گزینه‌های فرم تاریخچهٔ نرخ را دارند', async () => {
    const o = await service.getEntryFormOptions(owner());
    expect(o.rates).toEqual([{ from: eur, to: irr, rate: expect.any(String), date: '2026-10-05' }]);
  });

  it('ثبت: ۲ میلیون ریال با کسرِ ۱۰۵٫۲۶ یورو', async () => {
    id = await service.createEntry(owner(), {
      accountId: acc, entryDate: '2026-10-08', direction: 'out', amount: '2000000', currencyId: irr,
      amountSettled: '105.26', settledCurrencyId: eur,
      description: 'درخواستِ علی', projectId: P, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: M1, receiverLabel: 'علی',
    });
    const [row] = await db.select({ eur: ledger.amountEur, account: ledger.amountAccount }).from(ledger).where(eq(ledger.id, id));
    expect(Number(row!.eur)).toBe(105.26);
    expect(Number(row!.account)).toBe(2000000);
    const [pay] = await db.select({ eur: projectPayments.amountEur, settled: projectPayments.amountSettled })
      .from(projectPayments).where(eq(projectPayments.ledgerId, id));
    expect(Number(pay!.settled)).toBe(105.26);
    expect(Number(pay!.eur)).toBe(105.26);
  });

  it('بازمحاسبه با نرخِ تازه‌تر یوروی ردیف را از طلبِ عضو جدا نمی‌کند', async () => {
    await db.insert(exchangeRates).values({ fromCurrencyId: eur, toCurrencyId: irr, rate: '25000', effectiveDate: '2026-10-10' });
    await service.recomputeEur(owner());
    const [row] = await db.select({ eur: ledger.amountEur }).from(ledger).where(eq(ledger.id, id));
    expect(Number(row!.eur)).toBe(105.26);
  });
});
