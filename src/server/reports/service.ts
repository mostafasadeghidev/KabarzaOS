import { and, desc, eq, gte, inArray, isNull, lte, sql, or, SQL } from 'drizzle-orm';
import { convert } from '@/domain/currency/rates';
import { rateSource, closingDatesQuery, closingRowsQuery } from '@/server/finance/service';
import { db } from '@/db/client';
import {
  absences, accounts, availabilitySlots, currencies, ledger, projectMembers,
  projectClients, projectPayments, projects, timelogs, unitEntries, userRoles, users, offices, userOffices, vendors,
} from '@/db/schema';
import { type Actor } from '@/domain/access/permissions';
import { assertCanView, visibleScopes } from '@/domain/access/guard';
import { overallSummary, sumReportable, isReportableExpense } from '@/domain/reports/summary';
import { currentLocale } from '@/i18n/server';
import { isSettledFormer, perCurrencyLines, rateBanner, sumInBase } from '@/domain/reports/money';
import { rowValueIn } from '@/domain/team-money/payments';
import { monthlyAverage, withBars } from '@/domain/reports/filters';

/**
 * فهرستِ scope برای SQL ِ خام.
 * ⚠️ `= any($1)` با آرایهٔ جاوااسکریپت کار نمی‌کند (drizzle هر عضو را یک پارامترِ
 * جدا می‌کند). مقادیر از خودِ کد می‌آیند و فقط دو حالت دارند، ولی باز هم از
 * فهرستِ سفید عبور می‌کنند تا هیچ‌وقت رشتهٔ دلخواه به SQL نرود.
 */
function scopeList(scopes: Array<'company' | 'private'>) {
  const safe = scopes.filter((s) => s === 'company' || s === 'private');
  return sql.raw(safe.map((s) => `'${s}'`).join(',') || `'company'`);
}

/**
 * فیلترِ دفترِ صفحهٔ گزارش‌ها — پورتِ `office_scope()` ِ افزونه.
 * ⚠️ دو معنا (R ِ افزونه): ارقامِ کارفرما/پروژه با دفترِ **پروژه**، ارقامِ
 * اعضا با دفترِ **عضو** (همهٔ پروژه‌هایش). خالی یعنی همهٔ دفاتر.
 */
export interface ReportFilters { officeIds?: readonly number[] }
export interface HoursQuery extends ReportFilters { from?: string; to?: string }

/** پورتِ `Projects::ids_for_offices` — null یعنی بی‌فیلتر. */
async function officeProjectIds(officeIds?: readonly number[]): Promise<number[] | null> {
  if (!officeIds || officeIds.length === 0) return null;
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(inArray(projects.officeId, [...officeIds]));
  return rows.map((r) => r.id);
}

/** پورتِ `People::members_in_offices` — عضوِ هر یک از دفترهای انتخابی. */
async function officeMemberIds(officeIds?: readonly number[]): Promise<number[] | null> {
  if (!officeIds || officeIds.length === 0) return null;
  const rows = await db.selectDistinct({ userId: userOffices.userId }).from(userOffices)
    .where(inArray(userOffices.officeId, [...officeIds]));
  return rows.map((r) => r.userId);
}

/** «شناسه در فهرست» — بی‌فیلتر همیشه درست، فهرستِ خالی هیچ (drizzle با آرایهٔ خالی خطا می‌دهد). */
function idIn(column: Parameters<typeof inArray>[0], ids: number[] | null): SQL {
  if (ids === null) return sql`true`;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids) as SQL;
}

/** همان برای SQL ِ خام (`p` = projects). */
function projectInRaw(pids: number[] | null): SQL {
  if (pids === null) return sql``;
  if (pids.length === 0) return sql` and false`;
  return sql` and p.id in (${sql.raw(pids.map((n) => String(Math.trunc(n))).join(','))})`;
}

/** دفترهای فعال برای فیلترِ صفحه. */
export async function filterOffices() {
  return db.select({ id: offices.id, name: offices.name }).from(offices)
    .where(eq(offices.isActive, true)).orderBy(offices.name);
}

/**
 * گزارش‌ها.
 *
 * ⚠️ همهٔ جمع‌ها از ستون‌های **منجمدِ** `amount_eur` خوانده می‌شوند، نه با
 * تبدیلِ دوبارهٔ نرخ (R-FISCAL-08): گزارشِ پارسال نباید با نرخِ امروز عوض شود.
 */

/**
 * تبدیلِ مبلغِ ثبت‌شده به ارزِ پایه — با همان نرخ‌های تنظیمات (`rateSource`).
 *
 * ⚠️ قیمتِ پروژه و مبلغِ توافقیِ عضو ستونِ منجمدِ `amount_eur` ندارند (فقط
 * پرداخت‌ها دارند)، پس مثلِ نسخهٔ قبلی با نرخِ جاری تبدیل می‌شوند. پیش از این
 * خام جمع زده می‌شدند: ۵۰ میلیون تومان کنارِ یورو.
 *
 * ⚠️ نبودِ نرخ **بی‌صدا ۱ نمی‌شود** (R-MONEY-06): آن ردیف صفر شمرده و در
 * `rateMissing` گزارش می‌شود تا صفحه بگوید چند ردیف بیرون مانده.
 */
async function baseConverter() {
  const { source, baseCurrencyId } = await rateSource();
  let missing = 0;
  return {
    toBase(amount: string | null, currencyId: number | null): number {
      const v = Number(amount ?? 0);
      if (!Number.isFinite(v) || v === 0) return 0;
      if (currencyId === null || currencyId === baseCurrencyId) return v;
      const converted = convert(source, String(v), currencyId, baseCurrencyId);
      if (converted === null) { missing += 1; return 0; }
      return Number(converted);
    },
    get missing() { return missing; },
  };
}

export async function getOverall(actor: Actor, filters: ReportFilters = {}) {
  assertCanView(actor, 'reports');
  const scopes = visibleScopes(actor);
  // فیلترِ دفتر: پروژه‌محور برای ارزش/پرداخت‌ها/ساعت، عضومحور برای سمتِ اعضا (memberRows).
  const pids = await officeProjectIds(filters.officeIds);

  const fx = await baseConverter();
  const [values, payments, minutes] = await Promise.all([
    // ارزشِ پروژه‌ها — از ستونِ منجمدِ پرداخت‌ها نمی‌آید، پس ردیف‌به‌ردیف تبدیل می‌شود.
    db.select({ price: projects.price, currencyId: projects.currencyId })
      .from(projects)
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes), idIn(projects.id, pids))),

    db.select({
      direction: projectPayments.direction,
      total: sql<string>`coalesce(sum(${projectPayments.amountEur}), 0)::text`,
    })
      .from(projectPayments)
      .innerJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(and(inArray(projects.scope, scopes), idIn(projects.id, pids)))
      .groupBy(projectPayments.direction),

    // ساعتِ عمومی (بی‌پروژه) هم شمرده می‌شود — مثلِ افزونه؛ با فیلترِ دفتر فقط ساعتِ پروژه‌های همان دفتر.
    db.select({ total: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .leftJoin(projects, eq(projects.id, timelogs.projectId))
      .where(pids === null
        ? or(isNull(timelogs.projectId), inArray(projects.scope, scopes))
        : and(inArray(projects.scope, scopes), idIn(projects.id, pids))),
  ]);

  const by = new Map(payments.map((p) => [p.direction, p.total]));

  const totalValue = values.reduce((sum, r) => sum + fx.toBase(r.price, r.currencyId), 0);
  // پورتِ `overall()`: سمتِ اعضا از `member_rows` می‌آید — بدهیِ کف‌بندی‌شده به‌ازای هر ارز.
  const members = await memberRows(actor, filters);
  const summary = overallSummary({
    totalValue: totalValue.toFixed(2),
    billableExpenses: by.get('project_expense') ?? '0',
    clientPaid: by.get('incoming') ?? '0',
    memberAgreed: members.totals.agreed.toFixed(2),
    memberPaid: members.totals.paid.toFixed(2),
    projectCount: values.length,
    minutes: minutes[0]?.total ?? 0,
  });

  return {
    ...summary,
    memberDebt: members.totals.debt.toFixed(2),
    /** سودِ ناخالصِ تخمینی = ارزشِ پروژه‌ها − تعهد به اعضا (پورتِ کارتِ «سود تخمینی»). */
    profit: (totalValue - members.totals.agreed).toFixed(2),
    /** نرخ‌های پایه، کهنه و غایب — پورتِ `rate_banner_html`. */
    rates: await rateBannerData(),
    /** ردیف‌هایی که نرخِ تبدیل نداشتند و صفر شمرده شدند. */
    rateMissing: fx.missing + members.missing,
  };
}

/**
 * مبدلِ ارزِ پایه با شمارشِ نرخ‌های غایب — برای ردیف‌های چندارزی.
 * ⚠️ نبودِ نرخ صفر شمرده و شمرده می‌شود (R-MONEY-06)، هرگز ۱:۱.
 */
async function baseFx() {
  const { source, baseCurrencyId } = await rateSource();
  let missing = 0;
  const toBase = (amount: number, currencyId: number): number => {
    if (amount === 0 || currencyId === baseCurrencyId) return amount;
    const c = convert(source, String(amount), currencyId, baseCurrencyId);
    if (c === null) { missing += 1; return 0; }
    return Number(c);
  };
  return { source, baseCurrencyId, toBase, get missing() { return missing; } };
}

/**
 * ردیف‌های اعضا — پورتِ `Reports::member_rows` + `without_settled_former`:
 * همهٔ دارندگانِ نقشِ **عضو** (حتی بی‌ردیف)، توافقی/پرداختی به‌ازای هر ارز
 * (پرداختی در ارزِ تسویه)، بدهیِ کف‌بندی‌شدهٔ خطی، جمعِ یورو از خط‌ها، شمارِ
 * پروژه، ساعت (عمومی هم)، نشانِ «سابق»؛ سابقِ تسویه‌شده فقط از **نمایش** می‌رود.
 */
async function memberRows(actor: Actor, filters: ReportFilters = {}) {
  const scopes = visibleScopes(actor);
  const fx = await baseFx();
  // عضومحور: عضوِ دفترهای انتخابی با **همهٔ** پروژه‌هایش (پورتِ `members_in_offices`).
  const mids = await officeMemberIds(filters.officeIds);
  const [people, agreedRows, paidRows, minuteRows, countRows, codeRows] = await Promise.all([
    db.selectDistinct({ id: users.id, name: users.name, memberState: users.memberState })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'member'), isNull(users.deletedAt), idIn(users.id, mids)))
      .orderBy(users.name),
    // ارزِ توافقی: ارزِ ردیفِ عضویت، وگرنه ارزِ پروژه، وگرنه پایه (گروه‌بندی روی ستون‌های خام؛ coalesce در JS).
    db.select({
      userId: projectMembers.userId, rowCid: projectMembers.currencyId, projectCid: projects.currencyId,
      total: sql<string>`sum(${projectMembers.agreedAmount})::text`,
    })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes)))
      .groupBy(projectMembers.userId, projectMembers.currencyId, projects.currencyId),
    // پرداختی در ارزِ **تسویه** (وگرنه ارزِ ردیف) — مثلِ افزونه.
    db.select({
      userId: projectPayments.userId, rowCid: projectPayments.settledCurrencyId, projectCid: projectPayments.currencyId,
      total: sql<string>`sum(coalesce(${projectPayments.amountSettled}, ${projectPayments.amount}))::text`,
    })
      .from(projectPayments)
      .innerJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(and(eq(projectPayments.direction, 'member_payout'), inArray(projects.scope, scopes)))
      .groupBy(projectPayments.userId, projectPayments.settledCurrencyId, projectPayments.currencyId),
    // ساعتِ عمومی (بی‌پروژه) هم شمرده می‌شود — مثلِ افزونه.
    db.select({ userId: timelogs.userId, minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .leftJoin(projects, eq(projects.id, timelogs.projectId))
      .where(or(isNull(timelogs.projectId), inArray(projects.scope, scopes)))
      .groupBy(timelogs.userId),
    db.select({ userId: projectMembers.userId, n: sql<number>`count(distinct ${projectMembers.projectId})::int` })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes)))
      .groupBy(projectMembers.userId),
    db.select({ id: currencies.id, code: currencies.code }).from(currencies),
  ]);

  const code = new Map(codeRows.map((c) => [c.id, c.code]));
  const nest = (rows: Array<{ userId: number | null; rowCid: number | null; projectCid: number | null; total: string }>) => {
    const out = new Map<number, Map<number, number>>();
    for (const r of rows) {
      if (r.userId === null) continue;
      const cid = r.rowCid ?? r.projectCid ?? fx.baseCurrencyId;
      const m = out.get(r.userId) ?? new Map<number, number>();
      m.set(cid, (m.get(cid) ?? 0) + Number(r.total));
      out.set(r.userId, m);
    }
    return out;
  };
  const agreedBy = nest(agreedRows);
  const paidBy = nest(paidRows);
  const minutes = new Map(minuteRows.map((r) => [r.userId, r.minutes]));
  const counts = new Map(countRows.map((r) => [r.userId, r.n]));

  const all = people.map((p) => {
    const lines = perCurrencyLines(agreedBy.get(p.id) ?? new Map(), paidBy.get(p.id) ?? new Map());
    const totals = sumInBase(lines, fx.toBase);
    return {
      id: p.id,
      name: p.name,
      isFormer: p.memberState !== 'active',
      projects: counts.get(p.id) ?? 0,
      minutes: minutes.get(p.id) ?? 0,
      agreed: totals.agreed.toFixed(2),
      paid: totals.paid.toFixed(2),
      remaining: totals.debt.toFixed(2),
      byCurrency: lines.map((l) => ({
        currencyId: l.currencyId, code: code.get(l.currencyId) ?? '',
        agreed: l.agreed.toFixed(2), paid: l.paid.toFixed(2), debt: l.debt.toFixed(2),
      })),
      lines,
      totals,
    };
  });

  // جمع‌های کلی همهٔ اعضا را نگه می‌دارند؛ فقط نمایشِ سابقِ تسویه‌شده می‌افتد.
  const totals = all.reduce(
    (acc, r) => ({ agreed: acc.agreed + r.totals.agreed, paid: acc.paid + r.totals.paid, debt: acc.debt + r.totals.debt }),
    { agreed: 0, paid: 0, debt: 0 },
  );
  const rows = all.filter((r) => !isSettledFormer(r)).map(({ lines: _lines, totals: _t, ...r }) => r);
  return { rows, totals, missing: fx.missing };
}

/** گزارشِ اعضا — توافقی، پرداختی، بدهی (به‌ازای هر ارز و یورو)، ساعتِ کاری. */
export async function getMembersReport(actor: Actor, filters: ReportFilters = {}) {
  assertCanView(actor, 'reports');
  return (await memberRows(actor, filters)).rows;
}

/** داده‌های نوارِ نرخ‌ها — پورتِ `rate_banner_html`. */
async function rateBannerData() {
  const { source, baseCurrencyId } = await rateSource();
  const rows = await db.select({ id: currencies.id, code: currencies.code, isActive: currencies.isActive }).from(currencies);
  return rateBanner({
    baseId: baseCurrencyId,
    baseCode: rows.find((c) => c.id === baseCurrencyId)?.code ?? 'EUR',
    currencies: rows,
    find: (from, to) => source.find(from, to),
    today: new Date().toISOString().slice(0, 10),
  });
}

/** مطالباتِ کارفرما — به‌ازای هر پروژه. */
/**
 * مطالبات به تفکیکِ **کارفرما** — نه به تفکیکِ پروژه.
 *
 * ⚠️ واحدِ این گزارش شخص است، چون سؤالش «از چه کسی چقدر طلب داریم؟» است.
 * ریزِ پروژه‌به‌پروژه در صفحهٔ خودِ کارفرما می‌آید (`getClientDetail`).
 *
 * ⚠️ پروژهٔ **چندکارفرمایی** فقط به کارفرمای **اصلی** (قدیمی‌ترین انتساب)
 * صورتحساب می‌شود؛ بقیه صفر — پورتِ `class-reports.php:571-593`. کامنتِ قبلیِ
 * همین‌جا عکسش را ادعا می‌کرد و مطالبات را برای هر کارفرما دوباره می‌شمرد.
 */
export async function getClientsReport(actor: Actor, filters: ReportFilters = {}) {
  assertCanView(actor, 'reports');
  return (await clientRows(actor, filters)).rows;
}

/**
 * ردیف‌های کارفرمایان — پورتِ `Reports::client_rows`: همهٔ دارندگانِ نقشِ
 * **کارفرما**؛ به‌ازای هر پروژه فقط کارفرمای اصلی بدهکار است؛ صورتحساب =
 * قیمت + هزینه‌های قابلِ صورتحساب و دریافتی، هر دو در **ارزِ پروژه** (ردیف‌ها با
 * `rowValueIn` به همان ارز می‌روند)؛ طلب به‌ازای هر ارز کف‌بندی و بعد جمعِ یورو.
 */
async function clientRows(actor: Actor, filters: ReportFilters = {}) {
  const scopes = visibleScopes(actor);
  const fx = await baseFx();
  // پروژه‌محور: فقط پروژه‌های دفترهای انتخابی؛ کارفرمای بی‌پروژه در این دامنه نمی‌آید.
  const pids = await officeProjectIds(filters.officeIds);
  const [people, memberships, projectRows, paymentRows, codeRows] = await Promise.all([
    db.selectDistinct({ id: users.id, name: users.name, memberState: users.memberState })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'client'), isNull(users.deletedAt)))
      .orderBy(users.name),
    db.select({ id: projectClients.id, userId: projectClients.userId, projectId: projectClients.projectId })
      .from(projectClients)
      .innerJoin(projects, eq(projects.id, projectClients.projectId))
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes), idIn(projects.id, pids))),
    db.select({ id: projects.id, price: projects.price, currencyId: projects.currencyId })
      .from(projects)
      .where(and(isNull(projects.deletedAt), inArray(projects.scope, scopes), idIn(projects.id, pids))),
    db.select({
      projectId: projectPayments.projectId, direction: projectPayments.direction,
      amount: projectPayments.amount, currencyId: projectPayments.currencyId,
      amountSettled: projectPayments.amountSettled, settledCurrencyId: projectPayments.settledCurrencyId,
    })
      .from(projectPayments)
      .innerJoin(projects, eq(projects.id, projectPayments.projectId))
      .where(and(
        inArray(projectPayments.direction, ['incoming', 'project_expense']),
        isNull(projects.deletedAt),
        inArray(projects.scope, scopes),
        idIn(projects.id, pids),
      )),
    db.select({ id: currencies.id, code: currencies.code }).from(currencies),
  ]);

  const code = new Map(codeRows.map((c) => [c.id, c.code]));
  const projectOf = new Map(projectRows.map((p) => [p.id, p]));
  // کارفرمای اصلی = قدیمی‌ترین انتساب (کمترین شناسهٔ ردیف).
  const primary = new Map<number, number>();
  for (const m of [...memberships].sort((a, b) => a.id - b.id)) {
    if (!primary.has(m.projectId)) primary.set(m.projectId, m.userId);
  }
  // دریافتی و هزینه‌های هر پروژه در ارزِ **همان پروژه**.
  const incomingOf = new Map<number, number>();
  const expenseOf = new Map<number, number>();
  for (const p of paymentRows) {
    const project = projectOf.get(p.projectId!);
    if (!project || !p.currencyId) continue;
    const target = project.currencyId ?? fx.baseCurrencyId;
    const value = rowValueIn(fx.source, {
      amount: p.amount, currencyId: p.currencyId, amountSettled: p.amountSettled, settledCurrencyId: p.settledCurrencyId,
    }, target);
    const n = value === null ? 0 : Number(value);
    const bucket = p.direction === 'incoming' ? incomingOf : expenseOf;
    bucket.set(p.projectId!, (bucket.get(p.projectId!) ?? 0) + n);
  }

  const byUser = new Map<number, number[]>();
  for (const m of memberships) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m.projectId]);

  const rows = people.map((u) => {
    const projectIds = [...new Set(byUser.get(u.id) ?? [])];
    const billedBy = new Map<number, number>();
    const paidBy = new Map<number, number>();
    let priceBase = 0;
    let expensesBase = 0;
    for (const pid of projectIds) {
      if (primary.get(pid) !== u.id) continue; // پروژهٔ مشترک: غیرِاصلی چیزی بدهکار نیست.
      const project = projectOf.get(pid);
      if (!project) continue;
      const cid = project.currencyId ?? fx.baseCurrencyId;
      const price = Number(project.price);
      const expenses = expenseOf.get(pid) ?? 0;
      billedBy.set(cid, (billedBy.get(cid) ?? 0) + price + expenses);
      paidBy.set(cid, (paidBy.get(cid) ?? 0) + (incomingOf.get(pid) ?? 0));
      priceBase += fx.toBase(price, cid);
      expensesBase += fx.toBase(expenses, cid);
    }
    const lines = perCurrencyLines(billedBy, paidBy);
    const totals = sumInBase(lines, fx.toBase);
    return {
      id: u.id,
      name: u.name,
      isFormer: u.memberState !== 'active',
      projectCount: projectIds.length,
      price: priceBase.toFixed(2),
      expenses: expensesBase.toFixed(2),
      billed: totals.agreed.toFixed(2),
      paid: totals.paid.toFixed(2),
      due: totals.debt.toFixed(2),
      byCurrency: lines.map((l) => ({
        currencyId: l.currencyId, code: code.get(l.currencyId) ?? '',
        billed: l.agreed.toFixed(2), paid: l.paid.toFixed(2), due: l.debt.toFixed(2),
      })),
    };
  }).filter((r) => r.projectCount > 0);

  return { rows, missing: fx.missing };
}

/**
 * هزینه‌ها از دفترکل.
 * ⚠️ R-LEDGER-06 — ردیف‌های انتقالِ داخلی کنار گذاشته می‌شوند.
 */
export async function getExpensesReport(
  actor: Actor,
  range: { from: string; to: string } = { from: '', to: '' },
) {
  assertCanView(actor, 'reports');

  const conds: SQL[] = [
    inArray(accounts.scope, visibleScopes(actor)),
    /**
     * ⚠️ پرداخت به عضو هزینهٔ عملیاتی نیست — جای آن تبِ «بدهی به اعضا» است.
     * ردیفِ دفترِ پرداخت در `project_payments` آینه دارد؛ همان‌جا شناخته
     * می‌شود. بدونِ این، حقوق دو بار شمرده می‌شد (`class-reports.php:795-800`).
     */
    sql`not exists (select 1 from project_payments pp
      where pp.ledger_id = ${ledger.id} and pp.direction = 'member_payout')`,
  ];
  // پورتِ افزونه: بازه روی تاریخِ سند؛ هر سر می‌تواند باز باشد.
  if (range.from) conds.push(gte(ledger.entryDate, range.from));
  if (range.to) conds.push(lte(ledger.entryDate, range.to));

  const rows = await db
    .select({
      id: ledger.id,
      direction: ledger.direction,
      transferGroup: ledger.transferGroup,
      amountEur: ledger.amountEur,
      entryDate: ledger.entryDate,
      description: ledger.description,
      accountName: accounts.name,
      vendorId: ledger.vendorId,
      vendorName: vendors.name,
    })
    .from(ledger)
    .leftJoin(accounts, eq(accounts.id, ledger.accountId))
    .leftJoin(vendors, eq(vendors.id, ledger.vendorId))
    .where(and(...conds))
    .orderBy(ledger.entryDate);

  // پورتِ `expenses_summary`: هزینهٔ واقعی = برداشتِ غیرِانتقال (پرداختِ عضو بالا حذف شد).
  const expenseRows = rows.filter((r) => isReportableExpense(r));
  const total = expenseRows.reduce((sum, r) => sum + Number(r.amountEur), 0);

  const monthMap = new Map<string, number>();
  const vendorMap = new Map<number, { id: number; label: string; count: number; amount: number }>();
  for (const r of expenseRows) {
    const ym = r.entryDate.slice(0, 7);
    monthMap.set(ym, (monthMap.get(ym) ?? 0) + Number(r.amountEur));
    const vid = r.vendorId ?? 0;
    const v = vendorMap.get(vid) ?? { id: vid, label: vid ? (r.vendorName ?? '') : '', count: 0, amount: 0 };
    v.count += 1;
    v.amount += Number(r.amountEur);
    vendorMap.set(vid, v);
  }
  // ماه‌ها نزولی با نوارِ روند نسبت به پرترین ماه؛ طرف‌حساب‌ها پرمبلغ‌اول.
  const byMonth = withBars([...monthMap].map(([ym, amount]) => ({ ym, amount }))
    .sort((a, b) => b.ym.localeCompare(a.ym)));
  const byVendor = [...vendorMap.values()].sort((a, b) => b.amount - a.amount);

  return {
    range,
    total: total.toFixed(2),
    count: expenseRows.length,
    months: byMonth.length,
    avg: monthlyAverage(total, byMonth.length).toFixed(2),
    byVendor: byVendor.map((v) => ({ ...v, amount: v.amount.toFixed(2) })),
    byMonth: byMonth.map((m) => ({ ym: m.ym, amount: m.amount.toFixed(2), pct: m.pct })),
    totalIn: sumReportable(rows, 'in'),
    totalOut: sumReportable(rows, 'out'),
    // فقط ردیف‌های گزارش‌پذیر به UI می‌روند تا جدول با جمع نخواند.
    rows: rows.filter((r) => !r.transferGroup).map((r) => ({
      id: r.id, entryDate: r.entryDate, description: r.description, direction: r.direction,
      amountEur: r.amountEur, accountName: r.accountName, vendorId: r.vendorId ?? 0,
    })),
  };
}

/** نقدینگی — ماندهٔ هر حساب. */
export async function getAccountsReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const fx = await baseFx();
  const rows = await db.execute(sql`
    select
      a.id, a.name, a.currency_id, c.code as currency_code, a.opening_balance::text as opening,
      coalesce(sum(case when l.direction = 'in'  then l.amount_account else 0 end), 0)::text as total_in,
      coalesce(sum(case when l.direction = 'out' then l.amount_account else 0 end), 0)::text as total_out
    from accounts a
    left join currencies c on c.id = a.currency_id
    left join ledger l on l.account_id = a.id
    where a.is_active and a.scope in (${scopeList(visibleScopes(actor))})
    group by a.id, a.name, a.currency_id, c.code, a.opening_balance
    order by a.sort_order, a.name
  `);

  return (rows as unknown as Array<{
    id: number | string; name: string; currency_id: number | string | null; currency_code: string | null;
    opening: string; total_in: string; total_out: string;
  }>).map((r) => {
    const balance = Number(r.opening) + Number(r.total_in) - Number(r.total_out);
    // ⚠️ `db.execute` اعداد را رشته برمی‌گرداند ('1' !== 1) — پیش از مقایسه با پایه عددی می‌شوند.
    const currencyId = r.currency_id === null ? null : Number(r.currency_id);
    return {
      id: Number(r.id),
      name: r.name,
      currencyCode: r.currency_code,
      opening: r.opening,
      totalIn: r.total_in,
      totalOut: r.total_out,
      balance: balance.toFixed(2),
      // معادلِ یورو — پورتِ ستونِ `Currencies::convert` و پایهٔ «نقدینگیِ کل»؛ بی‌نرخ = null.
      balanceEur: currencyId === null ? null
        : (currencyId === fx.baseCurrencyId ? balance.toFixed(2)
          : (() => { const before = fx.missing; const v = fx.toBase(balance, currencyId); return fx.missing > before ? null : v.toFixed(2); })()),
    };
  });
}

/** ساعتِ کاری به تفکیکِ پروژه. */
export async function getHoursReport(actor: Actor, input: HoursQuery = {}) {
  assertCanView(actor, 'reports');
  const pids = await officeProjectIds(input.officeIds);
  const window: SQL[] = [];
  if (input.from) window.push(gte(timelogs.logDate, input.from));
  if (input.to) window.push(lte(timelogs.logDate, input.to));
  const minutes = sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`;

  const [proj, gen] = await Promise.all([
    db.select({ userId: timelogs.userId, name: users.name, minutes })
      .from(timelogs)
      .innerJoin(projects, eq(projects.id, timelogs.projectId))
      .innerJoin(users, eq(users.id, timelogs.userId))
      .where(and(inArray(projects.scope, visibleScopes(actor)), idIn(projects.id, pids), ...window))
      .groupBy(timelogs.userId, users.name),
    // ساعتِ عمومی (بی‌پروژه) دفتر ندارد — مثلِ افزونه بی‌فیلترِ دفتر.
    db.select({ userId: timelogs.userId, name: users.name, minutes })
      .from(timelogs)
      .innerJoin(users, eq(users.id, timelogs.userId))
      .where(and(isNull(timelogs.projectId), ...window))
      .groupBy(timelogs.userId, users.name),
  ]);

  const byUser = new Map<number, { userId: number; name: string; project: number; general: number }>();
  for (const r of proj) byUser.set(r.userId, { userId: r.userId, name: r.name, project: r.minutes, general: 0 });
  for (const r of gen) {
    const row = byUser.get(r.userId) ?? { userId: r.userId, name: r.name, project: 0, general: 0 };
    row.general = r.minutes;
    byUser.set(r.userId, row);
  }
  return [...byUser.values()]
    .map((r) => ({ ...r, total: r.project + r.general }))
    .sort((a, b) => b.total - a.total);
}

export { currencies, users, isNull };

/**
 * گزارشِ پروژه‌ها — قیمت، دریافتی، مطالبات، هزینهٔ اعضا و سود.
 *
 * ⚠️ «سود» = قیمت + هزینهٔ قابلِ‌صورتحساب − دریافتیِ اعضا − هزینه‌ها. هزینهٔ
 * **جذب‌شده** (`project_cost`) از سود کم می‌شود ولی به مطالبات اضافه نمی‌شود؛
 * تفاوتشان دقیقاً همان چیزی است که جهتِ چهارم برایش وجود دارد.
 */
export async function getProjectsReport(actor: Actor, filters: ReportFilters = {}) {
  assertCanView(actor, 'reports');
  const scopes = scopeList(visibleScopes(actor));
  const pids = await officeProjectIds(filters.officeIds);
  const locale = await currentLocale();

  const fx = await baseConverter();
  const rows = await db.execute(sql`
    select
      p.id, p.title, p.price::text as price, p.currency_id,
      /* ⚠️ نامِ تگ باید به زبانِ بیننده بیاید — مثلِ tagName()؛ اینجا SQL
         خام است، پس همان coalesce دستی نوشته می‌شود (انگلیسی پلِ میانی). */
      coalesce(
        nullif(t.name_i18n->>${locale}, ''),
        nullif(t.name_i18n->>'en', ''),
        t.name
      ) as status_name, t.color as status_color,
      coalesce(pay.incoming, 0)::text        as client_paid,
      coalesce(pay.billable, 0)::text        as billable_expenses,
      coalesce(pay.absorbed, 0)::text        as absorbed_costs,
      coalesce(pay.member_paid, 0)::text     as member_paid,
      coalesce(mins.total, 0)::int           as minutes
    from projects p
    left join tags t on t.id = p.status_tag_id
    left join (
      select project_id,
        sum(amount_eur) filter (where direction = 'incoming')        as incoming,
        sum(amount_eur) filter (where direction = 'project_expense') as billable,
        sum(amount_eur) filter (where direction = 'project_cost')    as absorbed,
        sum(amount_eur) filter (where direction = 'member_payout')   as member_paid
      from project_payments group by project_id
    ) pay on pay.project_id = p.id
    left join (
      select project_id, sum(minutes) as total from timelogs group by project_id
    ) mins on mins.project_id = p.id
    where p.deleted_at is null and p.scope in (${scopes})${projectInRaw(pids)}
    order by p.title
  `);

  return (rows as unknown as Array<{
    id: number; title: string; price: string;
    status_name: string | null; status_color: string | null;
    client_paid: string; billable_expenses: string; absorbed_costs: string;
    member_paid: string; minutes: number;
  }>).map((raw) => {
    // قیمت به ارزِ پایه — بقیهٔ ارقام از ستونِ منجمد می‌آیند و از قبل پایه‌اند.
    const r = { ...raw, price: fx.toBase(raw.price, (raw as unknown as { currency_id: number | null }).currency_id).toFixed(2) };
    const billed = Number(r.price) + Number(r.billable_expenses);
    const profit = billed - Number(r.member_paid) - Number(r.billable_expenses)
      - Number(r.absorbed_costs);

    return {
      // ⚠️ `db.execute` اعداد را رشته می‌دهد — شناسه و دقیقه عددی می‌شوند.
      id: Number(r.id),
      title: r.title,
      statusName: r.status_name,
      statusColor: r.status_color,
      price: r.price,
      clientPaid: r.client_paid,
      clientDue: Math.max(0, billed - Number(r.client_paid)).toFixed(2),
      memberPaid: r.member_paid,
      profit: profit.toFixed(2),
      minutes: Number(r.minutes),
    };
  });
}

/**
 * کارکردِ تعدادی به تفکیکِ عضو — پرداخت‌شده و پرداخت‌نشده.
 * ⚠️ عضوی که هیچ ردیفِ تعدادی ندارد اصلاً نمی‌آید؛ جدولی پر از صفر خوانا نیست.
 */
export async function getUnitsReport(actor: Actor) {
  assertCanView(actor, 'reports');

  // ⚠️ ردیف‌ها ارزِ خودشان را دارند؛ جمعِ خامِ چندارزی معنا ندارد — ردیف‌به‌ردیف تبدیل می‌شود.
  const fx = await baseConverter();
  const rows = await db
    .select({
      userId: unitEntries.userId,
      name: users.name,
      amount: unitEntries.amount,
      currencyId: unitEntries.currencyId,
      status: unitEntries.status,
    })
    .from(unitEntries)
    // ⚠️ leftJoin: ردیفِ کاربرِ حذف‌شده از جمع نمی‌افتد؛ نامش «#id» می‌شود (پورتِ افزونه).
    .leftJoin(users, eq(users.id, unitEntries.userId));

  const byUser = new Map<number, { userId: number; name: string; paid: number; unpaid: number }>();
  for (const r of rows) {
    const acc = byUser.get(r.userId) ?? { userId: r.userId, name: r.name ?? `#${r.userId}`, paid: 0, unpaid: 0 };
    const v = fx.toBase(r.amount, r.currencyId);
    if (r.status === 'paid') acc.paid += v; else acc.unpaid += v;
    byUser.set(r.userId, acc);
  }
  // پورتِ افزونه: بزرگ‌ترین جمع اول.
  return [...byUser.values()].sort((a, b) => (b.paid + b.unpaid) - (a.paid + a.unpaid)).map((r) => ({
    userId: r.userId,
    name: r.name,
    paid: r.paid.toFixed(2),
    unpaid: r.unpaid.toFixed(2),
    total: (r.paid + r.unpaid).toFixed(2),
  }));
}

/**
 * حضور و مرخصی — مرخصی‌های ثبت‌شده و اعضایی که **برنامهٔ هفتگی نداده‌اند**.
 *
 * ⚠️ فهرستِ دومی مهم‌تر از اولی است: مرخصی را همه ثبت می‌کنند، ولی نداشتنِ
 * برنامه بی‌سروصدا می‌ماند و همان است که «کِی در دسترس است؟» را بی‌جواب
 * می‌گذارد.
 */
export async function getAttendanceReport(actor: Actor) {
  assertCanView(actor, 'reports');

  const today = new Date().toISOString().slice(0, 10);
  const [leaves, scheduled, members] = await Promise.all([
    // پورتِ افزونه: فقط دارندگانِ نقشِ عضو و فقط بازه‌های امروز به بعد، صعودی.
    db.selectDistinct({
      userId: absences.userId,
      name: users.name,
      fromDate: absences.fromDate,
      toDate: absences.toDate,
      note: absences.note,
    })
      .from(absences)
      .innerJoin(users, eq(users.id, absences.userId))
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'member')))
      .where(gte(absences.toDate, today))
      .orderBy(absences.fromDate),
    db.selectDistinct({ userId: availabilitySlots.userId }).from(availabilitySlots),
    db.selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(
        eq(userRoles.role, 'member'),
        eq(users.memberState, 'active'),
        isNull(users.deletedAt),
      ))
      .orderBy(users.name),
  ]);

  const hasSchedule = new Set(scheduled.map((s) => s.userId));
  return {
    leaves,
    withoutSchedule: members.filter((m) => !hasSchedule.has(m.id)),
  };
}

/**
 * ریزِ کارِ یک عضو — پروژه‌به‌پروژه با مبلغِ توافقی، پرداختی و ردیف‌های پرداخت.
 *
 * ⚠️ هر ردیف در ارزِ **خودِ پروژه** است، ولی جمع‌ها در ارزِ پایه — چون جمعِ
 * دو ارزِ متفاوت بی‌معناست. همان کاری که نسخهٔ قبلی با
 * پیش از جمع می‌کند.
 */
export async function getMemberDetail(actor: Actor, userId: number) {
  assertCanView(actor, 'reports');

  const [person] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!person) return null;

  /**
   * ⚠️ ردیف‌های عضویت **پیش از** پیوستن جمع می‌شوند، نه با `sum(distinct)`:
   * یک نفر می‌تواند در یک پروژه چند نقش داشته باشد، و اگر مبلغِ دو نقش
   * اتفاقاً برابر باشد `distinct` یکی‌شان را می‌بلعد و توافقی کمتر از
   * واقعیت گزارش می‌شود.
   */
  const rows = await db.execute(sql`
    select
      p.id as project_id, p.title, p.currency_id,
      c.code as currency_code,
      coalesce(mem.agreed, 0)::text     as agreed,
      coalesce(paid.total, 0)::text     as paid,
      coalesce(paid.total_eur, 0)::text as paid_eur,
      coalesce(mins.total, 0)::int      as minutes
    from (
      select project_id, sum(agreed_amount) as agreed
      from project_members
      where user_id = ${userId}
      group by project_id
    ) mem
    join projects p on p.id = mem.project_id
    left join currencies c on c.id = p.currency_id
    left join (
      select project_id,
        sum(coalesce(amount_settled, amount)) as total,
        sum(amount_eur) as total_eur
      from project_payments
      where direction = 'member_payout' and user_id = ${userId}
      group by project_id
    ) paid on paid.project_id = p.id
    left join (
      select project_id, sum(minutes) as total
      from timelogs where user_id = ${userId}
      group by project_id
    ) mins on mins.project_id = p.id
    where p.deleted_at is null
    order by p.title
  `);

  const projectRows = (rows as unknown as Array<{
    project_id: number; title: string; currency_code: string | null;
    agreed: string; paid: string; paid_eur: string; minutes: number;
  }>).map((r) => {
    const agreed = Number(r.agreed);
    const paid = Number(r.paid);
    return {
      projectId: r.project_id,
      title: r.title,
      currencyCode: r.currency_code,
      agreed: r.agreed,
      paid: r.paid,
      remaining: Math.max(0, agreed - paid).toFixed(2),
      // ⚠️ همان سه‌حالتی نسخهٔ قبلی؛ «تسویه» یعنی پرداختی به توافقی رسیده.
      status: paid <= 0 ? 'unpaid' : (agreed > 0 && paid + 0.001 >= agreed ? 'paid' : 'partial'),
      minutes: r.minutes,
    };
  });

  const lines = await db
    .select({
      projectId: projectPayments.projectId,
      amount: projectPayments.amount,
      amountSettled: projectPayments.amountSettled,
      paidAt: projectPayments.paidAt,
      note: projectPayments.note,
    })
    .from(projectPayments)
    .where(and(
      eq(projectPayments.userId, userId),
      eq(projectPayments.direction, 'member_payout'),
    ))
    .orderBy(projectPayments.paidAt);

  return { person, projects: projectRows, lines };
}

/** ریزِ مطالباتِ یک کارفرما — پروژه‌به‌پروژه با دریافتی و مانده. */
export async function getClientDetail(actor: Actor, userId: number) {
  assertCanView(actor, 'reports');

  const [person] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!person) return null;

  const fx = await baseConverter();
  const rows = await db.execute(sql`
    select
      p.id as project_id, p.title, p.price::text as price, p.currency_id,
      (pc.id = (select min(pc2.id) from project_clients pc2 where pc2.project_id = p.id)) as is_primary,
      coalesce(pay.incoming, 0)::text as paid,
      coalesce(pay.billable, 0)::text as expenses
    from project_clients pc
    join projects p on p.id = pc.project_id
    left join (
      select project_id,
        sum(amount_eur) filter (where direction = 'incoming')        as incoming,
        sum(amount_eur) filter (where direction = 'project_expense') as billable
      from project_payments group by project_id
    ) pay on pay.project_id = p.id
    where pc.user_id = ${userId} and p.deleted_at is null
    order by p.title
  `);

  const projectRows = (rows as unknown as Array<{
    project_id: number; title: string; price: string; currency_id: number | null;
    is_primary: boolean; paid: string; expenses: string;
  }>).map((r) => {
    // پروژهٔ مشترک: فقط کارفرمای اصلی بدهکار است؛ بقیه آن را با صفر می‌بینند.
    const price = r.is_primary ? fx.toBase(r.price, r.currency_id) : 0;
    const expenses = r.is_primary ? Number(r.expenses) : 0;
    const paid = r.is_primary ? Number(r.paid) : 0;
    return {
      projectId: r.project_id,
      title: r.title,
      price: price.toFixed(2),
      expenses: expenses.toFixed(2),
      paid: paid.toFixed(2),
      // R-TEAM-04 — بدهی = قیمت + هزینهٔ قابلِ‌صورتحساب − دریافتی.
      due: Math.max(0, price + expenses - paid).toFixed(2),
      shared: !r.is_primary,
    };
  });

  return { person, projects: projectRows };
}

/**
 * ریزِ ساعتِ کاریِ یک عضو — پورتِ `hours-detail` / `hours-by-project` /
 * `hours-entries` نسخهٔ قبلی.
 *
 * ⚠️ دو نما در یک تابع، مثلِ نسخهٔ قبلی: بدونِ پروژهٔ انتخابی، جمعِ هر پروژه؛ با
 * پروژهٔ انتخابی، ریزِ روزبه‌روز. یک کوئری کمتر و یک مسیرِ کمتر.
 *
 * ⚠️ ساعتِ **عمومی** (پروژهٔ `null`) جدا شمرده می‌شود: کارِ اداری در جمعِ
 * پروژه‌ها گم می‌شد و کسی نمی‌فهمید چرا مجموع با جمعِ ستون نمی‌خواند.
 */
export async function getMemberHours(
  actor: Actor,
  userId: number,
  input: { from?: string | null; to?: string | null; projectId?: number | null } = {},
) {
  assertCanView(actor, 'reports');

  const [member] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId));
  if (!member) return null;

  const window = [eq(timelogs.userId, userId)];
  if (input.from) window.push(gte(timelogs.logDate, input.from));
  if (input.to) window.push(lte(timelogs.logDate, input.to));

  const scoped = inArray(projects.scope, visibleScopes(actor));

  const [byProject, generalRow, entries, projectOptions] = await Promise.all([
    db.select({
      projectId: projects.id,
      title: projects.title,
      minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int`,
    })
      .from(timelogs)
      .innerJoin(projects, eq(projects.id, timelogs.projectId))
      .where(and(...window, scoped))
      .groupBy(projects.id, projects.title)
      .orderBy(desc(sql`sum(${timelogs.minutes})`)),

    db.select({ minutes: sql<number>`coalesce(sum(${timelogs.minutes}), 0)::int` })
      .from(timelogs)
      .where(and(...window, isNull(timelogs.projectId))),

    // ریزِ ردیف‌ها فقط وقتی پروژه‌ای انتخاب شده.
    input.projectId
      ? db.select({
        id: timelogs.id,
        logDate: timelogs.logDate,
        minutes: timelogs.minutes,
        description: timelogs.description,
      })
        .from(timelogs)
        .innerJoin(projects, eq(projects.id, timelogs.projectId))
        .where(and(...window, scoped, eq(timelogs.projectId, input.projectId)))
        .orderBy(desc(timelogs.logDate), desc(timelogs.id))
        // پورتِ افزونه: سقفِ ۵۰۰ ردیف.
        .limit(500)
      : Promise.resolve([]),

    // پورتِ `Timelogs::project_ids_for_user`: گزینه‌های فیلتر از **همهٔ زمان**، نه بازهٔ فعلی —
    // وگرنه عوض‌کردنِ بازه پروژهٔ انتخاب‌شده را از فهرست می‌انداخت.
    db.selectDistinct({ id: projects.id, title: projects.title })
      .from(timelogs)
      .innerJoin(projects, eq(projects.id, timelogs.projectId))
      .where(and(eq(timelogs.userId, userId), scoped))
      .orderBy(projects.title),
  ]);

  const general = generalRow[0]?.minutes ?? 0;
  const projectTotal = byProject.reduce((sum, r) => sum + r.minutes, 0);

  return {
    member,
    byProject,
    entries,
    projectOptions,
    totals: { project: projectTotal, general, all: projectTotal + general },
    selectedProject: input.projectId
      ? byProject.find((p) => p.projectId === input.projectId)?.title ?? null
      : null,
  };
}

/**
 * دوره‌های بستهٔ مالی از صفحهٔ گزارش‌ها — با مجوزِ **گزارش**، نه مالی (پورتِ
 * افزونه: تب و CSV ِ دوره‌ها فقط cap ِ گزارش می‌خواهند؛ ردیفِ ۱۲۱ ِ ممیزی).
 */
export async function reportClosingDates(actor: Actor): Promise<string[]> {
  assertCanView(actor, 'reports');
  return closingDatesQuery();
}

export async function reportClosingRows(actor: Actor, closeDate: string) {
  assertCanView(actor, 'reports');
  return closingRowsQuery(closeDate);
}
