import { bigint, numeric, timestamp, text } from 'drizzle-orm/pg-core';

/**
 * ستون‌های مشترک — قواعدِ سراسریِ DATA-MODEL.md
 * G1 کلیدِ bigint identity · G3 زمان‌ها timestamptz در UTC · G5 مهرِ زمانی
 */

/** G1 — کلیدِ اصلی. */
export const pk = () =>
  bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

/** G1 — ارجاعِ کلیدِ خارجی (نوعِ هم‌خوان با pk). */
export const fk = (name: string) => bigint(name, { mode: 'number' });

/**
 * G2 — پول. همیشه numeric(20,4)، هرگز float.
 * mode 'string' تا JS عددِ اعشاری را خراب نکند (R-MONEY / R-TEAM-02).
 */
export const money = (name: string) =>
  numeric(name, { precision: 20, scale: 4, mode: 'string' });

/** نرخِ ارز — دقتِ بیشتر (R-LEDGER-01). */
export const rate = (name: string) =>
  numeric(name, { precision: 20, scale: 8, mode: 'string' });

/** G3 — زمانِ رویداد: timestamptz، ذخیره در UTC. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** G5 — مهرِ زمانیِ استاندارد. */
export const stamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
};

/** G6 — حذفِ نرم برای جدول‌های کاربرمحور. */
export const softDelete = { deletedAt: ts('deleted_at') };

/**
 * درزِ scope (D-014 §۱) — از روزِ اول همه‌جا، پیش‌فرض company.
 * G9 — enum به‌صورتِ text + check (checkها در تعریفِ جدول اضافه می‌شوند).
 */
export const SCOPES = ['company', 'private'] as const;
export type Scope = (typeof SCOPES)[number];
export const scope = () => text('scope').notNull().default('company').$type<Scope>();
