import { bigint, check, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stamps } from './_shared';
import { files } from './files';

/**
 * مشخصاتِ شرکت — صادرکنندهٔ فاکتور.
 *
 * ⚠️ جدولِ **جدا** از تنظیماتِ عمومی، به همان دلیلی که نسخهٔ قبلی آپشنِ جدا
 * داشت: ذخیرهٔ تنظیماتِ عمومی کلِ رکورد را بازنویسی می‌کند و این فیلدها را
 * پاک می‌کرد. تک‌ردیفی است.
 */
export const company = pgTable('company', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull().default(''),
  address: text('address').notNull().default(''),
  taxId: text('tax_id').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  /**
   * متنِ ساده، نه URL ِ اجباری.
   * ⚠️ اجبارِ `https://` روی «example.com» آدرس را روی فاکتور شلوغ می‌کند —
   * همان تصمیمِ نسخهٔ قبلی.
   */
  website: text('website').notNull().default(''),
  bank: text('bank').notNull().default(''),
  invoiceFooter: text('invoice_footer').notNull().default(''),
  logoFileId: bigint('logo_file_id', { mode: 'number' }).references(() => files.id),
  ...stamps,
}, (t) => [check('company_singleton_ck', sql`${t.id} = 1`)]);
