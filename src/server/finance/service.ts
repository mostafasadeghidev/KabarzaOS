import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, accountUsers, auditLog, currencies, exchangeRates, fiscalClosings, fiscalLocks,
  ledger, offices, projectMembers, projectPayments, projects, tagRelations, tags, users, vendors,
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
    })
    .from(accounts)
    .leftJoin(currencies, eq(currencies.id, accounts.currencyId))
    .leftJoin(offices, eq(offices.id, accounts.officeId))
    .where(inArray(accounts.scope, visibleScopes(actor)))
    .orderBy(accounts.sortOrder, accounts.name);

  const allowed = new Set(visibleAccountIds({
    seesAll: scope.seesAll,
    assignedAccountIds: scope.assignedAccountIds,
    allAccountIds: rows.map((r) => r.id),
  }));
  return rows.filter((r) => allowed.has(r.id));
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

  const conditions = [eq(ledger.accountId, input.accountId)];
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
   * «توسط» — پورتِ `edit_log` / `last_actor_name` ِ نسخهٔ قبلی، ولی از همان
   * audit_log ِ مشترک، نه یک ستونِ JSON ِ موازی: آخرین رویدادِ ثبت/ویرایشِ
   * هر ردیف، در یک کوئریِ گروهی (DISTINCT ON)، نه یکی به‌ازای هر ردیف.
   */
  const actorRows = rows.length === 0 ? [] : await db.execute(sql`
    select distinct on (a.object_id) a.object_id as id, u.name
    from audit_log a
    join users u on u.id = a.actor_id
    where a.object_type = 'ledger'
      and a.action in ('ledger.create', 'ledger.update', 'ledger.transfer')
      and a.object_id in ${sql.raw(`(${rows.map((r) => r.id).join(',')})`)}
    order by a.object_id, a.id desc
  `) as unknown as Array<{ id: number; name: string }>;
  const lastActor = new Map(actorRows.map((r) => [Number(r.id), r.name]));

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledger)
    .leftJoin(payer, eq(payer.id, ledger.payerUserId))
    .leftJoin(receiver, eq(receiver.id, ledger.receiverUserId))
    .where(and(...conditions));
  const total = countRow?.n ?? 0;

  // مانده‌ها — یک کوئریِ گروهی، نه جمع در حافظه روی صفحهٔ فیلترشده.
  const totals = await db
    .select({
      direction: ledger.direction,
      total: sql<string>`coalesce(sum(${ledger.amountAccount}), 0)::text`,
    })
    .from(ledger)
    .where(eq(ledger.accountId, input.accountId))
    .groupBy(ledger.direction);

  // رسیدهای همهٔ ردیف‌ها با **یک** کوئری خوانده می‌شوند، نه یکی به‌ازای هر
  // ردیف (R-PERF-01).
  const allReceiptIds = [...new Set(rows.flatMap((r) => r.receiptIds ?? []))];
  const summaries = await fileSummaries(allReceiptIds);
  const byId = new Map(summaries.map((f) => [f.id, f]));

  const entries = rows.map(({ mirrorDirection, ...r }) => ({
    ...r,
    // ⚠️ درایورِ postgres آرایهٔ bigint را رشته برمی‌گرداند؛ فرم عدد می‌خواهد.
    tagIds: (r.tagIds ?? []).map(Number),
    // `project_expense` = قابلِ صورتحساب؛ `project_cost` = جذب‌شده؛ بدونِ آینه = پیش‌فرضِ بله.
    billable: mirrorDirection !== 'project_cost',
    // مبلغِ حساب وقتی با مبلغِ اسمی فرق دارد، یا تبدیل است یا رقمِ دستی — هر دو باید بمانند.
    amountAccountOverride: r.amountAccount !== r.amount ? r.amountAccount : null,
    lastActor: lastActor.get(r.id) ?? null,
    receipts: (r.receiptIds ?? [])
      .map((id) => byId.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f)),
  }));

  const totalIn = totals.find((t) => t.direction === 'in')?.total ?? '0';
  const totalOut = totals.find((t) => t.direction === 'out')?.total ?? '0';
  const balance = (
    Number(account.openingBalance) + Number(totalIn) - Number(totalOut)
  ).toFixed(4);

  return {
    account,
    entries,
    /**
     * ⚠️ جمع‌ها **همیشه** کلِ حساب‌اند، نه صفحه یا فیلترِ فعال: ماندهٔ حساب
     * یک واقعیتِ حسابداری است و با فیلترِ نمایش عوض نمی‌شود. نسخهٔ قبلی هم
     * همین‌طور است.
     */
    totals: { in: totalIn, out: totalOut, balance, opening: account.openingBalance },
    paging: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    lockDate: await currentLockDate(),
    canManage: canManageSection(actor, 'finance'),
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
  const settledCurrencyId = settled ? (input.settledCurrencyId ?? null) : null;

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
    paidAt: new Date(`${input.entryDate}T00:00:00Z`),
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

/** ثبتِ ردیفِ دفتر. */
export async function createEntry(actor: Actor, input: EntryInput): Promise<number> {
  assertCanManage(actor, 'finance');

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

  const amounts = computeAmounts(source, {
    amount: input.amount,
    currencyId: input.currencyId,
    accountCurrencyId: account.currencyId,
    officeCurrencyId: account.currencyId,
    baseCurrencyId,
    amountAccountOverride: input.amountAccountOverride ?? null,
  });
  assertRatesKnown(amounts, input);

  const rows = await db.insert(ledger).values({
    accountId: input.accountId,
    officeId: input.officeId,
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
function assertRatesKnown(amounts: { missingRates: number[] }, input: EntryInput): void {
  if (amounts.missingRates.length === 0) return;
  if (input.amountAccountOverride && input.amountAccountOverride.trim() !== '') return;
  throw new MissingRateError(amounts.missingRates);
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
export async function updateEntry(actor: Actor, entryId: number, input: EntryInput): Promise<void> {
  assertCanManage(actor, 'finance');

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

  const account = await loadAccount(actor, input.accountId);
  const { source, baseCurrencyId } = await rateSource();
  const amounts = computeAmounts(source, {
    amount: input.amount,
    currencyId: input.currencyId,
    accountCurrencyId: account.currencyId,
    officeCurrencyId: account.currencyId,
    baseCurrencyId,
    amountAccountOverride: input.amountAccountOverride ?? null,
  });
  assertRatesKnown(amounts, input);

  // «موجودها منهای حذف‌شده‌ها، به‌علاوهٔ تازه‌ها» — نه جایگزینیِ کامل.
  const receipts = planReceipts({
    existing: before.receiptIds ?? [],
    removeIds: input.removedReceiptIds ?? [],
    addedIds: input.addedReceiptIds ?? [],
  });

  await db.update(ledger).set({
    accountId: input.accountId,
    officeId: input.officeId,
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
    receiptIds: receipts.keep.length > 0 ? receipts.keep : null,
    updatedAt: new Date(),
  }).where(eq(ledger.id, entryId));

  // ⚠️ فایلِ رسیدی که از ردیف برداشته شد نباید در باکت بماند (R-FILE-10).
  await removeFiles(receipts.orphaned);

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
  assertCanManage(actor, 'finance');
  const before = await loadEntry(actor, entryId);
  assertDeletable(await currentLockDate(), before.entryDate);

  await db.delete(tagRelations).where(and(
    eq(tagRelations.objectType, 'ledger'),
    eq(tagRelations.objectId, entryId),
  ));
  await db.delete(ledger).where(eq(ledger.id, entryId));
  // ⚠️ رسیدهای ردیفِ حذف‌شده دیگر صاحبی ندارند؛ در باکت هم نمی‌مانند.
  await removeFiles(before.receiptIds ?? []);
  await audit(actor, 'ledger.delete', entryId, before, null);
}

/**
 * انتقالِ داخلی — دو ردیفِ جفت با یک شناسهٔ گروه.
 * قواعدش (ممنوعیتِ انتقال به خودِ حساب و …) در `buildTransferLegs` است.
 */
export async function transfer(actor: Actor, input: TransferInput): Promise<[number, number]> {
  assertCanManage(actor, 'finance');
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

  const ids = await db.transaction(async (tx) => {
    const created: number[] = [];
    for (const leg of legs) {
      // ⚠️ هر لِگ در ارزِ **حسابِ خودش** ثبت می‌شود؛ `amount` و `amountAccount`
      // یکی‌اند چون مبلغِ واقعیِ همان حساب است (R-LEDGER-04).
      const currencyId = currencyOf.get(leg.accountId)!;
      const rows = await tx.insert(ledger).values({
        accountId: leg.accountId,
        entryDate: input.entryDate,
        direction: leg.direction,
        description: 'انتقالِ داخلی',
        amount: leg.amount,
        currencyId,
        amountAccount: leg.amount,
        transferGroup: leg.transferGroup,
        createdBy: actor.id,
      }).returning({ id: ledger.id });
      created.push(rows[0]!.id);
    }
    return created as [number, number];
  });

  await audit(actor, 'ledger.transfer', ids[0], null, { ...input, group });
  return ids;
}

/** گزینه‌های فرم — حساب، ارز، دستهٔ دفتر، پروژه، طرف‌حساب. */
export async function getEntryFormOptions(actor: Actor) {
  assertCanManage(actor, 'finance');

  const [
    accountRows, currencyRows, categoryRows, projectRows, vendorRows, peopleRows, membershipRows,
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
    defaultCurrencyId: currencyRows.find((c) => c.isDefault)?.id ?? null,
    lockDate: await currentLockDate(),
  };
}

async function loadAccount(actor: Actor, accountId: number) {
  const rows = await db
    .select({ id: accounts.id, currencyId: accounts.currencyId, scope: accounts.scope })
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
  const seesAll = canManageSection(actor, 'finance');
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

/** حسابداران و گزینه‌های فرمِ حساب. */
export async function getAccountFormOptions(actor: Actor) {
  assertCanManage(actor, 'finance');
  const [currencyRows, officeRows, people, assignments] = await Promise.all([
    db.select({ id: currencies.id, code: currencies.code, isDefault: currencies.isDefault })
      .from(currencies).where(eq(currencies.isActive, true)).orderBy(currencies.id),
    db.select({ id: offices.id, name: offices.name })
      .from(offices).where(eq(offices.isActive, true)).orderBy(offices.name),
    db.select({ id: users.id, name: users.name })
      .from(users).where(isNull(users.deletedAt)).orderBy(users.name),
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
  const rows = await db.selectDistinct({ closeDate: fiscalClosings.closeDate })
    .from(fiscalClosings)
    .orderBy(desc(fiscalClosings.closeDate));
  return rows.map((r) => r.closeDate);
}

/** ردیف‌های خلاصهٔ یک تاریخِ بستن، همراهِ نامِ حساب. */
export async function closingRows(actor: Actor, closeDate: string) {
  assertCanView(actor, 'finance');
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
  if (!actor.roles.includes('owner')) throw new ForbiddenError('fiscal.recompute');

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
