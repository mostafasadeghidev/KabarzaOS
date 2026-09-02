import { uniqueIndex, boolean, index, integer, text, date, pgTable, check, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, money, rate, ts, stamps, scope } from './_shared';
import { currencies, offices, vendors } from './base';
import { users } from './access';

/** گروه ۴ — مالی. حساس‌ترین بخش؛ قواعد در rules/LEDGER.md و FISCAL.md */

export const ACCOUNT_TYPES = ['business', 'personal'] as const;

export const accounts = pgTable('accounts', {
  id: pk(),
  name: text('name').notNull(),
  /** R-LEDGER-13 — حسابِ کاری یا شخصی. */
  type: text('type').notNull().default('business').$type<'business' | 'personal'>(),
  officeId: fk('office_id').references(() => offices.id),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  openingBalance: money('opening_balance').notNull().default('0'),
  note: text('note').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  scope: scope(),
  ...stamps,
}, (t) => [
  check('accounts_type_ck', sql`${t.type} in ('business','personal')`),
  check('accounts_scope_ck', sql`${t.scope} in ('company','private')`),
]);

/** حسابدارِ محدود فقط حساب‌های تخصیص‌یافته را می‌بیند. */
export const accountUsers = pgTable('account_users', {
  id: pk(),
  accountId: fk('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...stamps,
}, (t) => [
  // یک تخصیص به‌ازای هر کاربر در هر حساب (مهاجرت ۰۰۲۲).
  uniqueIndex('account_users_account_user_uq').on(t.accountId, t.userId),
]);

export const DIRECTIONS = ['in', 'out'] as const;
export const LEDGER_STATUSES = ['draft', 'confirmed'] as const;
export const VAT_DIRECTIONS = ['input', 'output'] as const;

/**
 * دفترکل — قلبِ سیستمِ مالی.
 * چهار مبلغ ذخیره می‌شود (R-LEDGER-01/02/03) و نرخ روی خودِ ردیف منجمد است.
 */
export const ledger = pgTable('ledger', {
  id: pk(),
  accountId: fk('account_id').notNull().references(() => accounts.id),
  officeId: fk('office_id').references(() => offices.id),
  /** G4 — تاریخِ «روز»، نه زمان (R-DATA-02، قفلِ مالی رشته‌ای مقایسه می‌شود). */
  entryDate: date('entry_date', { mode: 'string' }).notNull(),
  direction: text('direction').notNull().$type<'in' | 'out'>(),
  description: text('description').notNull().default(''),

  /** مبلغ در ارزی که کاربر وارد کرده. */
  amount: money('amount').notNull(),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  /** R-LEDGER-02 — مرجعِ محاسبهٔ مانده. */
  amountAccount: money('amount_account').notNull(),
  /** گزارشِ منطقه‌ای. */
  amountOffice: money('amount_office').notNull().default('0'),
  /** پایهٔ گزارشِ بین‌ارزی — منجمد (R-FISCAL-08). */
  amountEur: money('amount_eur').notNull().default('0'),
  /** R-LEDGER-01/03 — نرخِ واقعیِ استفاده‌شده، نه نرخِ بازار. */
  exchangeRate: rate('exchange_rate').notNull().default('1'),

  payerUserId: fk('payer_user_id').references(() => users.id),
  payerLabel: text('payer_label').notNull().default(''),
  receiverUserId: fk('receiver_user_id').references(() => users.id),
  receiverLabel: text('receiver_label').notNull().default(''),

  projectId: fk('project_id'),
  vendorId: fk('vendor_id').references(() => vendors.id),
  /** R-LEDGER-04 — دو لِگِ یک انتقال با این گروه به هم وصل می‌شوند. */
  transferGroup: text('transfer_group'),
  /** آرایهٔ واقعی (در نسخهٔ قبلی CSV بود). */
  receiptIds: bigint('receipt_ids', { mode: 'number' }).array(),

  /** درز ۱ — صفِ بازبینی. پیش‌فرض confirmed تا رفتارِ فعلی حفظ شود. */
  status: text('status').notNull().default('confirmed').$type<'draft' | 'confirmed'>(),
  /** درز ۲ — شرکتی/شخصی. */
  scope: scope(),
  /** درز ۳ — مالیاتِ آلمان (بستهٔ ۴ GAP). */
  vatRate: money('vat_rate'),
  amountNet: money('amount_net'),
  amountVat: money('amount_vat'),
  vatDirection: text('vat_direction').$type<'input' | 'output'>(),
  /** درز ۵ — ایجنت و ضدتکرارِ ایمپورت. */
  sourceHash: text('source_hash'),
  sourceFile: text('source_file'),
  confidence: integer('confidence'),

  createdBy: fk('created_by').references(() => users.id),
  ...stamps,
}, (t) => [
  check('ledger_direction_ck', sql`${t.direction} in ('in','out')`),
  check('ledger_status_ck', sql`${t.status} in ('draft','confirmed')`),
  check('ledger_scope_ck', sql`${t.scope} in ('company','private')`),
  check('ledger_vat_direction_ck', sql`${t.vatDirection} is null or ${t.vatDirection} in ('input','output')`),
  // اندیس‌های اجباریِ DATA-MODEL.md
  index('ledger_account_date_ix').on(t.accountId, t.entryDate),
  index('ledger_project_ix').on(t.projectId),
  index('ledger_transfer_group_ix').on(t.transferGroup),
  index('ledger_status_ix').on(t.status),
  index('ledger_scope_ix').on(t.scope),
  index('ledger_source_hash_ix').on(t.sourceHash),
]);

/**
 * قفلِ دورهٔ مالی — در نسخهٔ قبلی یک option بود؛ اینجا جدول تا تاریخچه و ممیزی داشته باشد
 * (R-FISCAL-11). ردیفِ فعال = جدیدترین.
 */
export const fiscalLocks = pgTable('fiscal_locks', {
  id: pk(),
  lockDate: date('lock_date', { mode: 'string' }),
  setBy: fk('set_by').references(() => users.id),
  note: text('note').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** خلاصهٔ منجمدِ دورهٔ بسته — یک ردیف به‌ازای هر حساب (R-FISCAL-09). */
export const fiscalClosings = pgTable('fiscal_closings', {
  id: pk(),
  closeDate: date('close_date', { mode: 'string' }).notNull(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  accountId: fk('account_id').notNull().references(() => accounts.id),
  currencyId: fk('currency_id').references(() => currencies.id),
  deposits: money('deposits').notNull().default('0'),
  withdrawals: money('withdrawals').notNull().default('0'),
  closingBalance: money('closing_balance').notNull().default('0'),
  depositsEur: money('deposits_eur').notNull().default('0'),
  withdrawalsEur: money('withdrawals_eur').notNull().default('0'),
  clientReceivedEur: money('client_received_eur').notNull().default('0'),
  memberPaidEur: money('member_paid_eur').notNull().default('0'),
  expensesEur: money('expenses_eur').notNull().default('0'),
  closingBalanceEur: money('closing_balance_eur').notNull().default('0'),
  createdBy: fk('created_by').references(() => users.id),
  ...stamps,
}, (t) => [index('fiscal_closings_date_ix').on(t.closeDate, t.accountId)]);
