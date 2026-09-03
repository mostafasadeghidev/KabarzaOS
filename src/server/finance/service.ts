import { format as formatMoney } from '@/domain/money/money';
import { buildTimelines, lastActorOf } from '@/domain/ledger/timeline';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, accountUsers, auditLog, currencies, exchangeRates, fiscalClosings, fiscalLocks,
  ledger, offices, projectMembers, projectPayments, projects, tagRelations, tags, users, vendors, userPermissions, userRoles, unitEntries, projectClients,
} from '@/db/schema';
import { canManageSection, canViewSection, type Actor } from '@/domain/access/permissions';
import { assertCanManage, assertCanView, ForbiddenError, visibleScopes } from '@/domain/access/guard';
import { buildTransferLegs, computeAmounts, validateEntry, type TransferInput, MissingRateError } from '@/domain/ledger/amounts';
import {
  assertDeletable, assertWritable, closingBalance, isValidCloseDate, nextLockDate, periodStart,
} from '@/domain/ledger/fiscal';
import { planReceipts } from '@/domain/files/upload';
import { learnedRate, paymentNote, planPaymentMirror } from '@/domain/ledger/mirror';
import { fileSummaries, removeFiles } from '@/server/files/service';
import { convert, type RateSource } from '@/domain/currency/rates';
import { AccountError, assertAccountDeletable, canSeeAccount, visibleAccountIds } from '@/domain/finance/accounts';
import { userIdsWithCaps } from '@/server/people/tag-caps';
import { FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP } from '@/domain/access/project-scope';
import { relocateParty } from '@/domain/ledger/form-rules';
import { eurCell } from '@/domain/ledger/eur-cell';

/**
 * سرویسِ حسابداری.
 *
 * ⚠️ سه گاردِ حیاتی، همه در همین لایه (R-ARCH-01 و درسِ R-LEDGER-11 که در
 * نسخهٔ قبلی بعضی گاردها فقط در صفحه بودند):
 * ۱. مجوزِ بخشِ مالی
 * ۲. قفلِ دورهٔ مالی — پیش از هر نوشتن و حذف
 * ۳. اعتبارسنجیِ ردیف (توضیحاتِ الزامیِ پروژه‌ای)
 */

export class LedgerNotFoundError extends Error {
  constructor() {
    super('ledger_entry_not_found');
    this.name = 'LedgerNotFoundError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'ledger',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/** تاریخِ قفلِ دورهٔ مالی — آخرین قفلِ ثبت‌شده. */
export async function currentLockDate(): Promise<string | null> {
  const rows = await db.select({ lockDate: fiscalLocks.lockDate })
    .from(fiscalLocks).orderBy(desc(fiscalLocks.id)).limit(1);
  return rows[0]?.lockDate ?? null;
}

/**
 * نرخ‌های ارز — یک بار خوانده و به‌صورتِ `RateSource` به دامنه داده می‌شود.
 * ⚠️ جدیدترین نرخِ هر جفت برنده است؛ دامنه به دیتابیس وابسته نیست.
 */
export async function rateSource(): Promise<{ source: RateSource; baseCurrencyId: number }> {
  const [rows, base] = await Promise.all([
    db.select({
      fromCurrencyId: exchangeRates.fromCurrencyId,
      toCurrencyId: exchangeRates.toCurrencyId,
      rate: exchangeRates.rate,
      effectiveDate: exchangeRates.effectiveDate,
    }).from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.id)),
    db.select({ id: currencies.id }).from(currencies).where(eq(currencies.isDefault, true)),
  ]);

  const byPair = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.fromCurrencyId}:${r.toCurrencyId}`;
    if (!byPair.has(key)) byPair.set(key, r);
  }

  return {
    source: { find: (from, to) => byPair.get(`${from}:${to}`) ?? null },
    baseCurrencyId: base[0]?.id ?? 1,
  };
}

/**
 * حساب‌های قابلِ دیدن.
 * ⚠️ R-ACC-02 — علاوه بر scope ِ شرکتی/شخصی، **دامنهٔ حسابدار** هم اعمال می‌شود.
 */
export async function listAccounts(actor: Actor) {
  assertCanView(actor, 'finance');
  const scope = await accountScope(actor);

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      currencyId: accounts.currencyId,
      currencyCode: currencies.code,
      openingBalance: accounts.openingBalance,
      officeId: accounts.officeId,
      officeName: offices.name,
      isActive: accounts.isActive,
      note: accounts.note,
      sortOrder: accounts.sortOrder,
      scope: accounts.scope,
      /**
       * ماندهٔ **فعلی** — پورتِ ستونِ `balance_fmt` ِ فهرستِ حساب‌ها. یک زیرپرس‌وجوی
       * گروهی به‌ازای هر حساب، نه کوئری در حلقه.
       */
      balance: sql<string>`(${accounts.openingBalance} + coalesce((
        select sum(case when l.direction = 'in' then l.amount_account else -l.amount_account end)
        from ledger l where l.account_id = ${accounts.id}), 0))::text`,
    })
    .from(accounts)
    .leftJoin(currencies, eq(currencies.id, accounts.currencyId))
    .leftJoin(offices, eq(offices.id, accounts.officeId))
    .where(inArray(accounts.scope, visibleScopes(actor)))
    .orderBy(accounts.officeId, accounts.sortOrder, accounts.name);

  const allowed = new Set(visibleAccountIds({
    seesAll: scope.seesAll,
    assignedAccountIds: scope.assignedAccountIds,
    allAccountIds: rows.map((r) => r.id),
  }));
  return rows.filter((r) => allowed.has(r.id)).map((r) => ({ ...r, scope: r.scope as 'company' | 'private' }));
}

/**
 * دفترکلِ یک حساب + کارت‌های مانده.
 *
 * ⚠️ R-LEDGER-02 — مانده از `amount_account` جمع می‌شود، نه از `amount`:
 * مبلغِ ورودی ممکن است ارزِ دیگری باشد.
 */
export interface LedgerFilter {
  accountId: number;
  from?: string | null;
  to?: string | null;
  /** دستهٔ هزینه (تگِ `ledger_category`). */
  tagId?: number | null;
  projectId?: number | null;
  /** جستجوی نامِ پرداخت‌کننده/گیرنده. */
  party?: string | null;
  page?: number;
  perPage?: number;
  /**
   * ردیف‌های دورهٔ بسته را هم نشان بده. پیش‌فرض (پورتِ `for_account($since)`):
   * دفتر از فردای قفل شروع می‌شود و ماندهٔ پیش از آن به‌صورتِ «مانده از سال
   * قبل» منتقل می‌شود؛ وگرنه سال‌های بسته تا ابد فهرستِ فعال را پر می‌کردند.
   */
  includeLocked?: boolean;
}

/** گزینه‌های تعدادِ ردیف در صفحه — همان مقادیرِ نسخهٔ قبلی. */
export const LEDGER_PER_PAGE = [25, 50, 100, 200] as const;
const DEFAULT_PER_PAGE = 50;

export async function getLedger(actor: Actor, input: LedgerFilter) {
  assertCanView(actor, 'finance');

  const accountRows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currencyId: accounts.currencyId,
      currencyCode: currencies.code,
      openingBalance: accounts.openingBalance,
      scope: accounts.scope,
    })
    .from(accounts)
    .leftJoin(currencies, eq(currencies.id, accounts.currencyId))
    .where(eq(accounts.id, input.accountId));

  const account = accountRows[0];
  if (!account) throw new LedgerNotFoundError();
  if (!visibleScopes(actor).includes(account.scope as 'company' | 'private')) {
    throw new LedgerNotFoundError();
  }
  // ⚠️ R-ACC-02 — حسابِ خارج از دامنهٔ حسابدار «یافت نشد» است، نه «ممنوع».
  if (!canSeeAccount(input.accountId, await accountScope(actor))) {
    throw new LedgerNotFoundError();
  }

  const payer = users;
  const receiver = alias(users, 'receiver');

  const lockDate = await currentLockDate();
  // نمای دوره: بدونِ بازهٔ صریح و بدونِ «همه»، ردیف‌های ≤ قفل پنهان‌اند.
  const periodScoped = Boolean(lockDate) && !input.includeLocked && !input.from;

  const conditions = [eq(ledger.accountId, input.accountId)];
  if (periodScoped) conditions.push(gt(ledger.entryDate, lockDate!));
  if (input.from) conditions.push(gte(ledger.entryDate, input.from));
  if (input.to) conditions.push(lte(ledger.entryDate, input.to));
  if (input.projectId) conditions.push(eq(ledger.projectId, input.projectId));
  if (input.tagId) {
    /**
     * ⚠️ زیرپرس‌وجو، نه join: تگ رابطهٔ چند‌به‌چند است و join ردیف‌ها را
     * تکرار می‌کرد — جمع‌ها دو برابر می‌شدند.
     */
    conditions.push(sql`exists (
      select 1 from tag_relations tr
      where tr.object_type = 'ledger' and tr.object_id = ${ledger.id}
        and tr.tag_id = ${input.tagId}
    )`);
  }

  /**
   * جستجوی طرف‌حساب روی **نامِ** پرداخت‌کننده/گیرنده و برچسبِ آزادشان است —
   * نه روی شرح. نسخهٔ قبلی هم دقیقاً همین چهار میدان را می‌گردد.
   */
  const party = (input.party ?? '').trim();
  if (party !== '') {
    const needle = `%${party.toLowerCase()}%`;
    conditions.push(sql`(
      lower(coalesce(${payer.name}, '')) like ${needle}
      or lower(coalesce(${receiver.name}, '')) like ${needle}
      or lower(coalesce(${ledger.payerLabel}, '')) like ${needle}
      or lower(coalesce(${ledger.receiverLabel}, '')) like ${needle}
    )`);
  }

  const perPage = LEDGER_PER_PAGE.includes(input.perPage as 25)
    ? (input.perPage as number)
    : DEFAULT_PER_PAGE;
  const page = Math.max(1, Math.trunc(input.page ?? 1) || 1);
  const rows = await db
    .select({
      id: ledger.id,
      entryDate: ledger.entryDate,
      direction: ledger.direction,
      description: ledger.description,
      amount: ledger.amount,
      currencyId: ledger.currencyId,
      amountAccount: ledger.amountAccount,
      amountEur: ledger.amountEur,
      payerLabel: ledger.payerLabel,
      payerName: payer.name,
      receiverLabel: ledger.receiverLabel,
      receiverName: receiver.name,
      projectId: ledger.projectId,
      projectTitle: projects.title,
      receiptIds: ledger.receiptIds,
      /**
       * ⚠️ فیلدهایی که فرمِ ویرایش لازم دارد و پیش از این نمی‌رسیدند — پس
       * ذخیرهٔ بدونِ تغییر، پیوندِ کاربر، تسویه و «قابلِ بازپرداخت» را می‌انداخت.
       */
      payerUserId: ledger.payerUserId,
      receiverUserId: ledger.receiverUserId,
      officeId: ledger.officeId,
      tagIds: sql<number[]>`coalesce((select array_agg(tr.tag_id order by tr.tag_id)
        from tag_relations tr where tr.object_type = 'ledger' and tr.object_id = ${ledger.id}), '{}')`,
      amountSettled: projectPayments.amountSettled,
      settledCurrencyId: projectPayments.settledCurrencyId,
      mirrorDirection: projectPayments.direction,
      transferGroup: ledger.transferGroup,
    })
    .from(ledger)
    .leftJoin(payer, eq(payer.id, ledger.payerUserId))
    .leftJoin(receiver, eq(receiver.id, ledger.receiverUserId))
    .leftJoin(projects, eq(projects.id, ledger.projectId))
    .leftJoin(projectPayments, eq(projectPayments.ledgerId, ledger.id))
    .where(and(...conditions))
    .orderBy(desc(ledger.entryDate), desc(ledger.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  /**
   * تاریخچهٔ که/کِی — پورتِ `edit_log` ِ نسخهٔ قبلی، ولی از همان audit_log ِ
   * مشترک، نه یک ستونِ JSON ِ موازی: همهٔ رویدادهای ثبت/ویرایشِ ردیف‌های این
   * صفحه در **یک** کوئری؛ «توسط» = آخرین رویداد (پیش از این فقط همان یکی
   * خوانده می‌شد و مودالِ جزئیات تاریخچه‌ای نداشت).
   */
  const eventRows = rows.length === 0 ? [] : await db.execute(sql`
    select a.object_id as id, a.action, a.created_at as at, u.name
    from audit_log a
    left join users u on u.id = a.actor_id
    where a.object_type = 'ledger'
      and a.action in ('ledger.create', 'ledger.update', 'ledger.transfer')
      and a.object_id in ${sql.raw(`(${rows.map((r) => r.id).join(',')})`)}
    order by a.object_id, a.id
  `) as unknown as Array<{ id: number | string; action: string; at: Date | string; name: string | null }>;
  const timelines = buildTimelines(eventRows);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledger)
    .leftJoin(payer, eq(payer.id, ledger.payerUserId))
    .leftJoin(receiver, eq(receiver.id, ledger.receiverUserId))
    .where(and(...conditions));
  const total = countRow?.n ?? 0;

  /**
   * مانده‌ها — یک کوئریِ گروهی، نه جمع در حافظه روی صفحهٔ فیلترشده.
   * ⚠️ پورتِ `Accounts::balance($since)`: در نمای دوره، «مانده اولیه» = ماندهٔ
   * منتقل‌شده (اولیه + خالصِ تا قفل) و واریز/برداشت فقط ردیف‌های **بعد از**
   * قفل؛ ماندهٔ نهایی همان رقمِ همیشگی می‌ماند تا دو نما با هم نخوانَد نداشته باشند.
   */
  const totalsQuery = db
    .select({
      direction: ledger.direction,
      total: sql<string>`coalesce(sum(${ledger.amountAccount}), 0)::text`,
    })
    .from(ledger);
  const [totals, carried] = await Promise.all([
    totalsQuery
      .where(periodScoped
        ? and(eq(ledger.accountId, input.accountId), gt(ledger.entryDate, lockDate!))
        : eq(ledger.accountId, input.accountId))
      .groupBy(ledger.direction),
    periodScoped
      ? db.select({
        direction: ledger.direction,
        total: sql<string>`coalesce(sum(${ledger.amountAccount}), 0)::text`,
      })
        .from(ledger)
        .where(and(eq(ledger.accountId, input.accountId), lte(ledger.entryDate, lockDate!)))
        .groupBy(ledger.direction)
      : Promise.resolve([] as Array<{ direction: 'in' | 'out'; total: string }>),
  ]);

  // رسیدهای همهٔ ردیف‌ها با **یک** کوئری خوانده می‌شوند، نه یکی به‌ازای هر
  // ردیف (R-PERF-01).
  const allReceiptIds = [...new Set(rows.flatMap((r) => r.receiptIds ?? []))];
  const summaries = await fileSummaries(allReceiptIds);
  const byId = new Map(summaries.map((f) => [f.id, f]));
  const { source: rates, baseCurrencyId: baseId } = await rateSource();

  const entries = rows.map(({ mirrorDirection, transferGroup, ...r }) => ({
    ...r,
    /** لِگِ انتقال — نشانِ «انتقال» در ستونِ تگ‌ها (پورتِ `is_transfer`). */
    isTransfer: transferGroup !== null,
    /** خانهٔ «معادل یورو» با قاعدهٔ `eur_cell()` — null یعنی «—». */
    eurDisplay: eurCell(rates, {
      amountSettled: r.amountSettled, settledCurrencyId: r.settledCurrencyId,
      amountAccount: r.amountAccount, accountCurrencyId: account.currencyId,
    }, baseId),
    // ⚠️ درایورِ postgres آرایهٔ bigint را رشته برمی‌گرداند؛ فرم عدد می‌خواهد.
    tagIds: (r.tagIds ?? []).map(Number),
    // `project_expense` = قابلِ صورتحساب؛ `project_cost` = جذب‌شده؛ بدونِ آینه = پیش‌فرضِ بله.
    billable: mirrorDirection !== 'project_cost',
    // مبلغِ حساب وقتی با مبلغِ اسمی فرق دارد، یا تبدیل است یا رقمِ دستی — هر دو باید بمانند.
    amountAccountOverride: r.amountAccount !== r.amount ? r.amountAccount : null,
    lastActor: lastActorOf(timelines.get(r.id)),
    timeline: timelines.get(r.id) ?? [],
    receipts: (r.receiptIds ?? [])
      .map((id) => byId.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f)),
  }));

  const totalIn = totals.find((t) => t.direction === 'in')?.total ?? '0';
  const totalOut = totals.find((t) => t.direction === 'out')?.total ?? '0';
  const carriedIn = carried.find((t) => t.direction === 'in')?.total ?? '0';
  const carriedOut = carried.find((t) => t.direction === 'out')?.total ?? '0';
  const opening = (Number(account.openingBalance) + Number(carriedIn) - Number(carriedOut)).toFixed(4);
  const balance = (Number(opening) + Number(totalIn) - Number(totalOut)).toFixed(4);

  /**
   * پروژه‌هایی که در **همین حساب** ردیف دارند — پورتِ `projects_in_account()`:
   * فیلترِ پروژه فقط این‌ها را پیشنهاد می‌کند، نه همهٔ پروژه‌های سامانه.
   */
  const accountProjectRows = await db.selectDistinct({ id: ledger.projectId }).from(ledger)
    .where(and(eq(ledger.accountId, input.accountId), sql`${ledger.projectId} is not null`));
  const accountProjectIds = accountProjectRows.map((r) => r.id).filter((id): id is number => id !== null);

  return {
    account,
    entries,
    accountProjectIds,
    /**
     * ⚠️ جمع‌ها **همیشه** کلِ حساب‌اند (یا کلِ دورهٔ باز)، نه صفحه یا فیلترِ
     * فعال: ماندهٔ حساب یک واقعیتِ حسابداری است و با فیلترِ نمایش عوض نمی‌شود.
     */
    totals: { in: totalIn, out: totalOut, balance, opening, carried: periodScoped },
    paging: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    lockDate,
    periodScoped,
    /** می‌تواند روی همین حساب بنویسد — مدیرِ مالی یا حسابدارِ تخصیص‌یافته. */
    canManage: await canBookOn(actor, input.accountId),
  };
}

export interface EntryInput {
  accountId: number;
  entryDate: string;
  direction: 'in' | 'out';
  amount: string;
  currencyId: number;
  /** مبلغِ واقعاً رسیده به حساب — بر تبدیلِ نرخ مقدم است (R-LEDGER-03). */
  amountAccountOverride?: string | null;
  description: string;
  projectId: number | null;
  /**
   * دسته‌های دفتر — چند‌به‌چند، از راهِ `tag_relations`.
   * ⚠️ پیش از این یک شناسه بود که هیچ‌جا نوشته نمی‌شد: فیلترِ تگ و گزارشِ
   * دسته‌بندیِ هزینه‌ها مرده بودند.
   */
  tagIds: number[];
  officeId: number | null;
  payerUserId: number | null;
  payerLabel: string;
  receiverUserId: number | null;
  receiverLabel: string;
  /**
   * فروشندهٔ ردیف — پورتِ `vendor_id`. معمولاً سرور خودش از گیرندهٔ آزادِ
   * برداشت می‌سازد (`Vendors::find_or_create`)؛ هزینهٔ دوره‌ای صریح می‌فرستد.
   */
  vendorId?: number | null;
  /**
   * رسیدهای تازه‌بارگذاری‌شده (شناسهٔ فایل) و آن‌هایی که تیکِ حذف خورده‌اند.
   * ⚠️ فهرستِ کامل فرستاده **نمی‌شود** — ادغام در سرور انجام می‌گیرد تا فرمِ
   * کهنه رسیدی را که همین حالا کسِ دیگری اضافه کرده نیندازد.
   */
  addedReceiptIds?: number[];
  removedReceiptIds?: number[];

  /**
   * هزینهٔ بیرونی به کارفرما صورتحساب می‌شود؟ پیش‌فرض **بله** (R-LEDGER-14).
   * فقط وقتی معنا دارد که ردیف، خروجیِ یک پروژه به غیرِعضو باشد.
   */
  billable?: boolean;
  /** مبلغِ واقعاً تسویه‌شده — بر مبلغِ اسمی مقدم است (R-TEAM-01). */
  amountSettled?: string | null;
  settledCurrencyId?: number | null;
  /** نرخِ دستیِ کاربر برای این تسویه؛ خالی یعنی از دو مبلغ مشتق شود. */
  fxRate?: string | null;
}

/**
 * آینه‌کردنِ یک ردیفِ دفتر در «پرداخت‌های پروژه» (R-LEDGER-14).
 *
 * ⚠️ بدونِ این، ثبتِ ردیفِ مالی هیچ اثری روی مالیِ پروژه، فاکتورِ کارفرما،
 * تسویهٔ عضو و گزارش‌ها ندارد — همه از `project_payments` می‌خوانند.
 *
 * ⚠️ خودش تراکنش باز نمی‌کند؛ فراخوان تصمیم می‌گیرد. شکستش هم بلعیده
 * **نمی‌شود**: ردیفی که آینه نشود، بی‌صدا از همهٔ گزارش‌ها غیب می‌شود.
 */
async function mirrorPayment(
  ledgerId: number,
  input: EntryInput,
  amounts: { amountEur: string },
): Promise<void> {
  const receiverIsMember = Boolean(
    input.projectId && input.receiverUserId
    && (await db.select({ id: projectMembers.id }).from(projectMembers).where(and(
      eq(projectMembers.projectId, input.projectId),
      eq(projectMembers.userId, input.receiverUserId),
    )).limit(1)).length > 0,
  );

  const plan = planPaymentMirror({
    direction: input.direction,
    projectId: input.projectId,
    payerUserId: input.payerUserId,
    receiverUserId: input.receiverUserId,
    receiverIsMember,
    // ⚠️ نبودنِ فیلد یعنی «بله» — نه «خیر».
    billable: input.billable !== false,
  });
  if (!plan) return;

  const title = plan.projectId
    ? (await db.select({ title: projects.title }).from(projects)
        .where(eq(projects.id, plan.projectId)))[0]?.title ?? null
    : null;

  const settled = input.amountSettled?.trim() ? input.amountSettled.trim() : null;
  /**
   * پورتِ `maybe_link_payment`: ارزِ تسویه اگر نیامده باشد، ارزِ **تعهد** است
   * (قراردادِ عضو، وگرنه ارزِ پروژه). پیش از این با ارزِ خالی ذخیره می‌شد و هر
   * مصرف‌کننده‌ای `coalesce(amount_settled, amount)` را خام جمع می‌زد.
   */
  const settledCurrencyId = settled ? (input.settledCurrencyId ?? await obligationCurrency(plan)) : null;

  /**
   * ⚠️ رقمِ ارزِ پایه از **قصدِ دستیِ** کاربر پیروی می‌کند: اگر گفته این
   * پرداخت معادلِ ۸۰ یورو حساب شود، گزارش هم باید همان را ببیند، نه رقمِ
   * حاصل از نرخِ بازار.
   */
  const { source, baseCurrencyId } = await rateSource();
  const payEur = settled && settledCurrencyId
    ? convert(source, settled, settledCurrencyId, baseCurrencyId) ?? amounts.amountEur
    : amounts.amountEur;

  await db.insert(projectPayments).values({
    projectId: plan.projectId,
    userId: plan.userId,
    ledgerId,
    accountId: input.accountId,
    direction: plan.direction,
    type: 'payment',
    amount: input.amount,
    currencyId: input.currencyId,
    amountSettled: settled,
    settledCurrencyId,
    amountEur: payEur,
    // ⚠️ ستون تایم‌استمپ است؛ روزِ ردیف در نیمه‌شبِ UTC تثبیت می‌شود.
    paidAt: input.entryDate,
    note: paymentNote(input.description, title),
  });

  // نرخِ آموخته‌شده از این تسویه — تا نرخِ تنظیمات به‌روز بماند.
  const learned = learnedRate({
    amount: input.amount,
    amountSettled: settled,
    currencyId: input.currencyId,
    settledCurrencyId,
    typedRate: input.fxRate,
  });
  if (learned) {
    /**
     * ⚠️ upsert، نه insert: جفت+تاریخ یکتاست. دومین تسویهٔ هم‌روزِ همان جفت
     * پیش از این خطا می‌داد — بعد از آنکه ردیفِ دفتر و آینه نوشته شده بودند.
     */
    await db.insert(exchangeRates).values({
      fromCurrencyId: learned.from,
      toCurrencyId: learned.to,
      rate: learned.rate,
      effectiveDate: input.entryDate,
    }).onConflictDoUpdate({
      target: [exchangeRates.fromCurrencyId, exchangeRates.toCurrencyId, exchangeRates.effectiveDate],
      set: { rate: learned.rate },
    });
  }
}

/**
 * ارزِ تعهدی که یک آینهٔ پرداخت به آن سنجیده می‌شود: قراردادِ عضو روی همان
 * پروژه، وگرنه ارزِ پروژه.
 */
async function obligationCurrency(plan: { direction: string; projectId: number | null; userId: number | null }): Promise<number | null> {
  if (!plan.projectId) return null;
  if (plan.direction === 'member_payout' && plan.userId) {
    const rows = await db.select({ currencyId: projectMembers.currencyId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, plan.projectId), eq(projectMembers.userId, plan.userId)));
    const own = rows.find((r) => r.currencyId !== null)?.currencyId;
    if (own) return own;
  }
  return (await db.select({ currencyId: projects.currencyId }).from(projects)
    .where(eq(projects.id, plan.projectId)))[0]?.currencyId ?? null;
}

/** ارزِ پیش‌فرضِ دفترِ حساب — برای `amount_office` (پورتِ `Offices::currency`). */
async function officeCurrencyFor(officeId: number | null, fallback: number): Promise<number> {
  if (!officeId) return fallback;
  const row = (await db.select({ currencyId: offices.defaultCurrencyId }).from(offices)
    .where(eq(offices.id, officeId)))[0];
  return row?.currencyId ?? fallback;
}

/** پورتِ `Vendors::find_or_create` — نام، بدونِ حساسیت به بزرگی حروف. */
export async function findOrCreateVendor(name: string): Promise<number | null> {
  const clean = name.trim();
  if (clean === '') return null;
  const found = await db.select({ id: vendors.id }).from(vendors)
    .where(sql`lower(${vendors.name}) = lower(${clean})`).limit(1);
  if (found[0]) return found[0].id;
  const rows = await db.insert(vendors).values({ name: clean }).returning({ id: vendors.id });
  return rows[0]!.id;
}

/**
 * پورتِ گاردهای `handle()` ِ صفحهٔ حسابداری، این بار در **سرور**:
 * - طرفِ حساب از جهت پیروی می‌کند — واریز فقط پرداخت‌کننده، برداشت فقط گیرنده؛
 *   اگر خانهٔ هدف خالی باشد طرفِ موجود به آن منتقل می‌شود و خانهٔ دیگر پاک.
 *   پیش از این فرمِ کهنه/دست‌کاری‌شده می‌توانست پرداخت‌کننده روی برداشت ذخیره کند.
 * - گیرندهٔ آزادِ برداشت (بی‌شناسهٔ کاربر) فروشنده است و `vendor_id` می‌گیرد.
 */
async function normalizeParty(input: EntryInput): Promise<EntryInput> {
  const party = relocateParty(
    {
      payer: { userId: input.payerUserId, label: input.payerLabel },
      receiver: { userId: input.receiverUserId, label: input.receiverLabel },
    },
    input.direction,
  );
  const receiverLabel = party.receiver.label.trim();
  const vendorId = input.direction === 'out' && !party.receiver.userId && receiverLabel !== ''
    ? await findOrCreateVendor(receiverLabel)
    : (input.vendorId ?? null);
  return {
    ...input,
    payerUserId: party.payer.userId,
    payerLabel: party.payer.label.trim(),
    receiverUserId: party.receiver.userId,
    receiverLabel,
    vendorId,
  };
}

/** ثبتِ ردیفِ دفتر. */
export async function createEntry(actor: Actor, rawInput: EntryInput): Promise<number> {
  await assertCanBook(actor);
  const input = await normalizeParty(rawInput);

  // گاردِ ۲ — قفلِ دوره، پیش از هر چیزِ دیگر.
  assertWritable(await currentLockDate(), input.entryDate);
  // گاردِ ۳ — اعتبارسنجیِ ردیف.
  validateEntry({
    amount: input.amount,
    accountId: input.accountId,
    projectId: input.projectId,
    description: input.description,
  });

  const account = await loadAccount(actor, input.accountId);
  const { source, baseCurrencyId } = await rateSource();
  // پورتِ `add()`/`compute_amounts`: دفترِ ردیف از حساب می‌آید و `amount_office`
  // در ارزِ **دفتر** حساب می‌شود، نه ارزِ حساب (وگرنه گزارشِ منطقه‌ای بی‌معنا بود).
  const officeId = account.officeId ?? input.officeId;
  const officeCurrencyId = await officeCurrencyFor(officeId, baseCurrencyId);

  const amounts = computeAmounts(source, {
    amount: input.amount,
    currencyId: input.currencyId,
    accountCurrencyId: account.currencyId,
    officeCurrencyId,
    baseCurrencyId,
    amountAccountOverride: input.amountAccountOverride ?? null,
  });
  assertRatesKnown(amounts, input, { officeCurrencyId, baseCurrencyId });

  const rows = await db.insert(ledger).values({
    accountId: input.accountId,
    officeId,
    entryDate: input.entryDate,
    direction: input.direction,
    description: input.description,
    amount: input.amount,
    currencyId: input.currencyId,
    amountAccount: amounts.amountAccount,
    amountOffice: amounts.amountOffice,
    amountEur: amounts.amountEur,
    exchangeRate: amounts.exchangeRate,
    payerUserId: input.payerUserId,
    payerLabel: input.payerLabel,
    receiverUserId: input.receiverUserId,
    receiverLabel: input.receiverLabel,
    projectId: input.projectId,
    vendorId: input.vendorId ?? null,
    receiptIds: input.addedReceiptIds?.length ? input.addedReceiptIds : null,
    createdBy: actor.id,
  }).returning({ id: ledger.id });

  const id = rows[0]!.id;
  await writeLedgerTags(id, input.tagIds);
  await mirrorPayment(id, input, amounts);
  await audit(actor, 'ledger.create', id, null, { ...input, computed: amounts });
  return id;
}

/**
 * نرخِ غایب → خطا، مگر کاربر مبلغِ واقعیِ رسیده به حساب را نوشته باشد
 * (R-LEDGER-03: مبلغِ واقعی بر تبدیل مقدم است و نرخ لازم ندارد).
 */
function assertRatesKnown(
  amounts: { missingRates: number[] },
  input: EntryInput,
  scope: { officeCurrencyId: number; baseCurrencyId: number },
): void {
  // ارزِ دفتر فقط گزارشِ منطقه‌ای را می‌سازد؛ نبودِ نرخش ثبت را نمی‌ایستاند
  // (پورتِ افزونه که آنجا هم بی‌صدا بود) — مگر همان ارزِ پایه باشد.
  const critical = amounts.missingRates.filter(
    (id) => id !== scope.officeCurrencyId || id === scope.baseCurrencyId,
  );
  if (critical.length === 0) return;
  if (input.amountAccountOverride && input.amountAccountOverride.trim() !== '') return;
  throw new MissingRateError(critical);
}

/** دسته‌های ردیف — جایگزینیِ کامل، مثلِ تگ‌های افراد. */
async function writeLedgerTags(entryId: number, tagIds: number[]): Promise<void> {
  await db.delete(tagRelations).where(and(
    eq(tagRelations.objectType, 'ledger'),
    eq(tagRelations.objectId, entryId),
  ));
  const ids = [...new Set(tagIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;
  await db.insert(tagRelations).values(
    ids.map((tagId) => ({ tagId, objectId: entryId, objectType: 'ledger' as const })),
  );
}

/** ویرایشِ ردیف — با همان سه گارد، و **تاریخِ قدیم هم** باید نوشتنی باشد. */
export async function updateEntry(actor: Actor, entryId: number, rawInput: EntryInput): Promise<void> {
  await assertCanBook(actor);
  const input = await normalizeParty(rawInput);

  const before = await loadEntry(actor, entryId);
  const lockDate = await currentLockDate();

  // ⚠️ هم تاریخِ فعلیِ ردیف و هم تاریخِ جدید باید بیرونِ دورهٔ قفل باشند —
  // وگرنه می‌شد ردیفی را از دورهٔ بسته «بیرون کشید».
  assertWritable(lockDate, before.entryDate);
  assertWritable(lockDate, input.entryDate);

  validateEntry({
    amount: input.amount,
    accountId: input.accountId,
    projectId: input.projectId,
    description: input.description,
  });

  // ⚠️ حساب پس از ساخت ثابت است (پورتِ `update()`: «existing wins») — یک
  // پستِ دست‌کاری‌شده نمی‌تواند ردیف را به حسابِ دیگری منتقل کند.
  if (input.accountId !== before.accountId) throw new ForbiddenError('ledger.account_fixed');
  const account = await loadAccount(actor, input.accountId);
  const { source, baseCurrencyId } = await rateSource();
  // پورتِ `add()`/`compute_amounts`: دفترِ ردیف از حساب می‌آید و `amount_office`
  // در ارزِ **دفتر** حساب می‌شود، نه ارزِ حساب (وگرنه گزارشِ منطقه‌ای بی‌معنا بود).
  const officeId = account.officeId ?? input.officeId;
  const officeCurrencyId = await officeCurrencyFor(officeId, baseCurrencyId);
  const amounts = computeAmounts(source, {
    amount: input.amount,
    currencyId: input.currencyId,
    accountCurrencyId: account.currencyId,
    officeCurrencyId,
    baseCurrencyId,
    amountAccountOverride: input.amountAccountOverride ?? null,
  });
  assertRatesKnown(amounts, input, { officeCurrencyId, baseCurrencyId });

  // «موجودها منهای حذف‌شده‌ها، به‌علاوهٔ تازه‌ها» — نه جایگزینیِ کامل.
  const receipts = planReceipts({
    existing: before.receiptIds ?? [],
    removeIds: input.removedReceiptIds ?? [],
    addedIds: input.addedReceiptIds ?? [],
  });

  await db.update(ledger).set({
    accountId: input.accountId,
    officeId,
    entryDate: input.entryDate,
    direction: input.direction,
    description: input.description,
    amount: input.amount,
    currencyId: input.currencyId,
    amountAccount: amounts.amountAccount,
    amountOffice: amounts.amountOffice,
    amountEur: amounts.amountEur,
    exchangeRate: amounts.exchangeRate,
    payerUserId: input.payerUserId,
    payerLabel: input.payerLabel,
    receiverUserId: input.receiverUserId,
    receiverLabel: input.receiverLabel,
    projectId: input.projectId,
    vendorId: input.vendorId ?? null,
    receiptIds: receipts.keep.length > 0 ? receipts.keep : null,
    updatedAt: new Date(),
  }).where(eq(ledger.id, entryId));

  // ⚠️ فایلِ رسیدی که از ردیف برداشته شد نباید در باکت بماند (R-FILE-10) —
  // مگر لِگِ دیگرِ انتقال هنوز به آن اشاره کند.
  await removeFiles(await unreferencedReceipts([entryId], receipts.orphaned));

  /**
   * آینه از نو ساخته می‌شود، نه وصله‌کاری.
   * ⚠️ ویرایش می‌تواند **جهت** را هم عوض کند (پروژه برداشته شود، گیرنده از
   * عضو به فروشنده تغییر کند). به‌روزرسانیِ جزئی ردیفی با جهتِ کهنه به‌جا
   * می‌گذاشت که در گزارشِ اشتباه می‌نشست.
   */
  await db.delete(projectPayments).where(eq(projectPayments.ledgerId, entryId));
  await mirrorPayment(entryId, input, amounts);
  await writeLedgerTags(entryId, input.tagIds);

  await audit(actor, 'ledger.update', entryId, before, input);
}

/** حذفِ ردیف — قفلِ دوره اینجا هم اعمال می‌شود. */
export async function deleteEntry(actor: Actor, entryId: number): Promise<void> {
  await assertCanBook(actor);
  const before = await loadEntry(actor, entryId);
  const lockDate = await currentLockDate();
  assertDeletable(lockDate, before.entryDate);

  /**
   * ⚠️ پورتِ `Ledger::delete()`: حذفِ **یک** لِگِ انتقال کلِ انتقال را می‌برد،
   * وگرنه یک حساب لِگش را از دست می‌داد و دیگری نگهش می‌داشت — نیمه‌مطابقت.
   * هر لِگ باید بیرونِ دورهٔ قفل باشد و در دامنهٔ کاربر.
   */
  const rows = before.transferGroup
    ? await db.select().from(ledger).where(eq(ledger.transferGroup, before.transferGroup))
    : [before];
  for (const row of rows) {
    assertDeletable(lockDate, row.entryDate);
    if (row.id !== entryId) await loadAccount(actor, row.accountId);
  }

  const ids = rows.map((r) => r.id);
  await db.delete(tagRelations).where(and(
    eq(tagRelations.objectType, 'ledger'),
    inArray(tagRelations.objectId, ids),
  ));
  await db.delete(ledger).where(inArray(ledger.id, ids));
  // ⚠️ رسیدهای ردیفِ حذف‌شده دیگر صاحبی ندارند؛ در باکت هم نمی‌مانند.
  await removeFiles(await unreferencedReceipts(ids, [...new Set(rows.flatMap((r) => r.receiptIds ?? []))]));
  await audit(actor, 'ledger.delete', entryId, before, rows.length > 1 ? { transferGroup: before.transferGroup, ids } : null);
}

/**
 * انتقالِ داخلی — دو ردیفِ جفت با یک شناسهٔ گروه.
 * قواعدش (ممنوعیتِ انتقال به خودِ حساب و …) در `buildTransferLegs` است.
 */
export async function transfer(actor: Actor, input: TransferInput): Promise<[number, number]> {
  await assertCanBook(actor);
  assertWritable(await currentLockDate(), input.entryDate);

  const [fromAccount, toAccount] = await Promise.all([
    loadAccount(actor, input.fromAccountId),
    loadAccount(actor, input.toAccountId),
  ]);

  const group = `tr-${Date.now()}-${actor.id}`;
  const legs = buildTransferLegs(input, group);
  const currencyOf = new Map([
    [fromAccount.id, fromAccount.currencyId],
    [toAccount.id, toAccount.currencyId],
  ]);
  const nameOf = new Map(
    (await db.select({ id: accounts.id, name: accounts.name })
      .from(accounts).where(inArray(accounts.id, [fromAccount.id, toAccount.id])))
      .map((a) => [a.id, a.name]),
  );
  const { source, baseCurrencyId } = await rateSource();
  const description = (input.description ?? '').trim() || 'انتقالِ داخلی';

  const ids = await db.transaction(async (tx) => {
    const created: number[] = [];
    for (const leg of legs) {
      // ⚠️ هر لِگ در ارزِ **حسابِ خودش** ثبت می‌شود؛ `amount` و `amountAccount`
      // یکی‌اند چون مبلغِ واقعیِ همان حساب است (R-LEDGER-04).
      const currencyId = currencyOf.get(leg.accountId)!;
      // معادلِ پایه/نرخ مثلِ هر ردیفِ دیگر (پورتِ `add()` روی لِگ‌ها) — وگرنه
      // بستنِ دوره و نمای یورو لِگ‌های انتقال را نمی‌دیدند. نرخِ غایب صفر می‌ماند.
      const amounts = computeAmounts(source, {
        amount: leg.amount, currencyId, accountCurrencyId: currencyId,
        officeCurrencyId: currencyId, baseCurrencyId, amountAccountOverride: null,
      });
      const counterpart = nameOf.get(leg.counterpartAccountId) ?? '';
      const rows = await tx.insert(ledger).values({
        accountId: leg.accountId,
        entryDate: input.entryDate,
        direction: leg.direction,
        description,
        amount: leg.amount,
        currencyId,
        amountAccount: leg.amount,
        amountOffice: amounts.amountOffice,
        amountEur: amounts.missingRates.length === 0 ? amounts.amountEur : '0',
        exchangeRate: amounts.missingRates.length === 0 ? amounts.exchangeRate : '1',
        // لِگ‌ها همدیگر را نام می‌برند تا در جدول و جستجوی طرف‌حساب دیده شوند.
        receiverLabel: leg.direction === 'out' ? counterpart : '',
        payerLabel: leg.direction === 'in' ? counterpart : '',
        transferGroup: leg.transferGroup,
        // رسیدِ انتقال روی هر دو لِگ می‌نشیند (پورتِ `receipt_attachment_id`).
        receiptIds: input.receiptIds && input.receiptIds.length > 0 ? input.receiptIds : null,
        createdBy: actor.id,
      }).returning({ id: ledger.id });
      created.push(rows[0]!.id);
    }
    return created as [number, number];
  });

  // هر دو لِگ رویداد می‌گیرند تا «توسط» و تاریخچه روی حسابِ مقصد هم پر باشد.
  await audit(actor, 'ledger.transfer', ids[0], null, { ...input, group });
  await audit(actor, 'ledger.transfer', ids[1], null, { ...input, group });
  return ids;
}

/**
 * رسیدهایی که هیچ ردیفِ دیگری (جز ردیف‌های داده‌شده) به آن‌ها اشاره نمی‌کند.
 * ⚠️ رسیدِ انتقال بینِ دو لِگ مشترک است؛ حذفِ رسید از یک لِگ نباید فایلِ
 * لِگِ دیگر را از باکت ببرد.
 */
async function unreferencedReceipts(exceptIds: readonly number[], fileIds: readonly number[]): Promise<number[]> {
  if (fileIds.length === 0 || exceptIds.length === 0) return [...fileIds];
  const rows = await db.execute(sql`
    select distinct unnest(receipt_ids) as id from ledger
    where id not in ${sql.raw(`(${exceptIds.join(',')})`)}
      and receipt_ids && ${sql.raw(`array[${fileIds.join(',')}]::bigint[]`)}
  `) as unknown as Array<{ id: number | string }>;
  const used = new Set(rows.map((r) => Number(r.id)));
  return fileIds.filter((id) => !used.has(id));
}

/** گزینه‌های فرم — حساب، ارز، دستهٔ دفتر، پروژه، طرف‌حساب. */
export async function getEntryFormOptions(actor: Actor) {
  await assertCanBook(actor);

  const [
    accountRows, currencyRows, categoryRows, projectRows, vendorRows, peopleRows, membershipRows, unitRows,
    clientRows,
  ] = await Promise.all([
      listAccounts(actor),
      db.select({ id: currencies.id, code: currencies.code, isDefault: currencies.isDefault })
        .from(currencies).where(eq(currencies.isActive, true)).orderBy(currencies.id),
      // ⚠️ جهتِ تگ روی `status_group` می‌نشیند (همان جای نسخهٔ قبلی)؛ مقدارِ
      // نامعتبر یا خالی یعنی «هردو»، تا تگی بی‌صدا ناپدید نشود.
      db.select({ id: tags.id, name: tagName(await currentLocale()), dir: tags.statusGroup })
        .from(tags).where(eq(tags.type, 'ledger_category')).orderBy(tags.sortOrder, tags.id),
      db.select({ id: projects.id, title: projects.title, currencyId: projects.currencyId })
        .from(projects)
        .where(and(isNull(projects.deletedAt), inArray(projects.scope, visibleScopes(actor))))
        .orderBy(projects.title),
      db.select({ id: vendors.id, name: vendors.name })
        .from(vendors).orderBy(vendors.name),
      db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(isNull(users.deletedAt)).orderBy(users.name),

      /**
       * عضویت‌های پروژه — برای دو قاعدهٔ فرم:
       * · چک‌باکسِ بازپرداخت وقتی دریافت‌کننده عضوِ پروژه است پنهان می‌شود
       * · ارزِ بلوکِ «معادل» از قراردادِ همان عضو می‌آید
       * ⚠️ یک کوئریِ ثابت، نه یکی به‌ازای هر پروژه (R-PERF-01).
       */
      db.select({
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        currencyId: projectMembers.currencyId,
      }).from(projectMembers),

      /**
       * کارکردهای پرداخت‌نشده به تفکیکِ «پروژه:عضو» — برای انتخابگرِ داخلِ فرم
       * (پورتِ `unitUnpaid` ِ `js_data`): برداشت به عضوِ پروژهٔ تعدادی، انتخاب
       * معادل/ارز را پر می‌کند و پس از ذخیره همان کارکرد «پرداخت‌شده» می‌شود.
       * ردیفِ «درخواست‌شده» نمی‌آید — مسیرش درخواستِ پرداخت است.
       */
      db.select({
        id: unitEntries.id, projectId: unitEntries.projectId, userId: unitEntries.userId,
        entryDate: unitEntries.entryDate, quantity: unitEntries.quantity, amount: unitEntries.amount,
        currencyId: unitEntries.currencyId, code: currencies.code, symbol: currencies.symbol,
        decimals: currencies.decimals,
      }).from(unitEntries)
        .leftJoin(currencies, eq(currencies.id, unitEntries.currencyId))
        .where(eq(unitEntries.status, 'unpaid'))
        .orderBy(unitEntries.entryDate, unitEntries.id),

      // کارفرمایانِ پروژه — برای باریک‌سازیِ پروژه به طرفِ حساب (پورتِ `projectUsers`).
      db.select({ projectId: projectClients.projectId, userId: projectClients.userId }).from(projectClients),
    ]);

  const memberships = membershipRows;

  return {
    accounts: accountRows,
    currencies: currencyRows,
    categories: categoryRows,
    projects: projectRows,
    vendors: vendorRows,
    people: peopleRows,
    // نگاشت‌ها برای قواعدِ وابستگیِ فیلدها (docs/rules/LEDGER-FORM.md).
    projectMemberIds: memberships.reduce<Record<number, number[]>>((acc, m) => {
      (acc[m.projectId] ??= []).push(m.userId);
      return acc;
    }, {}),
    memberCurrency: memberships.reduce<Record<string, number>>((acc, m) => {
      if (m.currencyId) acc[`${m.projectId}:${m.userId}`] = m.currencyId;
      return acc;
    }, {}),
    projectClientIds: clientRows.reduce<Record<number, number[]>>((acc, c) => {
      (acc[c.projectId] ??= []).push(c.userId);
      return acc;
    }, {}),
    unitUnpaid: unitRows.reduce<Record<string, Array<{ id: number; amount: string; currencyId: number | null; text: string }>>>((acc, u) => {
      const cur = u.currencyId !== null && u.code !== null
        ? { id: u.currencyId, code: u.code, symbol: u.symbol ?? '', decimals: u.decimals ?? 2 }
        : undefined;
      (acc[`${u.projectId}:${u.userId}`] ??= []).push({
        id: u.id,
        amount: u.amount,
        currencyId: u.currencyId,
        text: `${u.entryDate} · ${Number(u.quantity)}× · ${formatMoney(u.amount, cur)}`,
      });
      return acc;
    }, {}),
    defaultCurrencyId: currencyRows.find((c) => c.isDefault)?.id ?? null,
    lockDate: await currentLockDate(),
  };
}

/**
 * حقِ **نوشتن** در دفتر — پورتِ `kteam_finance_scoped` روی صفحهٔ حسابداری:
 * مدیرِ مالی همه‌جا؛ «حسابدارِ محدود» (`finance.view` + تخصیصِ حساب) روی
 * حساب‌های تخصیص‌یافته‌اش می‌نویسد — خودِ حساب در `loadAccount` سنجیده می‌شود.
 *
 * ⚠️ پیش از این حسابدارِ محدود فقط‌خواندنی بود: کاربردِ اصلیِ افزونه (حسابداری
 * که روی «حساب‌های خودش» ردیف می‌زند) وجود نداشت.
 */
async function assertCanBook(actor: Actor): Promise<void> {
  if (canManageSection(actor, 'finance')) return;
  if (!canViewSection(actor, 'finance')) throw new ForbiddenError('finance.manage');
  const scope = await accountScope(actor);
  if (scope.assignedAccountIds.length === 0) throw new ForbiddenError('finance.manage');
}

/** می‌تواند روی **این** حساب بنویسد؟ — پرچمِ دکمه‌های صفحه. */
export async function canBookOn(actor: Actor, accountId: number): Promise<boolean> {
  if (canManageSection(actor, 'finance')) return true;
  if (!canViewSection(actor, 'finance')) return false;
  return (await accountScope(actor)).assignedAccountIds.includes(accountId);
}

async function loadAccount(actor: Actor, accountId: number) {
  const rows = await db
    .select({ id: accounts.id, currencyId: accounts.currencyId, scope: accounts.scope, officeId: accounts.officeId })
    .from(accounts).where(eq(accounts.id, accountId));
  const account = rows[0];
  if (!account) throw new LedgerNotFoundError();
  if (!visibleScopes(actor).includes(account.scope as 'company' | 'private')) {
    throw new LedgerNotFoundError();
  }
  // همان دامنهٔ حسابدار روی مسیرِ نوشتن هم اعمال می‌شود (R-ARCH-02).
  if (!canSeeAccount(accountId, await accountScope(actor))) throw new LedgerNotFoundError();
  return account;
}

async function loadEntry(actor: Actor, entryId: number) {
  const rows = await db.select().from(ledger).where(eq(ledger.id, entryId));
  const entry = rows[0];
  if (!entry) throw new LedgerNotFoundError();
  await loadAccount(actor, entry.accountId); // گاردِ scope از راهِ حساب
  return entry;
}

export { asc, canViewSection };

/* ------------------------------------------------------------------ *
 * حساب‌های بانکی
 * ------------------------------------------------------------------ */

/**
 * ⚠️ R-ACC-02 — دامنهٔ حسابدار: مدیرِ مالی همه را می‌بیند، «حسابدارِ محدود»
 * فقط حساب‌های تخصیص‌یافته.
 */
export async function accountScope(actor: Actor) {
  // پورتِ `user_sees_all()`: مدیرِ مالی **یا** مدیرِ سراسریِ پروژه‌ها.
  const seesAll = canManageSection(actor, 'finance') || canManageSection(actor, 'projects');
  if (seesAll) return { seesAll, assignedAccountIds: [] as number[] };

  const rows = await db.select({ accountId: accountUsers.accountId })
    .from(accountUsers).where(eq(accountUsers.userId, actor.id));
  return { seesAll, assignedAccountIds: rows.map((r) => r.accountId) };
}

export interface AccountInput {
  id: number | null;
  name: string;
  type: 'business' | 'personal';
  officeId: number | null;
  currencyId: number | null;
  openingBalance: string;
  note: string;
  sortOrder: number;
  isActive: boolean;
  scope: 'company' | 'private';
  accountantIds: number[];
}

export async function saveAccount(actor: Actor, input: AccountInput): Promise<number> {
  assertCanManage(actor, 'finance');

  const name = input.name.trim();
  if (name === '') throw new AccountError('name_required');
  if (input.currencyId === null) throw new AccountError('no_currency');

  const values = {
    name,
    type: input.type,
    officeId: input.officeId,
    currencyId: input.currencyId,
    openingBalance: input.openingBalance || '0',
    note: input.note,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    scope: input.scope,
  };

  const id = await db.transaction(async (tx) => {
    let accountId = input.id;
    if (accountId) {
      await tx.update(accounts).set({ ...values, updatedAt: new Date() })
        .where(eq(accounts.id, accountId));
    } else {
      const rows = await tx.insert(accounts).values(values).returning({ id: accounts.id });
      accountId = rows[0]!.id;
    }

    // حسابدارانِ اختصاصی — جایگزینیِ کامل، مثلِ `set_accountants()`.
    await tx.delete(accountUsers).where(eq(accountUsers.accountId, accountId));
    const unique = [...new Set(input.accountantIds.filter((n) => n > 0))];
    if (unique.length > 0) {
      await tx.insert(accountUsers).values(unique.map((userId) => ({ accountId: accountId!, userId })));
    }
    return accountId;
  });

  await audit(actor, input.id ? 'account.update' : 'account.create', id, null, input);
  return id;
}

export async function deleteAccount(actor: Actor, id: number) {
  assertCanManage(actor, 'finance');

  // ⚠️ R-ACC-01 — حسابی که ردیف دارد حذف نمی‌شود.
  const used = await db.select({ n: sql<number>`count(*)::int` })
    .from(ledger).where(eq(ledger.accountId, id));
  assertAccountDeletable(used[0]?.n ?? 0);

  await db.transaction(async (tx) => {
    await tx.delete(accountUsers).where(eq(accountUsers.accountId, id));
    await tx.delete(accounts).where(eq(accounts.id, id));
  });
  await audit(actor, 'account.delete', id);
}

/**
 * کاندیدای «حسابدارِ این حساب» — پورتِ فهرستِ افزونه: کسانی که دسترسیِ مالی
 * دارند (نقشِ finance، مجوزِ per-user، یا تگِ «حسابدار»/«مدیر حسابداری»).
 * ⚠️ تخصیصِ کسی که هیچ دسترسیِ مالی ندارد بی‌اثر بود و فهرست را شلوغ می‌کرد.
 */
async function financeCandidates(): Promise<Array<{ id: number; name: string }>> {
  const [byRole, byPerm, byTag] = await Promise.all([
    db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, 'finance')),
    db.select({ id: userPermissions.userId }).from(userPermissions)
      .where(inArray(userPermissions.permission, ['finance.view', 'finance.manage'])),
    userIdsWithCaps([FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP]),
  ]);
  const ids = [...new Set([...byRole.map((r) => r.id), ...byPerm.map((r) => r.id), ...byTag])];
  if (ids.length === 0) return [];
  return db.select({ id: users.id, name: users.name })
    .from(users).where(and(isNull(users.deletedAt), inArray(users.id, ids))).orderBy(users.name);
}

/** حسابداران و گزینه‌های فرمِ حساب. */
export async function getAccountFormOptions(actor: Actor) {
  assertCanManage(actor, 'finance');
  const [currencyRows, officeRows, people, assignments] = await Promise.all([
    db.select({ id: currencies.id, code: currencies.code, isDefault: currencies.isDefault })
      .from(currencies).where(eq(currencies.isActive, true)).orderBy(currencies.id),
    db.select({ id: offices.id, name: offices.name })
      .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name),
    financeCandidates(),
    db.select({ accountId: accountUsers.accountId, userId: accountUsers.userId }).from(accountUsers),
  ]);

  const byAccount = new Map<number, number[]>();
  for (const a of assignments) {
    byAccount.set(a.accountId, [...(byAccount.get(a.accountId) ?? []), a.userId]);
  }

  return { currencies: currencyRows, offices: officeRows, people, accountantsByAccount: byAccount };
}

/* ------------------------------------------------------------------ *
 * بستن و بازکردنِ دورهٔ مالی
 * ------------------------------------------------------------------ */

/**
 * بستنِ دوره.
 *
 * برای **هر حساب** یک خلاصهٔ منجمد نوشته می‌شود و بعد قفل جلو می‌رود.
 * ⚠️ خودِ ردیف‌های دفتر پاک **نمی‌شوند**؛ قفل فقط آن‌ها را فقط‌خواندنی
 * می‌کند. خلاصه برای این است که گزارشِ دوره‌های گذشته سریع و **ثابت** بماند،
 * حتی اگر فردا نرخِ ارز عوض شود.
 *
 * ⚠️ بستنِ دوبارهٔ **همان تاریخ** ردیف‌های قبلی‌اش را جایگزین می‌کند، نه
 * اینکه دو خلاصه برای یک روز بماند.
 *
 * ⚠️ فقط مالک — این عمل عملاً برگشت‌ناپذیر است و روی همهٔ حساب‌ها اثر دارد.
 */
export async function closePeriod(actor: Actor, closeDate: string): Promise<number> {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('fiscal.close');
  if (!isValidCloseDate(closeDate)) throw new ForbiddenError('fiscal.bad_date');

  const date = closeDate.trim().slice(0, 10);

  const [prevRows, accountRows, { source, baseCurrencyId }] = await Promise.all([
    db.select({ closeDate: fiscalClosings.closeDate })
      .from(fiscalClosings)
      .where(lt(fiscalClosings.closeDate, date))
      .orderBy(desc(fiscalClosings.closeDate))
      .limit(1),
    db.select({
      id: accounts.id,
      currencyId: accounts.currencyId,
      openingBalance: accounts.openingBalance,
    }).from(accounts),
    rateSource(),
  ]);

  const from = periodStart(prevRows[0]?.closeDate ?? null);

  // بستنِ دوباره = جایگزینی.
  await db.delete(fiscalClosings).where(eq(fiscalClosings.closeDate, date));

  const num = (v: string | null | undefined) => Number(v ?? 0);

  for (const account of accountRows) {
    // گردشِ **دوره** در ارزِ خودِ حساب و در ارزِ پایه.
    const flowRows = await db
      .select({
        direction: ledger.direction,
        account: sql<string>`coalesce(sum(${ledger.amountAccount}), 0)::text`,
        eur: sql<string>`coalesce(sum(${ledger.amountEur}), 0)::text`,
      })
      .from(ledger)
      .where(and(
        eq(ledger.accountId, account.id),
        gt(ledger.entryDate, from),
        lte(ledger.entryDate, date),
      ))
      .groupBy(ledger.direction);

    const flow = new Map(flowRows.map((r) => [r.direction, r]));

    // تفکیکِ کارفرما / عضو / هزینه — از پرداخت‌های آینه‌شدهٔ پروژه.
    const splitRows = await db
      .select({
        direction: projectPayments.direction,
        eur: sql<string>`coalesce(sum(${projectPayments.amountEur}), 0)::text`,
      })
      .from(projectPayments)
      .innerJoin(ledger, eq(ledger.id, projectPayments.ledgerId))
      .where(and(
        eq(ledger.accountId, account.id),
        gt(ledger.entryDate, from),
        lte(ledger.entryDate, date),
      ))
      .groupBy(projectPayments.direction);

    const split = new Map(splitRows.map((r) => [r.direction, num(r.eur)]));

    // موجودیِ پایانی — **انباشته** تا تاریخِ بستن، نه فقط این دوره.
    const cumRows = await db
      .select({
        direction: ledger.direction,
        total: sql<string>`coalesce(sum(${ledger.amountAccount}), 0)::text`,
      })
      .from(ledger)
      .where(and(eq(ledger.accountId, account.id), lte(ledger.entryDate, date)))
      .groupBy(ledger.direction);

    const cum = new Map(cumRows.map((r) => [r.direction, num(r.total)]));
    const closing = closingBalance({
      openingBalance: num(account.openingBalance),
      cumulativeIn: cum.get('in') ?? 0,
      cumulativeOut: cum.get('out') ?? 0,
    });

    /**
     * ⚠️ موجودیِ پایانی به ارزِ پایه با نرخِ **همین لحظه** منجمد می‌شود.
     * اگر نرخی نباشد صفر ثبت می‌شود — نه رقمِ حدسی؛ عددِ اشتباه در گزارشِ
     * بسته‌شده بدتر از عددِ خالی است.
     */
    const closingEur = account.currencyId === baseCurrencyId
      ? String(closing)
      : convert(source, String(closing), account.currencyId, baseCurrencyId) ?? '0';

    await db.insert(fiscalClosings).values({
      closeDate: date,
      periodStart: from,
      accountId: account.id,
      currencyId: account.currencyId,
      deposits: flow.get('in')?.account ?? '0',
      withdrawals: flow.get('out')?.account ?? '0',
      closingBalance: String(closing),
      depositsEur: flow.get('in')?.eur ?? '0',
      withdrawalsEur: flow.get('out')?.eur ?? '0',
      clientReceivedEur: String(split.get('incoming') ?? 0),
      memberPaidEur: String(split.get('member_payout') ?? 0),
      expensesEur: String((split.get('project_expense') ?? 0) + (split.get('project_cost') ?? 0)),
      closingBalanceEur: closingEur,
      createdBy: actor.id,
    });
  }

  // R-FISCAL-10 — قفل جلو می‌رود، هرگز عقب نمی‌آید.
  const lock = nextLockDate(await currentLockDate(), date);
  await db.insert(fiscalLocks).values({ lockDate: lock, setBy: actor.id });

  await audit(actor, 'fiscal.close', 0, null, { closeDate: date, accounts: accountRows.length });
  return accountRows.length;
}

/**
 * بازکردنِ دوره — قفل برداشته می‌شود.
 * ⚠️ خلاصه‌های ثبت‌شده **می‌مانند**: تاریخچهٔ اینکه چه زمانی چه چیزی بسته شده
 * پاک نمی‌شود، فقط ردیف‌ها دوباره قابلِ تغییر می‌شوند.
 */
export async function reopenPeriod(actor: Actor): Promise<void> {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('fiscal.close');

  const before = await currentLockDate();
  await db.insert(fiscalLocks).values({ lockDate: null, setBy: actor.id });
  await audit(actor, 'fiscal.reopen', 0, { lockDate: before }, null);
}

/** تاریخ‌های بستن، تازه‌ترین اول — پورتِ `closing_dates()`. */
export async function closingDates(actor: Actor): Promise<string[]> {
  assertCanView(actor, 'finance');
  return closingDatesQuery();
}

/** بی‌گارد — فراخوانِ گزارش‌ها با مجوزِ گزارش نگهبانی می‌کند (پورتِ افزونه: تبِ دوره‌ها با cap ِ گزارش). */
export async function closingDatesQuery(): Promise<string[]> {
  const rows = await db.selectDistinct({ closeDate: fiscalClosings.closeDate })
    .from(fiscalClosings)
    .orderBy(desc(fiscalClosings.closeDate));
  return rows.map((r) => r.closeDate);
}

/** ردیف‌های خلاصهٔ یک تاریخِ بستن، همراهِ نامِ حساب. */
export async function closingRows(actor: Actor, closeDate: string) {
  assertCanView(actor, 'finance');
  return closingRowsQuery(closeDate);
}

/** بی‌گارد — نگاه کن به `closingDatesQuery`. */
export async function closingRowsQuery(closeDate: string) {
  return db
    .select({
      accountName: accounts.name,
      currencyCode: currencies.code,
      periodStart: fiscalClosings.periodStart,
      deposits: fiscalClosings.deposits,
      withdrawals: fiscalClosings.withdrawals,
      closingBalance: fiscalClosings.closingBalance,
      depositsEur: fiscalClosings.depositsEur,
      withdrawalsEur: fiscalClosings.withdrawalsEur,
      clientReceivedEur: fiscalClosings.clientReceivedEur,
      memberPaidEur: fiscalClosings.memberPaidEur,
      expensesEur: fiscalClosings.expensesEur,
      closingBalanceEur: fiscalClosings.closingBalanceEur,
    })
    .from(fiscalClosings)
    .innerJoin(accounts, eq(accounts.id, fiscalClosings.accountId))
    .leftJoin(currencies, eq(currencies.id, fiscalClosings.currencyId))
    .where(eq(fiscalClosings.closeDate, closeDate))
    .orderBy(accounts.sortOrder, accounts.id);
}

/**
 * بازمحاسبهٔ معادلِ یورو.
 *
 * ⚠️ این ابزار R-FISCAL-08 (انجمادِ EUR هنگامِ ثبت) را **آگاهانه و به‌فرمانِ
 * مالک** می‌شکند و برای همین وجود دارد: ردیفی که پیش از واردشدنِ نرخش ثبت
 * شده بود با EUR ِ صفر/غلط منجمد شده و گزارش‌ها را کج می‌کند. کامنتِ خودِ
 * نسخهٔ قبلی: «repair for figures frozen before their rate existed».
 *
 * قواعدِ نسخهٔ قبلی، دقیقاً:
 * · هر دو جدول (دفتر + آینهٔ پرداخت‌ها)
 * · تسویهٔ دستی (`amountSettled`) مقدم بر مبلغِ اسمی
 * · فقط ردیف‌هایی نوشته می‌شوند که رقمشان واقعاً عوض شده
 * · هیچ یادگیریِ نرخی رخ نمی‌دهد
 */
export async function recomputeEur(actor: Actor): Promise<{ ledger: number; payments: number }> {
  // مالک یا مدیرِ مالی — بازنویسیِ ارقامِ منجمد کارِ مالی است، نه فقط مالک (ردیفِ ۲۲ ِ ممیزی).
  if (!actor.roles.includes('owner') && !canManageSection(actor, 'finance')) throw new ForbiddenError('fiscal.recompute');

  const { source, baseCurrencyId } = await rateSource();
  const changed = { ledger: 0, payments: 0 };

  const ledgerRows = await db.select({
    id: ledger.id, amount: ledger.amount, currencyId: ledger.currencyId, amountEur: ledger.amountEur,
  }).from(ledger);

  for (const r of ledgerRows) {
    const next = convert(source, r.amount, r.currencyId ?? baseCurrencyId, baseCurrencyId);
    if (next !== null && Number(next).toFixed(4) !== Number(r.amountEur).toFixed(4)) {
      await db.update(ledger).set({ amountEur: next }).where(eq(ledger.id, r.id));
      changed.ledger += 1;
    }
  }

  const paymentRows = await db.select({
    id: projectPayments.id,
    amount: projectPayments.amount,
    currencyId: projectPayments.currencyId,
    amountSettled: projectPayments.amountSettled,
    settledCurrencyId: projectPayments.settledCurrencyId,
    amountEur: projectPayments.amountEur,
  }).from(projectPayments);

  for (const r of paymentRows) {
    const next = r.amountSettled !== null && r.settledCurrencyId
      ? convert(source, r.amountSettled, r.settledCurrencyId, baseCurrencyId)
      : convert(source, r.amount, r.currencyId ?? baseCurrencyId, baseCurrencyId);
    if (next !== null && Number(next).toFixed(4) !== Number(r.amountEur).toFixed(4)) {
      await db.update(projectPayments).set({ amountEur: next }).where(eq(projectPayments.id, r.id));
      changed.payments += 1;
    }
  }

  await audit(actor, 'fiscal.recompute', 0, null, changed);
  return changed;
}

/**
 * پیش‌نمایشِ بستنِ دوره — پورتِ تبِ «بستن دورهٔ مالی» ِ نسخهٔ قبلی: ماندهٔ
 * فعلیِ هر حساب (همان چیزی که با بستن منجمد می‌شود) و آخرین تغییرِ قفل
 * (کِی، توسطِ که). فقط مالک — همان گاردِ `closePeriod`.
 */
export async function closingPreview(actor: Actor) {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('fiscal.close');
  const [accountRows, lockRows] = await Promise.all([
    listAccounts(actor),
    db.select({ lockDate: fiscalLocks.lockDate, at: fiscalLocks.createdAt, by: users.name })
      .from(fiscalLocks)
      .leftJoin(users, eq(users.id, fiscalLocks.setBy))
      .orderBy(desc(fiscalLocks.id))
      .limit(1),
  ]);
  const last = lockRows[0];
  return {
    accounts: accountRows.map((a) => ({
      id: a.id,
      label: `${a.officeName ? `${a.officeName} · ` : ''}${a.name}`,
      balance: a.balance,
      currencyCode: a.currencyCode,
    })),
    lastChange: last
      ? { at: new Date(last.at).toISOString(), by: last.by ?? '', lockDate: last.lockDate }
      : null,
  };
}
