import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  currencies, ledger, paymentRequests, projectMembers, projectPayments, projects, unitEntries,
} from '@/db/schema';
import { membershipProjectIds } from '@/server/projects/authority';
import { rateSource } from '@/server/finance/service';
import {
  paymentStatus, rowValueIn, summarizeProject, type PaymentStatus,
} from '@/domain/team-money/payments';
import type { Actor } from '@/domain/access/permissions';

/**
 * «مالیِ من» — نمای **بین‌پروژه‌ایِ** شخصی؛ پورتِ `view_finance()` ِ داشبوردِ
 * نسخهٔ قبلی.
 *
 * ⚠️ این صفحه حسابداری **نیست**: هیچ حساب، دفتر یا پولِ کسِ دیگری در آن
 * نیست. کارفرما صورت‌حسابِ پروژه‌های خودش را می‌بیند و عضو دریافتی‌های
 * خودش را — دقیقاً همان دو بخشی که افزونه داشت و تا امروز فقط به‌صورتِ
 * تبِ داخلِ هر پروژه وجود داشت.
 *
 * ⚠️ همهٔ کوئری‌ها **دسته‌ای**‌اند (پورتِ `prime_project_totals` /
 * `prime_member_totals`): یک کوئری برای همهٔ پروژه‌ها، نه یکی به‌ازای هر
 * ردیف — وگرنه عضوی با ۲۰ پروژه ۸۰ کوئری می‌زد (R-PERF-01).
 */

export interface MyPaymentLine {
  id: number;
  paidAt: string;
  amount: string;
  currencyCode: string | null;
  /** ارزشِ ردیف در ارزِ پروژه (پورتِ ستونِ «معادل (محاسبه)»)؛ null یعنی نرخ نداریم. */
  counted: string | null;
  note: string;
  receiptId: number | null;
}

export interface MyMemberProject {
  projectId: number;
  title: string;
  currencyCode: string | null;
  agreed: string;
  paid: string;
  remaining: string;
  status: PaymentStatus;
  isUnitBased: boolean;
  /** پروژهٔ تعدادی: جمعِ پرداخت‌شده و پرداخت‌نشدهٔ ردیف‌های کارکرد. */
  unitPaid: string;
  unitUnpaid: string;
  units: Array<{ id: number; entryDate: string; quantity: number; amount: string; isPaid: boolean }>;
  payouts: MyPaymentLine[];
  requests: Array<{ id: number; amount: string; currencyCode: string | null; status: string; createdAt: string }>;
}

export interface MyClientProject {
  projectId: number;
  title: string;
  currencyCode: string | null;
  price: string;
  billableExpenses: string;
  totalDue: string;
  paid: string;
  remaining: string;
  status: PaymentStatus;
  payments: MyPaymentLine[];
  expenses: MyPaymentLine[];
}

const zero = (v: string | null | undefined) => Number(v ?? 0);

/** ردیفِ پرداخت + رسیدِ دفترش — شکلِ مشترکِ هر دو بخش. */
function lineOf(
  row: {
    id: number; paidAt: string; amount: string; amountSettled: string | null;
    currencyId: number; settledCurrencyId: number | null; note: string;
    currencyCode: string | null; receiptIds: number[] | null;
  },
  source: Parameters<typeof rowValueIn>[0],
  projectCurrencyId: number | null,
): MyPaymentLine {
  return {
    id: row.id,
    paidAt: row.paidAt,
    // ⚠️ آنچه واقعاً تسویه شد بر مبلغِ اسمی مقدم است (R-TEAM-01).
    amount: row.amountSettled ?? row.amount,
    currencyCode: row.currencyCode,
    counted: projectCurrencyId ? rowValueIn(source, row, projectCurrencyId) : null,
    note: row.note,
    receiptId: row.receiptIds?.[0] ?? null,
  };
}

export async function getMyMoney(actor: Actor) {
  const isMember = actor.roles.includes('member');
  const isClient = actor.roles.includes('client');
  if (!isMember && !isClient) {
    return { isMember, isClient, memberProjects: [], clientProjects: [], noProjectPayouts: [], noProjectIncoming: [] };
  }

  /**
   * ⚠️ همان `current_projects('member' | 'client')` ِ نسخهٔ قبلی: فقط
   * رابطهٔ واقعی، بدونِ مناقصه‌هایی که کاربر صرفاً واجدِ شرایطشان است.
   */
  const [memberIds, clientIds] = await Promise.all([
    isMember ? membershipProjectIds(actor.id, ['member']) : Promise.resolve([]),
    isClient ? membershipProjectIds(actor.id, ['client']) : Promise.resolve([]),
  ]);

  const allIds = [...new Set([...memberIds, ...clientIds])];
  const { source } = await rateSource();

  const projectRows = allIds.length === 0 ? [] : await db
    .select({
      id: projects.id,
      title: projects.title,
      price: projects.price,
      currencyId: projects.currencyId,
      currencyCode: currencies.code,
      isUnitBased: projects.isUnitBased,
    })
    .from(projects)
    .leftJoin(currencies, eq(currencies.id, projects.currencyId))
    .where(inArray(projects.id, allIds));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  /** ستون‌های مشترکِ هر ردیفِ پرداخت (رسید از دفترِ آینه می‌آید). */
  const paymentColumns = {
    id: projectPayments.id,
    projectId: projectPayments.projectId,
    direction: projectPayments.direction,
    paidAt: projectPayments.paidAt,
    amount: projectPayments.amount,
    amountSettled: projectPayments.amountSettled,
    currencyId: projectPayments.currencyId,
    settledCurrencyId: projectPayments.settledCurrencyId,
    note: projectPayments.note,
    currencyCode: currencies.code,
    receiptIds: ledger.receiptIds,
  };

  const [
    memberships, memberPayments, requests, units, clientPayments, noProjectPayouts, noProjectIncoming,
  ] = await Promise.all([
    memberIds.length === 0 ? [] : db
      .select({
        projectId: projectMembers.projectId,
        agreedAmount: projectMembers.agreedAmount,
        currencyId: projectMembers.currencyId,
        currencyCode: currencies.code,
      })
      .from(projectMembers)
      .leftJoin(currencies, eq(currencies.id, projectMembers.currencyId))
      .where(and(
        eq(projectMembers.userId, actor.id),
        inArray(projectMembers.projectId, memberIds),
      )),

    memberIds.length === 0 ? [] : db
      .select(paymentColumns)
      .from(projectPayments)
      .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
      .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
      .where(and(
        eq(projectPayments.userId, actor.id),
        eq(projectPayments.direction, 'member_payout'),
        inArray(projectPayments.projectId, memberIds),
      ))
      .orderBy(desc(projectPayments.paidAt), desc(projectPayments.id)),

    memberIds.length === 0 ? [] : db
      .select({
        id: paymentRequests.id,
        projectId: paymentRequests.projectId,
        amount: paymentRequests.amount,
        status: paymentRequests.status,
        createdAt: paymentRequests.createdAt,
        currencyCode: currencies.code,
      })
      .from(paymentRequests)
      .leftJoin(currencies, eq(currencies.id, paymentRequests.currencyId))
      .where(and(
        eq(paymentRequests.userId, actor.id),
        inArray(paymentRequests.projectId, memberIds),
      ))
      .orderBy(desc(paymentRequests.id)),

    memberIds.length === 0 ? [] : db
      .select({
        id: unitEntries.id,
        projectId: unitEntries.projectId,
        entryDate: unitEntries.entryDate,
        quantity: unitEntries.quantity,
        amount: unitEntries.amount,
        status: unitEntries.status,
      })
      .from(unitEntries)
      .where(and(
        eq(unitEntries.userId, actor.id),
        inArray(unitEntries.projectId, memberIds),
      ))
      .orderBy(desc(unitEntries.entryDate), desc(unitEntries.id)),

    clientIds.length === 0 ? [] : db
      .select(paymentColumns)
      .from(projectPayments)
      .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
      .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
      .where(and(
        inArray(projectPayments.projectId, clientIds),
        inArray(projectPayments.direction, ['incoming', 'project_expense']),
      ))
      .orderBy(desc(projectPayments.paidAt), desc(projectPayments.id)),

    /**
     * پرداخت‌های **بی‌پروژه** — ردیف‌هایی که پروژه‌شان با «جداسازی» حذف شده
     * (R-PROJ-03). نسخهٔ قبلی هم همین‌ها را جدا نشان می‌داد؛ پیش از این فقط
     * عضوِ سابق آن‌ها را می‌دید.
     */
    !isMember ? [] : db
      .select(paymentColumns)
      .from(projectPayments)
      .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
      .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
      .where(and(
        isNull(projectPayments.projectId),
        eq(projectPayments.userId, actor.id),
        eq(projectPayments.direction, 'member_payout'),
      ))
      .orderBy(desc(projectPayments.id)),

    !isClient ? [] : db
      .select(paymentColumns)
      .from(projectPayments)
      .leftJoin(currencies, eq(currencies.id, projectPayments.currencyId))
      .leftJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
      .where(and(
        isNull(projectPayments.projectId),
        eq(projectPayments.userId, actor.id),
        eq(projectPayments.direction, 'incoming'),
      ))
      .orderBy(desc(projectPayments.id)),
  ]);

  /* ---------------- بخشِ عضو ---------------- */

  const memberProjects: MyMemberProject[] = memberIds.map((projectId) => {
    const project = projectById.get(projectId);
    const rows = memberships.filter((m) => m.projectId === projectId);
    /**
     * ⚠️ ارزِ قرارداد: ارزِ **ردیفِ عضویت**، وگرنه ارزِ پروژه (R-TEAM-05).
     * جمع فقط روی ردیف‌هایی است که همان ارز را دارند — جمع‌کردنِ دو ارزِ
     * متفاوت عددی می‌ساخت که هیچ معنایی نداشت.
     */
    const contractCurrencyId = rows.find((r) => r.currencyId !== null)?.currencyId ?? project?.currencyId ?? null;
    const contractCode = rows.find((r) => r.currencyId === contractCurrencyId)?.currencyCode
      ?? project?.currencyCode ?? null;
    const agreed = rows
      .filter((r) => (r.currencyId ?? project?.currencyId ?? null) === contractCurrencyId)
      .reduce((sum, r) => sum + zero(r.agreedAmount), 0);

    /**
     * ⚠️ جمعِ پرداختی در ارزِ **قرارداد** حساب می‌شود، نه جمعِ خامِ مبالغ:
     * یک پرداختِ دلاری روی قراردادِ یورویی، جمع‌شدنِ خام را بی‌معنا می‌کرد
     * (پورتِ `total_member_payout($target_currency)`). نبودِ نرخ → مبلغِ خام
     * می‌ماند تا ردیف ناپدید نشود.
     */
    const payoutLines = memberPayments
      .filter((p) => p.projectId === projectId)
      .map((p) => lineOf(p, source, contractCurrencyId));
    const paid = payoutLines.reduce((sum, l) => sum + zero(l.counted ?? l.amount), 0);

    const myUnits = units.filter((u) => u.projectId === projectId);
    const unitPaid = myUnits.filter((u) => u.status === 'paid').reduce((s, u) => s + zero(u.amount), 0);
    const unitUnpaid = myUnits.filter((u) => u.status !== 'paid').reduce((s, u) => s + zero(u.amount), 0);

    return {
      projectId,
      title: project?.title ?? `#${projectId}`,
      currencyCode: contractCode,
      agreed: agreed.toFixed(2),
      paid: paid.toFixed(2),
      remaining: Math.max(0, agreed - paid).toFixed(2),
      status: paymentStatus(String(paid), String(agreed)),
      isUnitBased: project?.isUnitBased ?? false,
      unitPaid: unitPaid.toFixed(2),
      unitUnpaid: unitUnpaid.toFixed(2),
      units: myUnits.map((u) => ({
        id: u.id,
        entryDate: u.entryDate,
        quantity: Number(u.quantity),
        amount: u.amount,
        isPaid: u.status === 'paid',
      })),
      payouts: payoutLines,
      requests: requests
        .filter((r) => r.projectId === projectId)
        .map((r) => ({
          id: r.id,
          amount: r.amount,
          currencyCode: r.currencyCode,
          status: r.status,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        })),
    };
  });

  /* ---------------- بخشِ کارفرما ---------------- */

  const clientProjects: MyClientProject[] = clientIds.map((projectId) => {
    const project = projectById.get(projectId);
    const rows = clientPayments.filter((p) => p.projectId === projectId);
    const currencyId = project?.currencyId ?? null;
    const payments = rows.filter((p) => p.direction === 'incoming').map((p) => lineOf(p, source, currencyId));
    const expenses = rows.filter((p) => p.direction === 'project_expense').map((p) => lineOf(p, source, currencyId));

    // ⚠️ همان قاعده: ارزشِ هر ردیف در ارزِ **پروژه** جمع می‌شود (پورتِ `total_incoming`).
    const paid = payments.reduce((sum, l) => sum + zero(l.counted ?? l.amount), 0);
    const billable = expenses.reduce((sum, l) => sum + zero(l.counted ?? l.amount), 0);
    // R-TEAM-04 — بدهیِ کارفرما = قیمت + هزینه‌های قابلِ صورت‌حساب.
    const summary = summarizeProject(project?.price ?? '0', String(billable), String(paid));

    return {
      projectId,
      title: project?.title ?? `#${projectId}`,
      currencyCode: project?.currencyCode ?? null,
      price: summary.price,
      billableExpenses: billable.toFixed(2),
      totalDue: summary.totalDue.toFixed(2),
      paid: paid.toFixed(2),
      remaining: summary.remaining.toFixed(2),
      status: summary.status,
      payments,
      expenses,
    };
  });

  return {
    isMember,
    isClient,
    memberProjects,
    clientProjects,
    noProjectPayouts: noProjectPayouts.map((p) => lineOf(p, source, null)),
    noProjectIncoming: noProjectIncoming.map((p) => lineOf(p, source, null)),
  };
}

/** آیا این کاربر صفحهٔ «مالیِ من» را دارد؟ — عضو یا کارفرما. */
export function hasPersonalMoney(actor: Actor): boolean {
  return actor.roles.includes('member') || actor.roles.includes('client');
}

/**
 * ماندهٔ باز — کارتِ داشبورد.
 * ⚠️ **به تفکیکِ ارز** جمع می‌شود: جمع‌کردنِ یورو و ریال در یک عدد رقمی
 * می‌ساخت که هیچ معنایی ندارد (همان قاعده‌ای که گزارش‌ها دارند).
 */
export async function myMoneyTotals(actor: Actor) {
  const data = await getMyMoney(actor);
  const group = (rows: Array<{ currencyCode: string | null; remaining: string }>) => {
    const by = new Map<string, number>();
    for (const r of rows) {
      const value = zero(r.remaining);
      if (value <= 0) continue;
      const code = r.currencyCode ?? '';
      by.set(code, (by.get(code) ?? 0) + value);
    }
    return [...by].map(([currencyCode, total]) => ({ currencyCode, total: total.toFixed(2) }));
  };
  return {
    member: group(data.memberProjects.map((p) => ({
      currencyCode: p.currencyCode,
      // پروژهٔ تعدادی مانده‌اش ردیف‌های پرداخت‌نشدهٔ کارکرد است، نه قرارداد.
      remaining: p.isUnitBased ? p.unitUnpaid : p.remaining,
    }))),
    client: group(data.clientProjects),
  };
}

export type MyMoneyTotals = Awaited<ReturnType<typeof myMoneyTotals>>;

export type MyMoney = Awaited<ReturnType<typeof getMyMoney>>;
