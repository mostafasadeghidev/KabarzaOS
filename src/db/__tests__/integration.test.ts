import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import { currencies, users, tags, projects, projectMembers, paymentRequests, ledger, accounts } from '../schema';
import { eq } from 'drizzle-orm';

/**
 * تستِ یکپارچه روی Postgres واقعی.
 * ثابت می‌کند قواعدی که در rules/ مستند شده‌اند، در **دیتابیس** اعمال می‌شوند —
 * نه فقط در کد. این تفاوتِ ساختاریِ اصلی با نسخهٔ قبلی است.
 */

/**
 * Drizzle خطای دیتابیس را در «Failed query …» می‌پیچد و نامِ محدودیت در
 * error.cause می‌ماند. این کمک‌تابع کلِ زنجیره را می‌خواند تا تست واقعاً
 * ثابت کند **کدام** محدودیت شلیک کرده، نه فقط اینکه خطایی رخ داده.
 */
async function expectDbError(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const parts: string[] = [];
    let cur: unknown = err;
    while (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    }
    expect(parts.join(' | ')).toMatch(pattern);
    return;
  }
  throw new Error('expected the database to reject this write, but it succeeded');
}

let eurId: number, userId: number, roleA: number, roleB: number, projectId: number, accountId: number;

beforeAll(async () => {
  // پاک‌سازیِ حالتِ قبلی (ترتیب مهم است — کلیدهای خارجی).
  await sql`truncate table payment_requests, project_members, ledger, accounts, projects, tags, users, currencies restart identity cascade`;

  const cur = await db.insert(currencies)
    .values({ code: 'EUR', name: 'یورو', symbol: '€', decimals: 2, isDefault: true })
    .returning({ id: currencies.id });
  eurId = cur[0]!.id;

  const usr = await db.insert(users)
    .values({ email: 'dev@test', name: 'توسعه‌دهنده' })
    .returning({ id: users.id });
  userId = usr[0]!.id;

  const roles = await db.insert(tags)
    .values([{ name: 'دولوپر', type: 'member_role' }, { name: 'طراح', type: 'member_role' }])
    .returning({ id: tags.id });
  roleA = roles[0]!.id;
  roleB = roles[1]!.id;

  const proj = await db.insert(projects)
    .values({ title: 'پروژهٔ تست', price: '1000', currencyId: eurId })
    .returning({ id: projects.id });
  projectId = proj[0]!.id;

  const acc = await db.insert(accounts)
    .values({ name: 'حسابِ اصلی', currencyId: eurId })
    .returning({ id: accounts.id });
  accountId = acc[0]!.id;
});

afterAll(async () => {
  await sql.end();
});

describe('R-PROJ-09 — کلید (پروژه، کاربر، نقش) است', () => {
  it('عضو با دو نقشِ متفاوت پذیرفته می‌شود و برای هر دو پول می‌گیرد', async () => {
    await db.insert(projectMembers).values([
      { projectId, userId, roleTagId: roleA, agreedAmount: '600' },
      { projectId, userId, roleTagId: roleB, agreedAmount: '400' },
    ]);
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
    expect(rows).toHaveLength(2);
  });

  it('⚠️ نقشِ تکراری در سطحِ دیتابیس رد می‌شود (نه فقط در کد)', async () => {
    await expectDbError(
      () => db.insert(projectMembers).values({ projectId, userId, roleTagId: roleA, agreedAmount: '9999' }),
      /project_members_uq/i,
    );
  });
});

describe('R-TEAM-10 — «پرداخت‌شده» بدونِ تراکنشِ بانکی معنا ندارد', () => {
  it('درخواستِ paid بدونِ ledgerId رد می‌شود', async () => {
    await expectDbError(
      () => db.insert(paymentRequests).values({ projectId, userId, amount: '100', currencyId: eurId, status: 'paid' }),
      /paid_needs_ledger/i,
    );
  });

  it('با تراکنشِ واقعی پذیرفته می‌شود', async () => {
    const [row] = await db.insert(ledger).values({
      accountId, entryDate: '2026-05-01', direction: 'out',
      amount: '100', currencyId: eurId, amountAccount: '100', createdBy: userId,
    }).returning({ id: ledger.id });

    const inserted = await db.insert(paymentRequests)
      .values({ projectId, userId, amount: '100', currencyId: eurId, status: 'paid', ledgerId: row!.id })
      .returning({ id: paymentRequests.id });
    expect(inserted).toHaveLength(1);
  });
});

describe('G9 — enumها با check محدود می‌شوند', () => {
  it('وضعیتِ نامعتبرِ دفترکل رد می‌شود', async () => {
    await expect(
      sql`insert into ledger (account_id, entry_date, direction, amount, currency_id, amount_account, status, created_by)
          values (${accountId}, '2026-05-01', 'in', '10', ${eurId}, '10', 'posted', ${userId})`,
    ).rejects.toThrow(/ledger_status_ck/i);
  });

  it('scope نامعتبر رد می‌شود', async () => {
    await expect(
      sql`insert into accounts (name, currency_id, scope) values ('بد', ${eurId}, 'invalid')`,
    ).rejects.toThrow(/accounts_scope_ck/i);
  });
});

describe('درزهای باز — پیش‌فرضِ امن', () => {
  it('تراکنشِ جدید پیش‌فرض confirmed و company است', async () => {
    const [row] = await db.insert(ledger).values({
      accountId, entryDate: '2026-06-01', direction: 'in',
      amount: '50', currencyId: eurId, amountAccount: '50', createdBy: userId,
    }).returning();
    expect(row!.status).toBe('confirmed');
    expect(row!.scope).toBe('company');
    // فیلدهای فازهای بعد خالی‌اند ولی موجود
    expect(row!.vatRate).toBeNull();
    expect(row!.sourceHash).toBeNull();
  });
});

describe('G2 — پول با دقتِ decimal ذخیره می‌شود', () => {
  it('مقدار بدونِ خطای شناور برمی‌گردد', async () => {
    const [row] = await db.insert(ledger).values({
      accountId, entryDate: '2026-06-02', direction: 'in',
      amount: '0.1', currencyId: eurId, amountAccount: '0.2', createdBy: userId,
    }).returning({ amount: ledger.amount, amountAccount: ledger.amountAccount });
    // 0.1 + 0.2 در JS می‌شود 0.30000000000000004 — اینجا رشته است، دست‌نخورده
    expect(row!.amount).toBe('0.1000');
    expect(row!.amountAccount).toBe('0.2000');
  });
});
