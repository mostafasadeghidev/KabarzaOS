import { boolean, index, integer, text, uniqueIndex, date, pgTable, jsonb, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, rate, stamps } from './_shared';

/** گروه ۱ — پایه (DATA-MODEL.md) */

export const currencies = pgTable('currencies', {
  id: pk(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull().default(''),
  /** R-MONEY-02 — تعدادِ اعشار از خودِ ارز می‌آید (تومان = ۰). */
  decimals: integer('decimals').notNull().default(2),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...stamps,
}, (t) => [uniqueIndex('currencies_code_uq').on(t.code)]);

export const exchangeRates = pgTable('exchange_rates', {
  id: pk(),
  fromCurrencyId: fk('from_currency_id').notNull().references(() => currencies.id),
  toCurrencyId: fk('to_currency_id').notNull().references(() => currencies.id),
  rate: rate('rate').notNull(),
  effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
  ...stamps,
}, (t) => [
  // نسخهٔ قبلی ردیفِ تکراری می‌گرفت و یک مایگریشنِ dedupe لازم شد — اینجا از اول یکتا.
  uniqueIndex('exchange_rates_pair_date_uq').on(t.fromCurrencyId, t.toCurrencyId, t.effectiveDate),
  index('exchange_rates_lookup_ix').on(t.fromCurrencyId, t.toCurrencyId, t.effectiveDate),
]);

export const offices = pgTable('offices', {
  id: pk(),
  name: text('name').notNull(),
  location: text('location').notNull().default(''),
  defaultCurrencyId: fk('default_currency_id').references(() => currencies.id),
  isActive: boolean('is_active').notNull().default(true),
  ...stamps,
});

export const vendors = pgTable('vendors', {
  id: pk(),
  name: text('name').notNull(),
  note: text('note').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  ...stamps,
});

/**
 * تگ‌ها — چندریختی (D-014 §۳).
 * یک جدول برای: نقشِ عضو، دستهٔ هزینه، وضعیتِ پروژه، وضعیت و اولویتِ تسک.
 * R-PROJ-16 — منطق باید به status_group تکیه کند، نه به نام.
 */
export const TAG_TYPES = ['member_role', 'ledger_category', 'project_status', 'task_status', 'task_priority'] as const;
export type TagType = (typeof TAG_TYPES)[number];

export const tags = pgTable('tags', {
  id: pk(),
  name: text('name').notNull(),
  /** ترجمهٔ نام به ۹ زبان (در نسخهٔ قبلی رشتهٔ سریال‌شده بود). */
  nameI18n: jsonb('name_i18n').$type<Record<string, string>>(),
  slug: text('slug').notNull().default(''),
  type: text('type').notNull().$type<TagType>(),
  color: text('color').notNull().default(''),
  grantsCap: text('grants_cap').notNull().default(''),
  isClosed: boolean('is_closed').notNull().default(false),
  statusGroup: text('status_group').notNull().default(''),
  isReview: boolean('is_review').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isProtected: boolean('is_protected').notNull().default(false),
  ...stamps,
}, (t) => [
  // G9 — enum به‌صورتِ text + check.
  check('tags_type_ck', sql`${t.type} in ('member_role','ledger_category','project_status','task_status','task_priority')`),
  index('tags_type_ix').on(t.type, t.sortOrder),
]);

/** رابطهٔ چندریختیِ تگ: کاربر↔تگ، دفترکل↔تگ، … (R-DATA-03) */
export const TAG_OBJECT_TYPES = ['user', 'ledger', 'project'] as const;
export type TagObjectType = (typeof TAG_OBJECT_TYPES)[number];

export const tagRelations = pgTable('tag_relations', {
  id: pk(),
  tagId: fk('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  objectId: fk('object_id').notNull(),
  objectType: text('object_type').notNull().$type<TagObjectType>(),
  ...stamps,
}, (t) => [
  check('tag_relations_object_type_ck', sql`${t.objectType} in ('user','ledger','project')`),
  uniqueIndex('tag_relations_uq').on(t.tagId, t.objectId, t.objectType),
  index('tag_relations_object_ix').on(t.objectType, t.objectId),
]);
