import { date, integer, pgTable, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { fk, pk, stamps, ts } from './_shared';
import { users } from './access';
import { projects } from './projects';

/**
 * تایمرِ کار — یک ردیف برای هر کاربر.
 *
 * ⚠️ سمتِ سرور است: فقط لحظهٔ شروع نگه داشته می‌شود و مدت هنگامِ توقف حساب
 * می‌شود، پس بستنِ تبِ مرورگر چیزی را از بین نمی‌برد.
 */
export const workTimers = pgTable('work_timers', {
  userId: fk('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  /** null یعنی ساعتِ **عمومی** (بدونِ پروژه)، نه «بدونِ مقدار». */
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  startedAt: ts('started_at'),
  /** پارک‌شده — بیش از ۵ ساعت، منتظرِ تأییدِ کاربر. */
  pendingMinutes: integer('pending_minutes'),
  pendingLogDate: date('pending_log_date', { mode: 'string' }),
  /** یادآوریِ «تایمرت روشن مانده» فرستاده شد؛ با توقف پاک می‌شود. */
  remindedAt: ts('reminded_at'),
  ...stamps,
}, (t) => [
  // یا در حالِ شمارش، یا پارک‌شده — هرگز هر دو.
  check('work_timers_state_ck',
    sql`(${t.startedAt} is not null) <> (${t.pendingMinutes} is not null)`),
]);

/** در دسترس بودنِ هفتگی — ترتیبِ هفته ایرانی: ۰ = شنبه … ۶ = جمعه. */
export const availabilitySlots = pgTable('availability_slots', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  fromTime: text('from_time').notNull(),
  toTime: text('to_time').notNull(),
  ...stamps,
}, (t) => [
  index('availability_user_ix').on(t.userId, t.weekday),
  check('availability_weekday_ck', sql`${t.weekday} between 0 and 6`),
  check('availability_range_ck', sql`${t.fromTime} < ${t.toTime}`),
]);

/**
 * مهرهای زمان‌بند — «آخرین بار که این کار برای این کلید اجرا شد».
 *
 * ⚠️ یک ردیفِ **بازنویسی‌شونده** برای هر کلید، نه یک ردیف در روز: تلنگرِ
 * روزانه نباید دنباله‌ای از ردیف در دیتابیس بگذارد (همان تصمیمِ نسخهٔ قبلی).
 */
export const schedulerStamps = pgTable('scheduler_stamps', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
