import { boolean, index, text, date, pgTable, check, integer } from 'drizzle-orm/pg-core';
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
  type: text('type').notNull().default(''),
  amount: money('amount').notNull().default('0'),
  currencyId: fk('currency_id').references(() => currencies.id),
  /** R-TEAM-01 — آنچه واقعاً تسویه شد؛ بر amount مقدم است. */
  amountSettled: money('amount_settled'),
  settledCurrencyId: fk('settled_currency_id').references(() => currencies.id),
  amountEur: money('amount_eur').notNull().default('0'),
  paidAt: ts('paid_at'),
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
  currencyId: fk('currency_id').references(() => currencies.id),
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
]);

export const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const;

export const recurringExpenses = pgTable('recurring_expenses', {
  id: pk(),
  title: text('title').notNull(),
  amount: money('amount').notNull().default('0'),
  currencyId: fk('currency_id').references(() => currencies.id),
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
  ...stamps,
}, (t) => [
  check('recurring_interval_unit_ck', sql`${t.intervalUnit} in ('day','week','month','year')`),
  index('recurring_due_ix').on(t.nextDueDate, t.isActive),
]);
