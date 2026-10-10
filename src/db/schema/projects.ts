import { bigint, boolean, index, integer, text, date, pgTable, jsonb, check, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, money, ts, stamps, softDelete, scope } from './_shared';
import { currencies, offices, tags } from './base';
import { users } from './access';
import { files } from './files';
import { onboardingItems } from './onboarding';

/** گروه ۳ — پروژه و کار. قواعد در rules/PROJECTS-TASKS.md */

export const projects = pgTable('projects', {
  id: pk(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  regDate: date('reg_date', { mode: 'string' }),
  deadline: date('deadline', { mode: 'string' }),
  statusTagId: fk('status_tag_id').references(() => tags.id),
  price: money('price').notNull().default('0'),
  currencyId: fk('currency_id').references(() => currencies.id),
  officeId: fk('office_id').references(() => offices.id),

  /** مناقصه — نگاشتِ نقش به سقفِ قیمت (R-TND-02). */
  isTender: boolean('is_tender').notNull().default(false),
  tenderRoles: jsonb('tender_roles').$type<Record<string, string | null>>(),
  /**
   * نقش‌هایی که مناقصه‌شان اعلام شده.
   * ⚠️ بدونِ این، هر ذخیرهٔ پروژه دوباره به همه پیام می‌داد (R-TENDER-14).
   */
  tenderAnnounced: bigint('tender_announced', { mode: 'number' }).array(),

  /** پروژهٔ تعدادی: دستمزد = نرخ × تعداد. */
  isUnitBased: boolean('is_unit_based').notNull().default(false),
  /**
   * پروژهٔ تعدادی: مسئولِ پروژه مبلغِ هر ردیفِ کارکرد را خودش بزند (۲.۲۰.۰)؟
   * خالی‌گذاشتنِ مبلغ هنوز از نرخِ توافقیِ عضو پیروی می‌کند. پیش‌فرض خاموش.
   */
  unitManualAmount: boolean('unit_manual_amount').notNull().default(false),

  /** R-PROJ-06 — بایگانی، قدمِ برگشت‌پذیرِ قبل از سبک‌سازی. */
  isArchived: boolean('is_archived').notNull().default(false),
  /** R-PROJ-07 — خلاصهٔ منجمد بعد از سبک‌سازی. */
  lightenSummary: jsonb('lighten_summary'),

  /** R-PROJ-20 — زیرپروژه، فقط یک سطح و بدونِ حلقه. */
  parentId: fk('parent_id'),

  scope: scope(),
  /** تصویرِ شاخصِ پروژه — همان «تصویر شاخص» نسخهٔ قبلی. */
  thumbnailFileId: fk('thumbnail_file_id').references(() => files.id),
  /** گروهِ تلگرامِ پروژه (۲.۱۴.۰) — رویدادهای پروژه آنجا هم می‌آیند؛ خالی = وصل نیست. */
  telegramGroupId: text('telegram_group_id').notNull().default(''),
  /** توکنِ یک‌بارمصرفِ وصل‌کردنِ گروه (لینکِ «افزودنِ ربات به گروه»). */
  telegramGroupToken: text('telegram_group_token'),
  /**
   * کدِ کوتاهِ پروژه (۲.۱۶.۰) — ارجاعِ تسک بیرون از پروژه: «ALZ-325».
   * یکتا (بی‌توجه به بزرگی/کوچکیِ حرف)؛ فقط حروف و ارقامِ لاتین.
   */
  code: text('code').notNull().default(''),
  /**
   * آخرین شمارهٔ تسکِ داده‌شده. ⚠️ فقط تریگرِ `tasks_assign_number` عوضش
   * می‌کند (مهاجرتِ ۰۰۴۹)؛ کدِ برنامه نه.
   */
  taskSeq: integer('task_seq').notNull().default(0),
  /** دامنهٔ اصلیِ سایتِ پروژه (۲.۱۹.۰) — خالی = ثبت نشده. همیشه با http(s) ذخیره می‌شود. */
  liveUrl: text('live_url').notNull().default(''),
  /** آدرسِ کاملِ سایتِ آزمایشی (مثلاً xxx.webflow.io) — خالی = ثبت نشده. */
  testUrl: text('test_url').notNull().default(''),
  /** کارفرما هر دو لینک را ببیند؟ پیش‌فرض نه — نشان‌دادنش تصمیمِ تیم است. */
  urlsClientVisible: boolean('urls_client_visible').notNull().default(false),
  ...stamps,
  ...softDelete,
}, (t) => [
  check('projects_scope_ck', sql`${t.scope} in ('company','private')`),
  check('projects_parent_not_self_ck', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  index('projects_status_ix').on(t.statusTagId),
  index('projects_parent_ix').on(t.parentId),
  index('projects_archived_ix').on(t.isArchived),
]);

/**
 * اعضای پروژه.
 * R-PROJ-09 — کلید (پروژه، کاربر، نقش) است، نه (پروژه، کاربر).
 * عضوِ دو-نقشه دو ردیف دارد و برای هر دو پول می‌گیرد؛ نقشِ تکراریِ سهوی
 * توسطِ همین یکتایی در سطحِ دیتابیس گرفته می‌شود، نه فقط در کد.
 */
export const projectMembers = pgTable('project_members', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  roleTagId: fk('role_tag_id').references(() => tags.id),
  agreedAmount: money('agreed_amount').notNull().default('0'),
  unitRate: money('unit_rate').notNull().default('0'),
  currencyId: fk('currency_id').references(() => currencies.id),
  assignedAt: ts('assigned_at').notNull().defaultNow(),
  /**
   * دسترسیِ این نفر به **همین** پروژه قطع است؟
   * ⚠️ ردیف می‌ماند (پول و سابقه)، فقط دیدن قطع می‌شود — راهِ میانیِ
   * «نه حذف، نه دسترسی».
   */
  accessBlocked: boolean('access_blocked').notNull().default(false),
  ...stamps,
}, (t) => [
  uniqueIndex('project_members_uq').on(t.projectId, t.userId, t.roleTagId),
  index('project_members_user_ix').on(t.userId),
]);

export const projectClients = pgTable('project_clients', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  /** همان قاعدهٔ `projectMembers.accessBlocked` برای کارفرما. */
  accessBlocked: boolean('access_blocked').notNull().default(false),
  ...stamps,
}, (t) => [
  uniqueIndex('project_clients_uq').on(t.projectId, t.userId),
  index('project_clients_user_ix').on(t.userId),
]);

export const tasks = pgTable('tasks', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  assignedTo: fk('assigned_to').references(() => users.id),
  createdBy: fk('created_by').notNull().references(() => users.id),
  /** R-PROJ-14 — فقط سازنده و مسئول (و مدیران). */
  isPrivate: boolean('is_private').notNull().default(false),
  statusTagId: fk('status_tag_id').references(() => tags.id),
  priorityTagId: fk('priority_tag_id').references(() => tags.id),
  dependsOn: fk('depends_on'),
  dueDate: date('due_date', { mode: 'string' }),
  /**
   * آیتمِ کتابخانهٔ QA که این تسک را ساخته — پورتِ نقشهٔ `META_TASKS`.
   * ⚠️ مبنای «قبلاً اعمال شده» است؛ حذفِ نرمِ تسک یعنی همان آیتم دوباره
   * قابلِ اعمال می‌شود.
   */
  qaItemId: fk('qa_item_id').references(() => qaItems.id),
  /**
   * موردِ یک بازبینی (۱.۱۱۶.۰) — با بازهٔ زمانیِ ویدئو (ثانیه) و بخشِ سایت.
   * حذفِ بازبینی پیوند را برمی‌دارد، تسک می‌ماند.
   */
  reviewId: fk('review_id').references(() => reviews.id, { onDelete: 'set null' }),
  reviewStart: integer('review_start'),
  reviewEnd: integer('review_end'),
  area: text('area').notNull().default(''),
  /**
   * شمارهٔ تسک در همان پروژه (۲.۱۶.۰) — «#325». ⚠️ تریگرِ پایگاه‌داده هنگامِ
   * درج می‌دهدش (۰ = «بده»)؛ هرگز دوباره داده نمی‌شود. کارفرما نمی‌بیندش.
   */
  number: integer('number').notNull().default(0),
  /**
   * ⚠️ پنهان از کارفرما — هر جا که کارفرما تسک می‌بیند. تسکِ بازبینیِ داخلی
   * این را از بازبینی به ارث می‌برد. عضو و مدیرِ پروژه همچنان می‌بینند.
   */
  clientHidden: boolean('client_hidden').notNull().default(false),
  updatedBy: fk('updated_by').references(() => users.id),
  scope: scope(),
  ...stamps,
  ...softDelete,
}, (t) => [
  check('tasks_scope_ck', sql`${t.scope} in ('company','private')`),
  index('tasks_project_ix').on(t.projectId),
  index('tasks_assigned_ix').on(t.assignedTo),
  index('tasks_status_ix').on(t.statusTagId),
  index('tasks_review_ix').on(t.reviewId).where(sql`${t.reviewId} is not null`),
  uniqueIndex('tasks_project_number_ux').on(t.projectId, t.number),
]);

export const REVIEW_SOURCES = ['video', 'loom', 'youtube', 'vimeo', 'upload', 'whatsapp', 'document', 'meeting', 'other'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/**
 * بازبینیِ پروژه — ویدئو یا هر منبعی که نتیجه‌اش فهرستِ کارهای اصلاحی است.
 * ⚠️ کارفرما فقط با `clientVisible` می‌بیند؛ پیش‌فرض خاموش.
 */
export const reviews = pgTable('reviews', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  source: text('source').notNull().default('video').$type<ReviewSource>(),
  /** پیوندِ لوم/یوتیوب/ویمئو؛ ویدئوی بارگذاری‌شده پیوستِ خودِ بازبینی است. */
  videoUrl: text('video_url'),
  notes: text('notes').notNull().default(''),
  clientVisible: boolean('client_visible').notNull().default(false),
  createdBy: fk('created_by').notNull().references(() => users.id),
  ...stamps,
}, (t) => [
  check('reviews_source_ck', sql`${t.source} in ('video','loom','youtube','vimeo','upload','whatsapp','document','meeting','other')`),
  index('reviews_project_ix').on(t.projectId),
]);

/** مخاطبِ بازبینی — نقش‌های عضو. هیچ ردیفی = کلِ تیمِ پروژه. */
export const reviewRoles = pgTable('review_roles', {
  reviewId: fk('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  roleTagId: fk('role_tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ name: 'review_roles_pk', columns: [t.reviewId, t.roleTagId] })]);

/** R-PROJ-13 — ساین‌کردن per-role است: هر نقش claimed_by جدا دارد. */
export const taskRoles = pgTable('task_roles', {
  id: pk(),
  taskId: fk('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  roleTagId: fk('role_tag_id').notNull().references(() => tags.id),
  claimedBy: fk('claimed_by').references(() => users.id),
  ...stamps,
}, (t) => [uniqueIndex('task_roles_uq').on(t.taskId, t.roleTagId)]);

export const COMMENT_TYPES = ['comment', 'review', 'task_note'] as const;

export const comments = pgTable('comments', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: fk('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  parentId: fk('parent_id'),
  userId: fk('user_id').notNull().references(() => users.id),
  type: text('type').notNull().default('comment').$type<'comment' | 'review' | 'task_note'>(),
  /** واژگانِ واقعی: needs_review | done (مهاجرت ۰۰۲۴؛ پیش از آن 'open' که هیچ‌جا نوشته نمی‌شد). */
  status: text('status').notNull().default('needs_review'),
  body: text('body').notNull(),
  /** «انجام شد توسط X» — کیِ بست و کِی. */
  closedBy: fk('closed_by').references(() => users.id),
  closedAt: ts('closed_at'),
  ...stamps,
}, (t) => [
  check('comments_type_ck', sql`${t.type} in ('comment','review','task_note')`),
  index('comments_project_ix').on(t.projectId),
  index('comments_task_ix').on(t.taskId),
  index('comments_user_ix').on(t.userId),
]);

export const attachments = pgTable('attachments', {
  id: pk(),
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  /** فایلِ واقعی در جدولِ مرکزیِ `files`؛ لینکِ بیرونی این را ندارد. */
  fileId: fk('file_id').references(() => files.id),
  externalUrl: text('external_url'),
  label: text('label').notNull().default(''),
  kind: text('kind').notNull().default('file'),
  userId: fk('user_id').notNull().references(() => users.id),
  /**
   * رسانهٔ تسک یا کامنت (۱.۱۱۵.۰). هر دو تهی = فایلِ پروژه (تبِ فایل‌ها).
   * ⚠️ رسانهٔ یادداشتِ تسک هر دو را دارد: کامنت برای جایش، تسک برای گاردش.
   */
  taskId: fk('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  commentId: fk('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  /** پیوستِ بازبینی (ویدئوی بارگذاری‌شده، اسکرین‌شات، سند) — گاردِ خودِ بازبینی. */
  reviewId: fk('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
  /** فایلِ راهنمای آیتمِ کتابخانهٔ آنبوردینگ (۲.۶.۰) — گاردِ آنبوردینگ، نه پروژه. */
  onboardingItemId: fk('onboarding_item_id').references(() => onboardingItems.id, { onDelete: 'cascade' }),
  /** سنجاق‌شده — بالای فهرستِ تبِ فایل‌ها (۲.۳.۰). */
  pinned: boolean('pinned').notNull().default(false),
  ...stamps,
}, (t) => [
  index('attachments_project_ix').on(t.projectId),
  index('attachments_task_ix').on(t.taskId).where(sql`${t.taskId} is not null`),
  index('attachments_comment_ix').on(t.commentId).where(sql`${t.commentId} is not null`),
  index('attachments_file_ix').on(t.fileId),
  index('attachments_review_ix').on(t.reviewId).where(sql`${t.reviewId} is not null`),
  index('attachments_onboarding_item_ix').on(t.onboardingItemId).where(sql`${t.onboardingItemId} is not null`),
]);

export const timelogs = pgTable('timelogs', {
  id: pk(),
  /** ⚠️ null یعنی ساعتِ **عمومی** — کارِ اداری/حسابداری که به پروژه‌ای نمی‌خورد. */
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  logDate: date('log_date', { mode: 'string' }).notNull(),
  minutes: integer('minutes').notNull().default(0),
  description: text('description').notNull().default(''),
  ...stamps,
}, (t) => [
  index('timelogs_project_user_ix').on(t.projectId, t.userId, t.logDate),
  index('timelogs_user_ix').on(t.userId),
  index('timelogs_date_ix').on(t.logDate),
]);

export const UNIT_STATUSES = ['unpaid', 'requested', 'paid'] as const;

export const unitEntries = pgTable('unit_entries', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  entryDate: date('entry_date', { mode: 'string' }).notNull(),
  quantity: money('quantity').notNull().default('0'),
  note: text('note').notNull().default(''),
  /** R-TEAM-13 — ارزش با نرخِ همان زمان منجمد می‌شود. */
  amount: money('amount').notNull().default('0'),
  currencyId: fk('currency_id').notNull().references(() => currencies.id),
  status: text('status').notNull().default('unpaid').$type<'unpaid' | 'requested' | 'paid'>(),
  /** R-TEAM-08 — پرداخت به تراکنشِ واقعی وصل می‌شود. */
  ledgerId: fk('ledger_id'),
  ...stamps,
}, (t) => [
  check('unit_entries_status_ck', sql`${t.status} in ('unpaid','requested','paid')`),
  index('unit_entries_project_user_ix').on(t.projectId, t.userId),
  index('unit_entries_status_ix').on(t.status),
]);

export const qaItems = pgTable('qa_items', {
  id: pk(),
  roleTagId: fk('role_tag_id').references(() => tags.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** R-PROJ-18 — true یعنی اعمالش یک تسکِ واقعی می‌سازد. */
  isTask: boolean('is_task').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  ...stamps,
}, (t) => [index('qa_items_role_ix').on(t.roleTagId)]);

export const projectQa = pgTable('project_qa', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  qaItemId: fk('qa_item_id').references(() => qaItems.id),
  roleTagId: fk('role_tag_id').references(() => tags.id),
  title: text('title').notNull(),
  /**
   * ⚠️ عکسِ لحظه‌ای، مثلِ عنوان — نه خواندنِ زندهٔ کتابخانه: ویرایشِ بعدیِ
   * آیتمِ کتابخانه نباید توضیحِ پروژه‌های گذشته را بازنویسی کند.
   */
  description: text('description').notNull().default(''),
  isDone: boolean('is_done').notNull().default(false),
  doneBy: fk('done_by').references(() => users.id),
  doneAt: ts('done_at'),
  ...stamps,
}, (t) => [index('project_qa_project_ix').on(t.projectId)]);

export const BID_STATUSES = ['pending', 'approved', 'archived', 'withdrawn'] as const;

export const tenderBids = pgTable('tender_bids', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  roleTagId: fk('role_tag_id').notNull().references(() => tags.id),
  amount: money('amount').notNull(),
  currencyId: fk('currency_id').references(() => currencies.id),
  note: text('note').notNull().default(''),
  status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'archived' | 'withdrawn'>(),
  ...stamps,
}, (t) => [
  check('tender_bids_status_ck', sql`${t.status} in ('pending','approved','archived','withdrawn')`),
  uniqueIndex('tender_bids_uq').on(t.projectId, t.userId, t.roleTagId),
]);
