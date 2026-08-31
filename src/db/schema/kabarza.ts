import { index, integer, text, date, pgTable, jsonb, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, money, ts, stamps } from './_shared';
import { currencies } from './base';
import { users } from './access';
import { ledger } from './finance';
import { projects } from './projects';

/**
 * گروه ۶ — جدول‌های Kabarza OS.
 * از روزِ اول ساخته می‌شوند و تا رسیدنِ فازشان خالی می‌مانند (DATA-MODEL.md).
 * دلیل: افزودنِ جدولِ خالی ارزان است؛ بازنویسیِ گزارش‌ها بعداً گران.
 */

export const INVOICE_DIRECTIONS = ['incoming', 'outgoing'] as const;

/**
 * فاکتور. PRD ۶.۴ — وضعیتِ پرداخت **استنتاجی** است:
 * فاکتورِ تطبیق‌یافته با تراکنش = پرداخت‌شده. هیچ‌کس فیلدِ وضعیت را دستی نگه نمی‌دارد.
 */
export const invoices = pgTable('invoices', {
  id: pk(),
  direction: text('direction').notNull().$type<'incoming' | 'outgoing'>(),
  number: text('number'),
  counterpartyType: text('counterparty_type'),
  counterpartyId: fk('counterparty_id'),
  issueDate: date('issue_date', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }),
  currencyId: fk('currency_id').references(() => currencies.id),
  amountNet: money('amount_net').notNull().default('0'),
  amountVat: money('amount_vat').notNull().default('0'),
  amountGross: money('amount_gross').notNull().default('0'),
  projectId: fk('project_id').references(() => projects.id),
  /** درزِ صفِ بازبینی — ایجنت فقط draft می‌سازد. */
  status: text('status').notNull().default('confirmed').$type<'draft' | 'confirmed'>(),
  /** تطبیقِ خودکار (PRD ۶.۴) — پرشدنش یعنی پرداخت‌شده. */
  matchedLedgerId: fk('matched_ledger_id').references(() => ledger.id),
  sourceFile: text('source_file'),
  sourceHash: text('source_hash'),
  ...stamps,
}, (t) => [
  check('invoices_direction_ck', sql`${t.direction} in ('incoming','outgoing')`),
  check('invoices_status_ck', sql`${t.status} in ('draft','confirmed')`),
  index('invoices_matched_ix').on(t.matchedLedgerId),
  index('invoices_due_ix').on(t.dueDate),
]);

export const IMPORT_SOURCES = ['gls', 'wise', 'manual', 'agent'] as const;

/**
 * ورودِ داده. R-ARCH — idempotency:
 * هشِ فایل یکتاست تا پردازشِ دوبارهٔ همان فایل بی‌اثر باشد (PRD ۱۰.۲ §۳).
 */
export const imports = pgTable('imports', {
  id: pk(),
  source: text('source').notNull().$type<'gls' | 'wise' | 'manual' | 'agent'>(),
  fileName: text('file_name').notNull().default(''),
  fileHash: text('file_hash').notNull(),
  periodStart: date('period_start', { mode: 'string' }),
  periodEnd: date('period_end', { mode: 'string' }),
  rowCount: integer('row_count').notNull().default(0),
  duplicateCount: integer('duplicate_count').notNull().default(0),
  createdBy: fk('created_by').references(() => users.id),
  ...stamps,
}, (t) => [
  check('imports_source_ck', sql`${t.source} in ('gls','wise','manual','agent')`),
  uniqueIndex('imports_file_hash_uq').on(t.fileHash),
]);

export const DEAL_STAGES = ['lead', 'talking', 'proposal', 'won', 'lost'] as const;

/** CRM — PRD ۷. پیش‌بینیِ وزن‌دار = expectedValue × probability. */
export const deals = pgTable('deals', {
  id: pk(),
  clientId: fk('client_id').references(() => users.id),
  title: text('title').notNull(),
  expectedValue: money('expected_value').notNull().default('0'),
  currencyId: fk('currency_id').references(() => currencies.id),
  probability: integer('probability').notNull().default(0),
  expectedCloseDate: date('expected_close_date', { mode: 'string' }),
  stage: text('stage').notNull().default('lead').$type<'lead' | 'talking' | 'proposal' | 'won' | 'lost'>(),
  /** دیل برنده به پروژه وصل می‌شود (زنجیرهٔ دیل ← پروژه ← فاکتور ← نقد). */
  projectId: fk('project_id').references(() => projects.id),
  ...stamps,
}, (t) => [
  check('deals_stage_ck', sql`${t.stage} in ('lead','talking','proposal','won','lost')`),
  check('deals_probability_ck', sql`${t.probability} between 0 and 100`),
  index('deals_stage_ix').on(t.stage),
]);

/** موتورِ قواعدِ دسته‌بندی — PRD ۶.۴. */
export const rules = pgTable('rules', {
  id: pk(),
  name: text('name').notNull().default(''),
  match: jsonb('match').notNull(),
  apply: jsonb('apply').notNull(),
  hits: integer('hits').notNull().default(0),
  lastUsedAt: ts('last_used_at'),
  ...stamps,
});

/** جدولِ نرخِ مالیات — PRD ۶.۶: «داده، نه کد» (به‌روزرسانیِ سالانه بدونِ دیپلوی). */
export const taxTables = pgTable('tax_tables', {
  id: pk(),
  year: integer('year').notNull(),
  kind: text('kind').notNull().$type<'grundtabelle' | 'vat'>(),
  data: jsonb('data').notNull(),
  ...stamps,
}, (t) => [
  check('tax_tables_kind_ck', sql`${t.kind} in ('grundtabelle','vat')`),
  uniqueIndex('tax_tables_uq').on(t.year, t.kind),
]);
