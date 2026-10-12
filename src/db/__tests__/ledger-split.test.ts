import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import {
  accounts, currencies, exchangeRates, ledger, projectMembers, projectPayments, projects, userRoles, users,
} from '../schema';
import * as service from '@/server/finance/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * «یک واریز برای چند پروژه» (۲.۲۷.۰): ۲۰ میلیون به علی برای سه پروژه — سه ردیف
 * با یک گروه، جمعِ دقیق، و حذفِ تکی یا گروهی.
 */

const OWNER = 1, ALI = 2;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let eur = 0, irr = 0, acc = 0;
const P: number[] = [];

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, project_payments, exchange_rates, project_members, accounts, projects,
    user_roles, users, currencies restart identity cascade`;
  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال' },
  ]).returning({ id: currencies.id });
  eur = c[0]!.id;
  irr = c[1]!.id;
  await db.insert(exchangeRates).values({ fromCurrencyId: eur, toCurrencyId: irr, rate: '50000', effectiveDate: '2022-01-01' });
  await db.insert(users).values([{ email: 'o@t', name: 'مالک' }, { email: 'a@t', name: 'علی' }]);
  await db.insert(userRoles).values([{ userId: OWNER, role: 'owner' }, { userId: ALI, role: 'member' }]);
  for (const title of ['Barr', 'TM', 'MSS']) {
    const [p] = await db.insert(projects).values({ title, price: '0', currencyId: eur }).returning({ id: projects.id });
    P.push(p!.id);
    await db.insert(projectMembers).values({ projectId: p!.id, userId: ALI, agreedAmount: '500', currencyId: eur });
  }
  const [a] = await db.insert(accounts).values({ name: 'Blue', type: 'business', currencyId: irr, openingBalance: '0' })
    .returning({ id: accounts.id });
  acc = a!.id;
});

afterAll(async () => { await sql.end(); });

const base = (): service.EntryInput => ({
  accountId: acc, entryDate: '2022-07-12', direction: 'out', amount: '20000000', currencyId: irr,
  description: 'واریزِ ۲۰ میلیونی', projectId: null, tagIds: [], officeId: null,
  payerUserId: null, payerLabel: '', receiverUserId: ALI, receiverLabel: 'علی',
});

describe('یک واریز برای چند پروژه', () => {
  it('جمعِ نابرابر رد می‌شود و هیچ ردیفی نمی‌ماند', async () => {
    await expect(service.createSplitEntries(owner(), base(), [
      { projectId: P[0]!, amount: '10000000' }, { projectId: P[1]!, amount: '5000000' },
    ])).rejects.toThrow(service.SplitError);
    expect(await db.select().from(ledger)).toHaveLength(0);
  });

  let ids: number[] = [];
  it('سه ردیف، یک گروه، هر پروژه سهمِ خودش', async () => {
    ids = await service.createSplitEntries(owner(), base(), [
      { projectId: P[0]!, amount: '10000000', amountSettled: '200', settledCurrencyId: eur },
      { projectId: P[1]!, amount: '6000000', amountSettled: '120', settledCurrencyId: eur },
      { projectId: P[2]!, amount: '4000000', amountSettled: '80', settledCurrencyId: eur },
    ]);
    const rows = await db.select().from(ledger);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.splitGroup)).size).toBe(1);
    expect(rows.reduce((s, r) => s + Number(r.amountAccount), 0)).toBe(20000000);
    const pays = await db.select({ p: projectPayments.projectId, s: projectPayments.amountSettled }).from(projectPayments);
    expect(pays.map((x) => Number(x.s)).sort((a, b) => a - b)).toEqual([80, 120, 200]);

    const view = await service.getLedger(owner(), { accountId: acc, includeLocked: true });
    const first = view.entries.find((e) => e.id === ids[0])!;
    expect(first.splitCount).toBe(3);
    expect(first.splitIndex).toBe(1);
  });

  it('حذفِ تکی فقط همان ردیف؛ حذفِ گروهی بقیه را هم', async () => {
    await service.deleteEntry(owner(), ids[2]!);
    expect(await db.select().from(ledger)).toHaveLength(2);
    await service.deleteEntry(owner(), ids[0]!, { wholeSplit: true });
    expect(await db.select().from(ledger)).toHaveLength(0);
  });

  it('«مبلغِ واقعیِ حساب» به نسبتِ سهم‌ها پخش می‌شود و جمعش دقیق می‌ماند', async () => {
    await service.createSplitEntries(owner(), { ...base(), amountAccountOverride: '19999999' }, [
      { projectId: P[0]!, amount: '10000000' }, { projectId: P[1]!, amount: '10000000' },
    ]);
    const rows = await db.select({ a: ledger.amountAccount }).from(ledger).where(eq(ledger.accountId, acc));
    expect(rows.reduce((s, r) => s + Number(r.a), 0)).toBeCloseTo(19999999, 4);
  });
});
