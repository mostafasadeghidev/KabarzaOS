import { check, date, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, ts, stamps } from './_shared';
import { tags } from './base';
import { serviceGrants, services, users } from './access';

/**
 * آنبوردینگِ نقش‌محور — «عضوِ تازه روزهای اول چه کارهایی دارد و هر کار با کیست».
 *
 * دو جدول، مثلِ الگوی `qa_items` ← `project_qa`:
 *  · `onboarding_items` کتابخانه است (تنظیمات)؛
 *  · `onboarding_tasks` نسخهٔ هر عضو است — **عکسِ** آیتم در لحظهٔ شروع، تا
 *    ویرایش یا حذفِ کتابخانه چک‌لیستِ کسی را که وسطِ کار است عوض نکند.
 *
 * ⚠️ هیچ اعتبارنامه‌ای اینجا نمی‌نشیند (قیدِ سیاههٔ دسترسی). آیتمِ «دسترسی»
 * فقط به سرویس اشاره می‌کند و با تیک، یک گرنت در `service_grants` ثبت می‌شود.
 */

export const ONBOARDING_KINDS = ['learn', 'task', 'access', 'meeting', 'document'] as const;
export type OnboardingKind = (typeof ONBOARDING_KINDS)[number];

/** چه کسی کار را انجام می‌دهد — در لحظهٔ شروع به یک نفرِ مشخص تبدیل می‌شود. */
export const ONBOARDING_ASSIGNEES = ['member', 'office_manager', 'service_owner', 'user'] as const;
export type OnboardingAssignee = (typeof ONBOARDING_ASSIGNEES)[number];

export const onboardingItems = pgTable('onboarding_items', {
  id: pk(),
  /** تگِ نقش (`member_role`)؛ خالی = برای **همهٔ** نقش‌ها. */
  roleTagId: fk('role_tag_id').references(() => tags.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind').notNull().default('task').$type<OnboardingKind>(),
  assignee: text('assignee').notNull().default('member').$type<OnboardingAssignee>(),
  /** فقط وقتی `assignee = 'user'`. */
  assigneeUserId: fk('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  /** فقط برای `kind = 'access'` — سرویسی از سیاههٔ دسترسی‌ها. */
  serviceId: fk('service_id').references(() => services.id, { onDelete: 'set null' }),
  /** پیوندِ اختیاری — سندِ آموزشی، فرم، راهنما. */
  link: text('link').notNull().default(''),
  /** روزِ چندم از شروع (۱ = همان روز). */
  dueDay: integer('due_day').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  ...stamps,
}, (t) => [
  check('onboarding_items_kind_ck', sql`${t.kind} in ('learn','task','access','meeting','document')`),
  check('onboarding_items_assignee_ck', sql`${t.assignee} in ('member','office_manager','service_owner','user')`),
  check('onboarding_items_due_ck', sql`${t.dueDay} between 1 and 90`),
  index('onboarding_items_role_ix').on(t.roleTagId),
]);

export const onboardingTasks = pgTable('onboarding_tasks', {
  id: pk(),
  /** عضوِ تازه — چک‌لیست مالِ اوست. */
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** آیتمِ کتابخانه؛ خالی = آیتمِ ویژهٔ همین نفر (یا آیتمی که از کتابخانه حذف شد). */
  itemId: fk('item_id').references(() => onboardingItems.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind').notNull().default('task').$type<OnboardingKind>(),
  link: text('link').notNull().default(''),
  serviceId: fk('service_id').references(() => services.id, { onDelete: 'set null' }),
  /**
   * انجام‌دهنده، یک‌بار در لحظهٔ شروع حل می‌شود. خالی = هیچ‌کس پیدا نشد
   * (مثلاً دفتر مدیر ندارد) — آن‌وقت هر مدیرِ اعضا تیکش را می‌زند.
   */
  assigneeUserId: fk('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  doneAt: ts('done_at'),
  doneBy: fk('done_by').references(() => users.id, { onDelete: 'set null' }),
  /** گرنتی که تیکِ آیتمِ «دسترسی» ساخت — پیوند به سیاهه. */
  grantId: fk('grant_id').references(() => serviceGrants.id, { onDelete: 'set null' }),
  /** یادآوریِ «عقب‌افتاده» فقط یک بار — مهرش همین‌جاست. */
  overdueNotifiedAt: ts('overdue_notified_at'),
  ...stamps,
}, (t) => [
  check('onboarding_tasks_kind_ck', sql`${t.kind} in ('learn','task','access','meeting','document')`),
  // ⚠️ همگام‌سازی با کتابخانه تکراری نمی‌سازد: هر آیتم یک بار برای هر نفر.
  uniqueIndex('onboarding_tasks_item_uq').on(t.userId, t.itemId).where(sql`${t.itemId} is not null`),
  index('onboarding_tasks_user_ix').on(t.userId),
  index('onboarding_tasks_assignee_ix').on(t.assigneeUserId),
]);
