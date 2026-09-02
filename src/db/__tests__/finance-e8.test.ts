import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { accounts, currencies, files, ledger, userRoles, users } from '../schema';
import * as service from '@/server/finance/service';
import type { Actor } from '@/domain/access/permissions';

/**
 * رسیدِ انتقال روی هر دو لِگ، تاریخچهٔ که/کِی از audit_log، رسیدِ مشترک با
 * حذف از یک لِگ نمی‌پرد، و پیش‌نمایشِ بستنِ دوره.
 */

const OWNER = 1;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let eur: number, accA: number, accB: number, receipt: number;
let outId: number, inId: number;

beforeAll(async () => {
  await sql`truncate table audit_log, ledger, files, fiscal_locks, fiscal_closings, accounts,
    user_roles, users, currencies restart identity cascade`;
  const [c] = await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true })
    .returning({ id: currencies.id });
  eur = c!.id;
  await db.insert(users).values({ email: 'o@t', name: 'مالک' });
  await db.insert(userRoles).values({ userId: OWNER, role: 'owner' });
  const acc = await db.insert(accounts).values([
    { name: 'صندوق', type: 'business', currencyId: eur, openingBalance: '100' },
    { name: 'بانک', type: 'personal', currencyId: eur, openingBalance: '0' },
  ]).returning({ id: accounts.id });
  accA = acc[0]!.id;
  accB = acc[1]!.id;
  const [f] = await db.insert(files).values({
    storageKey: 'receipts/test-e8.png', mime: 'image/png', size: 10, originalName: 'رسید.png',
    purpose: 'receipt', uploadedBy: OWNER,
  }).returning({ id: files.id });
  receipt = f!.id;
});

afterAll(async () => { await sql.end(); });

describe('انتقال با رسید و تاریخچه', () => {
  it('رسید روی هر دو لِگ می‌نشیند؛ هر دو لِگ «توسط» و رویدادِ ساخت دارند', async () => {
    [outId, inId] = await service.transfer(owner(), {
      fromAccountId: accA, toAccountId: accB, fromAmount: '10', toAmount: '10',
      entryDate: '2026-08-01', description: 'شارژ', receiptIds: [receipt],
    });
    const legs = await db.select({ id: ledger.id, receiptIds: ledger.receiptIds }).from(ledger).orderBy(ledger.id);
    expect(legs.map((r) => r.receiptIds)).toEqual([[receipt], [receipt]]);

    const b = await service.getLedger(owner(), { accountId: accB });
    const leg = b.entries.find((e) => e.id === inId)!;
    expect(leg.lastActor).toBe('مالک');
    expect(leg.timeline.map((e) => [e.action, e.name])).toEqual([['create', 'مالک']]);
    expect(leg.receipts.map((r) => [r.id, r.kind])).toEqual([[receipt, 'image']]);
  });

  it('حذفِ رسید از یک لِگ، فایلِ مشترک را از لِگِ دیگر نمی‌گیرد؛ ویرایش در تاریخچه می‌نشیند', async () => {
    await service.updateEntry(owner(), outId, {
      accountId: accA, entryDate: '2026-08-01', direction: 'out', amount: '10', currencyId: eur,
      description: 'شارژ', projectId: null, tagIds: [], officeId: null,
      payerUserId: null, payerLabel: '', receiverUserId: null, receiverLabel: 'بانک',
      removedReceiptIds: [receipt],
    });
    expect(await db.select({ id: files.id }).from(files).where(eq(files.id, receipt))).toHaveLength(1);

    const a = await service.getLedger(owner(), { accountId: accA });
    const out = a.entries.find((e) => e.id === outId)!;
    expect(out.receipts).toEqual([]);
    expect(out.timeline.map((e) => e.action)).toEqual(['create', 'update']);

    const b = await service.getLedger(owner(), { accountId: accB });
    expect(b.entries.find((e) => e.id === inId)!.receipts.map((r) => r.id)).toEqual([receipt]);
  });
});

describe('پیش‌نمایشِ بستنِ دوره', () => {
  it('ماندهٔ فعلیِ هر حساب و آخرین تغییرِ قفل', async () => {
    const before = await service.closingPreview(owner());
    expect(before.accounts.map((a) => [a.label, Number(a.balance)])).toEqual([['بانک', 10], ['صندوق', 90]]);
    expect(before.lastChange).toBeNull();

    await service.closePeriod(owner(), '2026-08-31');
    const after = await service.closingPreview(owner());
    expect(after.lastChange?.by).toBe('مالک');
    expect(after.lastChange?.lockDate).toBe('2026-08-31');

    await expect(service.closingPreview({ id: 2, roles: ['finance'], permissions: ['finance.manage'], privateAccess: false }))
      .rejects.toThrow();
  });
});
