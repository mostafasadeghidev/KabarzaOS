import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../client';
import {
  currencies, exchangeRates, projectClients, projectMembers, projectPayments, projects, tags, tasks, timelogs,
  userRoles, users,
} from '../schema';
import { getClientDetail, getMemberDetail } from '@/server/reports/service';
import { getInvoice } from '@/server/finance/invoice-service';
import type { Actor } from '@/domain/access/permissions';

/** ریزِ عضو/کارفرما و فاکتور — پورتِ member_detail / client_detail / Invoice::render. */

const OWNER = 1, M1 = 2, C1 = 4, C2 = 5;
const owner = (): Actor => ({ id: OWNER, roles: ['owner'], permissions: [], privateAccess: false });
let EUR = 0, IRR = 0, P1 = 0, P2 = 0;

beforeAll(async () => {
  await sql`truncate table audit_log, timelogs, tasks, project_payments, project_members, project_clients, projects, tags,
    exchange_rates, user_roles, users, currencies restart identity cascade`;
  const c = await db.insert(currencies).values([
    { code: 'EUR', name: 'یورو', symbol: '€', isDefault: true },
    { code: 'IRR', name: 'ریال', symbol: 'ریال', decimals: 0 },
  ]).returning({ id: currencies.id });
  [EUR, IRR] = [c[0]!.id, c[1]!.id];
  await db.insert(exchangeRates).values([
    { fromCurrencyId: EUR, toCurrencyId: IRR, rate: '50000', effectiveDate: '2026-09-01' },
    { fromCurrencyId: IRR, toCurrencyId: EUR, rate: '0.00002', effectiveDate: '2026-09-01' },
  ]);
  await db.insert(users).values([
    { email: 'o@t', name: 'مالک' }, { email: 'm1@t', name: 'سارا' }, { email: 'x@t', name: 'x' },
    { email: 'c1@t', name: 'کارفرمای اصلی' }, { email: 'c2@t', name: 'شریک' },
  ]);
  await db.insert(userRoles).values([
    { userId: OWNER, role: 'owner' }, { userId: M1, role: 'member' }, { userId: C1, role: 'client' }, { userId: C2, role: 'client' },
  ]);
  const tg = await db.insert(tags).values([
    { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress' },
    { name: 'نیاز به ریویو', type: 'task_status', statusGroup: 'review', isReview: true },
    { name: 'بالا', type: 'task_priority', sortOrder: 0 },
  ]).returning({ id: tags.id });
  const p = await db.insert(projects).values([
    // پروژهٔ ریالی: ۱۰٬۰۰۰٬۰۰۰ ریال = ۲۰۰ یورو.
    { title: 'ریالی', price: '10000000', currencyId: IRR, statusTagId: tg[0]!.id, regDate: '2026-08-01' },
    { title: 'یورویی', price: '1000', currencyId: EUR, statusTagId: tg[0]!.id },
  ]).returning({ id: projects.id });
  [P1, P2] = [p[0]!.id, p[1]!.id];
  await db.insert(projectClients).values([{ projectId: P1, userId: C1 }, { projectId: P1, userId: C2 }, { projectId: P2, userId: C1 }]);
  await db.insert(projectMembers).values([
    { projectId: P1, userId: M1, agreedAmount: '5000000', currencyId: IRR },
    { projectId: P2, userId: M1, agreedAmount: '300', currencyId: EUR },
  ]);
  await db.insert(projectPayments).values([
    { projectId: P1, userId: M1, direction: 'member_payout', amount: '1000000', currencyId: IRR, amountEur: '20' },
    // هزینهٔ یورویی روی پروژهٔ ریالی → در ارزِ پروژه ۵٬۰۰۰٬۰۰۰ ریال.
    { projectId: P1, direction: 'project_expense', amount: '100', currencyId: EUR, amountEur: '100', note: 'هاست' },
    { projectId: P1, direction: 'incoming', amount: '2000000', currencyId: IRR, amountEur: '40' },
    { projectId: P2, direction: 'incoming', amount: '1000', currencyId: EUR, amountEur: '1000' },
  ]);
  await db.insert(tasks).values({ projectId: P1, title: 'ریویویی', statusTagId: tg[1]!.id, priorityTagId: tg[2]!.id, assignedTo: M1, createdBy: OWNER });
  await db.insert(timelogs).values({ projectId: P1, userId: M1, logDate: '2020-01-01', minutes: 60 });
});

afterAll(async () => { await sql.end(); });

describe('ریزِ عضو (پورتِ member_detail)', () => {
  it('ردیف‌ها در ارزِ پروژه، کارت‌های یورو تبدیل‌شده، تسک‌ها در سطل، خطوطِ پرداخت با ارز', async () => {
    const d = (await getMemberDetail(owner(), M1))!;
    expect(d.projects.map((p) => [p.title, p.currencyCode, Number(p.agreed), Number(p.paid), p.status])).toEqual([
      ['ریالی', 'IRR', 5_000_000, 1_000_000, 'partial'], ['یورویی', 'EUR', 300, 0, 'unpaid'],
    ]);
    // ۵٬۰۰۰٬۰۰۰ ریال = ۱۰۰ یورو + ۳۰۰ = ۴۰۰؛ پرداختی ۲۰ یورو؛ بدهی ۳۸۰.
    expect(Number(d.totals.agreed)).toBe(400);
    expect(Number(d.totals.paid)).toBe(20);
    expect(Number(d.totals.debt)).toBe(380);
    expect(d.lines.map((l) => [l.projectId, Number(l.amount), l.currencyCode])).toEqual([[P1, 1_000_000, 'IRR']]);
    expect(d.ops.tasks.review.map((g) => g.tasks.map((t) => [t.title, t.priority]))).toEqual([[['ریویویی', 'بالا']]]);
    expect(d.ops.tasks.open).toEqual([]);
  });
});

describe('ریزِ کارفرما (پورتِ client_detail)', () => {
  it('هزینهٔ یورویی به ارزِ پروژه، فقط کارفرمای اصلی بدهکار، «شریک» صفر', async () => {
    const main = (await getClientDetail(owner(), C1))!;
    const irr = main.projects.find((p) => p.projectId === P1)!;
    // ۱۰٬۰۰۰٬۰۰۰ + ۱۰۰ یورو (= ۵٬۰۰۰٬۰۰۰ ریال) − ۲٬۰۰۰٬۰۰۰ دریافتی.
    expect([Number(irr.price), Number(irr.expenses), Number(irr.paid), Number(irr.remaining), irr.status, irr.shared])
      .toEqual([10_000_000, 5_000_000, 2_000_000, 13_000_000, 'partial', false]);
    // یورو: ۳۰۰ (ریالیِ باقی‌مانده ۲۶۰ یورو) + ... کارت‌های یورو: صورتحساب ۳۰۰ + ۱۰۰۰ = ۱۳۰۰، دریافتی ۴۰ + ۱۰۰۰.
    expect(Number(main.totals.billed)).toBe(1300);
    expect(Number(main.totals.received)).toBe(1040);
    expect(Number(main.totals.due)).toBe(260);
    expect(main.lines.map((l) => [l.projectId, l.note, l.currencyCode])).toEqual([[P1, 'هاست', 'EUR']]);

    const partner = (await getClientDetail(owner(), C2))!;
    const shared = partner.projects.find((p) => p.projectId === P1)!;
    expect([shared.shared, Number(shared.price), Number(shared.remaining)]).toEqual([true, 0, 0]);
  });
});

describe('فاکتور (پورتِ Invoice::render)', () => {
  it('ردیفِ هزینه به ارزِ پروژه می‌رود؛ اعشارِ ارز؛ صادرکنندهٔ بی‌نام خالی', async () => {
    const inv = await getInvoice(owner(), P1);
    expect(inv.currencyDecimals).toBe(0);
    expect(inv.charges.map((c) => Number(c.amount))).toEqual([10_000_000, 5_000_000]);
    expect(Number(inv.totals.totalDue)).toBe(15_000_000);
    expect(Number(inv.totals.paid)).toBe(2_000_000);
    expect(inv.rateMissing).toBe(0);
    expect(inv.issuer.name).toBe('');
  });
});
