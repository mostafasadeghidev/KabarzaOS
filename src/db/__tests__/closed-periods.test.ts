import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { accounts, currencies, userRoles, users } from '../schema';
import * as service from '@/server/finance/service';
import type { Actor } from '@/domain/access/permissions';

/** تبِ «دوره‌های بسته» (۲.۲۵.۰): هر دوره با ماندهٔ منجمدِ هر حساب؛ بازگشایی در تاریخچه می‌ماند. */

const OWNER = 1;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let eur = 0, acc = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, fiscal_closings, fiscal_locks, accounts, user_roles, users, currencies
    restart identity cascade`;
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c!.id;
  await db.insert(users).values({ email: 'o@t', name: 'مالک' });
  await db.insert(userRoles).values({ userId: OWNER, role: 'owner' });
  const [a] = await db.insert(accounts).values({ name: 'بانک', type: 'business', currencyId: eur, openingBalance: '100' })
    .returning({ id: accounts.id });
  acc = a!.id;
  await service.createEntry(owner(), {
    accountId: acc, entryDate: '2025-06-01', direction: 'in', amount: '50', currencyId: eur,
    description: 'واریز', projectId: null, tagIds: [], officeId: null,
    payerUserId: null, payerLabel: '', receiverUserId: null, receiverLabel: '',
  });
});

afterAll(async () => { await sql.end(); });

describe('دوره‌های بسته', () => {
  it('بی‌دوره، فهرست خالی است (تب دیده نمی‌شود)', async () => {
    expect(await service.listClosedPeriods(owner())).toEqual([]);
  });

  it('پس از بستن، دوره با ماندهٔ پایانِ هر حساب', async () => {
    await service.closePeriod(owner(), '2025-12-31');
    const [p] = await service.listClosedPeriods(owner());
    expect(p!.closeDate).toBe('2025-12-31');
    expect(p!.reopened).toBe(false);
    expect(p!.accounts).toHaveLength(1);
    expect(Number(p!.accounts[0]!.closingBalance)).toBe(150);
  });

  it('بازگشایی دوره را از تاریخچه پاک نمی‌کند', async () => {
    await service.reopenPeriod(owner());
    const [p] = await service.listClosedPeriods(owner());
    expect(p!.reopened).toBe(true);
  });
});
