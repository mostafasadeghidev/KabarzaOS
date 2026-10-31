import { boolean, index, text, date, pgTable, check, integer, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, money, ts, stamps } from './_shared';
import { currencies, tags, vendors } from './base';
import { users } from './access';
import { accounts, ledger } from './finance';
import { projects, unitEntries } from './projects';

/** گروه ۴ (ادامه) — پرداخت‌ها. قواعد در rules/TEAM-MONEY.md */

export const PAYMENT_DIRECTIONS = ['incoming', 'member_payout', 'project_expense'] as const;

/**
 * آینهٔ پرداختِ یک تراکنشِ پروژه‌ای (R-LEDGER-07).
 * R-TEAM-01 — «مبلغِ تسویه‌شده» بر «مبلغِ اسمی» مقدم است.
 */
export const projectPayments = pgTable('project_payments', {
  id: pk(),
  /**
   * ⚠️ R-PROJ-03 — می‌تواند خالی باشد: «جداسازی» پروژه را از تراکنش جدا می‌کند
   * ولی خودِ تراکنش می‌ماند و در «پرداخت‌های بی‌پروژه» دیده می‌شود.
   * `set null` هم عمدی است — حذفِ پروژه نباید هرگز پول را با خودش ببرد.
   */
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: fk('user_id').references(() => users.id),
  ledgerId: fk('ledger_id').references(() => ledger.id, { onDelete: 'cascade' }),
  accountId: fk('account_id').references(() => accounts.id),
  /**
   * ⚠️ چهار جهت، نه سه: `project_expense` به کارفرما صورتحساب می‌شود و
   * `project_cost` هزینهٔ **جذب‌شده** است که به بدهیِ او اضافه نمی‌شود.
   */
  direction: text('direction').notNull()
    .$type<'incoming' | 'member_payout' | 'project_expense' | 'project_cost'>(),
  type: text('type').notNull().default('payment'),
  amount: money('amount').notNull().default('0'),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  /** R-TEAM-01 — آنچه واقعاً تسویه شد؛ بر amount مقدم است. */
  amountSettled: money('amount_settled'),
  settledCurrencyId: fk('settled_currency_id').references(() => currencies.id),
  amountEur: money('amount_eur').notNull().default('0'),
  /** روزِ پرداخت — تاریخ، نه مهرِ زمانی (R-DATA-02؛ مهاجرت ۰۰۲۴). */
  paidAt: date('paid_at', { mode: 'string' }).notNull(),
  note: text('note').notNull().default(''),
  ...stamps,
}, (t) => [
  check(
    'project_payments_direction_ck',
    sql`${t.direction} in ('incoming','member_payout','project_expense','project_cost')`,
  ),
  index('project_payments_project_ix').on(t.projectId, t.direction),
  index('project_payments_user_ix').on(t.userId),
  index('project_payments_ledger_ix').on(t.ledgerId),
]);

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'paid'] as const;

/**
 * درخواستِ پرداختِ عضو. چرخه: pending → approved → paid (یا rejected).
 * R-TEAM-06 — سقفِ درخواستِ جدید بر اساس درخواست‌های «باز» محدود می‌شود.
 * R-TEAM-10 — «پرداخت‌شده» بدونِ ledgerId معنا ندارد.
 */
export const paymentRequests = pgTable('payment_requests', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  amount: money('amount').notNull(),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  note: text('note').notNull().default(''),
  status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'rejected' | 'paid'>(),
  decisionNote: text('decision_note').notNull().default(''),
  ledgerId: fk('ledger_id').references(() => ledger.id),
  /** R-TEAM-08 — پرداخت، ردیفِ کارِ تعدادی را هم می‌بندد. */
  unitEntryId: fk('unit_entry_id').references(() => unitEntries.id),
  decidedBy: fk('decided_by').references(() => users.id),
  decidedAt: ts('decided_at'),
  ...stamps,
}, (t) => [
  check('payment_requests_status_ck', sql`${t.status} in ('pending','approved','rejected','paid')`),
  // R-TEAM-10 — وضعیتِ paid همیشه باید تراکنشِ بانکی داشته باشد.
  check('payment_requests_paid_needs_ledger_ck', sql`${t.status} <> 'paid' or ${t.ledgerId} is not null`),
  index('payment_requests_status_ix').on(t.status),
  index('payment_requests_user_project_ix').on(t.userId, t.projectId, t.status),
  index('payment_requests_project_ix').on(t.projectId),
]);

/**
 * قسط‌های یک ردیفِ کارکرد (۲.۲۵.۰) — هر قسط به ردیفِ دفترِ خودش وصل است و با
 * حذفِ آن ردیف می‌رود؛ `unit_entries.paid_amount` جمعِ همین‌هاست.
 */
export const unitPayments = pgTable('unit_payments', {
  id: pk(),
  unitEntryId: fk('unit_entry_id').notNull().references(() => unitEntries.id, { onDelete: 'cascade' }),
  ledgerId: fk('ledger_id').references(() => ledger.id, { onDelete: 'cascade' }),
  /** در ارزِ خودِ ردیفِ کارکرد. */
  amount: money('amount').notNull(),
  paidAt: date('paid_at', { mode: 'string' }).notNull(),
  createdBy: fk('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  check('unit_payments_amount_ck', sql`${t.amount} > 0`),
  index('unit_payments_unit_ix').on(t.unitEntryId),
]);

export const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const;

export const recurringExpenses = pgTable('recurring_expenses', {
  id: pk(),
  title: text('title').notNull(),
  amount: money('amount').notNull().default('0'),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  accountId: fk('account_id').references(() => accounts.id),
  vendorId: fk('vendor_id').references(() => vendors.id),
  categoryTagId: fk('category_tag_id').references(() => tags.id),
  kind: text('kind').notNull().default('recurring'),
  intervalUnit: text('interval_unit').notNull().default('month').$type<'day' | 'week' | 'month' | 'year'>(),
  intervalCount: integer('interval_count').notNull().default(1),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  nextDueDate: date('next_due_date', { mode: 'string' }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  note: text('note').notNull().default(''),
  /** GAP بستهٔ ۶ — پرچم‌های صرفه‌جویی. */
  shouldCancel: boolean('should_cancel').notNull().default(false),
  canLiveWithout: boolean('can_live_without').notNull().default(false),
  providerUrl: text('provider_url'),
  /**
   * اشتراکی که برای یک عضو پرداخت می‌شود (۲.۴۹.۰) — هر نوبتِ «ثبتِ پرداخت»،
   * سهمِ او (`chargePct` درصد) به بدهی‌اش در «حسابِ اعضا» اضافه می‌شود.
   */
  chargeUserId: fk('charge_user_id').references(() => users.id, { onDelete: 'set null' }),
  chargePct: numeric('charge_pct', { precision: 5, scale: 2, mode: 'string' }).notNull().default('100'),
  ...stamps,
}, (t) => [
  check('recurring_interval_unit_ck', sql`${t.intervalUnit} in ('day','week','month','year')`),
  index('recurring_due_ix').on(t.nextDueDate, t.isActive),
]);

export const MEMBER_ACCOUNT_KINDS = ['loan', 'gift', 'charge', 'repayment', 'offset', 'forgive'] as const;
export type MemberAccountKind = (typeof MEMBER_ACCOUNT_KINDS)[number];

/**
 * حسابِ اعضا (۲.۴۹.۰) — قرض، هدیه، هزینه‌ای که شرکت برای عضو داد، و تسویه‌شان.
 * بدهی = قرض + هزینه − بازپرداخت − کسر از دستمزد − بخشیده؛ هدیه بدهی نمی‌سازد.
 *
 * ⚠️ پولِ واقعی همیشه در `ledger` است (`ledgerId`)؛ این جدول فقط می‌گوید آن پول
 * «طلب» است یا «هدیه». حذفِ ردیفِ دفتر این را هم می‌برد (cascade) تا بدهیِ بی‌پول نماند.
 * ⚠️ کسر از دستمزد پولِ نقد ندارد: یک ردیفِ پرداختِ پروژه (`paymentId`) بی‌ردیفِ دفتر
 * می‌سازد تا طلبِ عضو از پروژه هم به همان اندازه کم شود.
 */
export const memberAccountEntries = pgTable('member_account_entries', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull().$type<MemberAccountKind>(),
  amount: money('amount').notNull(),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  amountEur: money('amount_eur').notNull().default('0'),
  /** سهمِ عضو از ردیفِ دفتر — مبلغ = مبلغِ ردیف × درصد. */
  sharePct: numeric('share_pct', { precision: 5, scale: 2, mode: 'string' }).notNull().default('100'),
  entryDate: date('entry_date', { mode: 'string' }).notNull(),
  /** موعدِ برگشتِ قرض — فقط یادآوری است. */
  dueDate: date('due_date', { mode: 'string' }),
  note: text('note').notNull().default(''),
  ledgerId: fk('ledger_id').references(() => ledger.id, { onDelete: 'cascade' }),
  paymentId: fk('payment_id').references(() => projectPayments.id, { onDelete: 'cascade' }),
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'set null' }),
  recurringExpenseId: fk('recurring_expense_id').references(() => recurringExpenses.id, { onDelete: 'set null' }),
  /** قسطِ قرض که از حقوقِ یک ماه کم شد (۲.۵۰.۰) — با حذفِ آن پرداخت برمی‌گردد. */
  salaryPaymentId: fk('salary_payment_id').references(() => salaryPayments.id, { onDelete: 'cascade' }),
  createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps,
}, (t) => [
  check('member_account_kind_ck', sql`${t.kind} in ('loan','gift','charge','repayment','offset','forgive')`),
  check('member_account_amount_ck', sql`${t.amount} > 0`),
  check('member_account_share_ck', sql`${t.sharePct} > 0 and ${t.sharePct} <= 100`),
  index('member_account_user_ix').on(t.userId, t.entryDate),
  index('member_account_ledger_ix').on(t.ledgerId),
  index('member_account_payment_ix').on(t.paymentId),
]);

/**
 * حقوقِ ماهانه (۲.۵۰.۰) — هر ردیف یک **دوره**: مبلغِ ثابت از `startMonth` تا
 * `endMonth` (خالی = ادامه دارد). توقف دوره را می‌بندد و ادامه دورهٔ تازه می‌سازد،
 * پس تاریخچهٔ ماه‌های با حقوق و بی‌حقوق می‌ماند. ماه‌ها روزِ اولِ ماه‌اند.
 */
export const memberSalaries = pgTable('member_salaries', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id),
  amount: money('amount').notNull(),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  payDay: integer('pay_day').notNull().default(1),
  accountId: fk('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  startMonth: date('start_month', { mode: 'string' }).notNull(),
  endMonth: date('end_month', { mode: 'string' }),
  note: text('note').notNull().default(''),
  createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps,
}, (t) => [
  check('member_salary_amount_ck', sql`${t.amount} > 0`),
  check('member_salary_day_ck', sql`${t.payDay} between 1 and 28`),
  index('member_salary_user_ix').on(t.userId, t.startMonth),
  uniqueIndex('member_salary_open_ux').on(t.userId).where(sql`end_month is null`),
]);

/** پرداختِ حقوقِ یک ماه — مبلغِ پایه عکسِ لحظهٔ پرداخت است. */
export const salaryPayments = pgTable('salary_payments', {
  id: pk(),
  salaryId: fk('salary_id').notNull().references(() => memberSalaries.id),
  userId: fk('user_id').notNull().references(() => users.id),
  month: date('month', { mode: 'string' }).notNull(),
  baseAmount: money('base_amount').notNull(),
  bonus: money('bonus').notNull().default('0'),
  deduction: money('deduction').notNull().default('0'),
  installment: money('installment').notNull().default('0'),
  netAmount: money('net_amount').notNull(),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  paidAt: date('paid_at', { mode: 'string' }).notNull(),
  ledgerId: fk('ledger_id').references(() => ledger.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  createdBy: fk('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps,
}, (t) => [
  check('salary_payment_net_ck', sql`${t.netAmount} > 0`),
  uniqueIndex('salary_payment_month_ux').on(t.userId, t.month),
  index('salary_payment_ledger_ix').on(t.ledgerId),
  index('salary_payment_salary_ix').on(t.salaryId),
]);
