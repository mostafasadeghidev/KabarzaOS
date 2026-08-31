import { bigint, boolean, index, integer, text, date, pgTable, jsonb, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, money, ts, stamps, softDelete, scope } from './_shared';
import { currencies, offices, tags } from './base';
import { users } from './access';
import { files } from './files';

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

  /** R-PROJ-06 — بایگانی، قدمِ برگشت‌پذیرِ قبل از سبک‌سازی. */
  isArchived: boolean('is_archived').notNull().default(false),
  /** R-PROJ-07 — خلاصهٔ منجمد بعد از سبک‌سازی. */
  lightenSummary: jsonb('lighten_summary'),

  /** R-PROJ-20 — زیرپروژه، فقط یک سطح و بدونِ حلقه. */
  parentId: fk('parent_id'),

  scope: scope(),
  /** تصویرِ شاخصِ پروژه — همان «تصویر شاخص» نسخهٔ قبلی. */
  thumbnailFileId: fk('thumbnail_file_id').references(() => files.id),
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
  ...stamps,
}, (t) => [
  uniqueIndex('project_members_uq').on(t.projectId, t.userId, t.roleTagId),
  index('project_members_user_ix').on(t.userId),
]);

export const projectClients = pgTable('project_clients', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  ...stamps,
}, (t) => [uniqueIndex('project_clients_uq').on(t.projectId, t.userId)]);

export const tasks = pgTable('tasks', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  assignedTo: fk('assigned_to').references(() => users.id),
  createdBy: fk('created_by').references(() => users.id),
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
  updatedBy: fk('updated_by').references(() => users.id),
  scope: scope(),
  ...stamps,
  ...softDelete,
}, (t) => [
  check('tasks_scope_ck', sql`${t.scope} in ('company','private')`),
  index('tasks_project_ix').on(t.projectId),
  index('tasks_assigned_ix').on(t.assignedTo),
  index('tasks_status_ix').on(t.statusTagId),
]);

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
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  taskId: fk('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  parentId: fk('parent_id'),
  userId: fk('user_id').references(() => users.id),
  type: text('type').notNull().default('comment').$type<'comment' | 'review' | 'task_note'>(),
  status: text('status').notNull().default('open'),
  body: text('body').notNull(),
  /** «انجام شد توسط X» — کیِ بست و کِی. */
  closedBy: fk('closed_by').references(() => users.id),
  closedAt: ts('closed_at'),
  ...stamps,
}, (t) => [
  check('comments_type_ck', sql`${t.type} in ('comment','review','task_note')`),
  index('comments_project_ix').on(t.projectId),
  index('comments_task_ix').on(t.taskId),
]);

export const attachments = pgTable('attachments', {
  id: pk(),
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  /** فایلِ واقعی در جدولِ مرکزیِ `files`؛ لینکِ بیرونی این را ندارد. */
  fileId: fk('file_id').references(() => files.id),
  externalUrl: text('external_url'),
  label: text('label').notNull().default(''),
  kind: text('kind').notNull().default('file'),
  userId: fk('user_id').references(() => users.id),
  ...stamps,
}, (t) => [index('attachments_project_ix').on(t.projectId)]);

export const timelogs = pgTable('timelogs', {
  id: pk(),
  /** ⚠️ null یعنی ساعتِ **عمومی** — کارِ اداری/حسابداری که به پروژه‌ای نمی‌خورد. */
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id),
  logDate: date('log_date', { mode: 'string' }).notNull(),
  minutes: integer('minutes').notNull().default(0),
  description: text('description').notNull().default(''),
  ...stamps,
}, (t) => [index('timelogs_project_user_ix').on(t.projectId, t.userId, t.logDate)]);

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
  currencyId: fk('currency_id').references(() => currencies.id),
  status: text('status').notNull().default('unpaid').$type<'unpaid' | 'requested' | 'paid'>(),
  /** R-TEAM-08 — پرداخت به تراکنشِ واقعی وصل می‌شود. */
  ledgerId: fk('ledger_id'),
  ...stamps,
}, (t) => [
  check('unit_entries_status_ck', sql`${t.status} in ('unpaid','requested','paid')`),
  index('unit_entries_project_user_ix').on(t.projectId, t.userId),
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
});

export const projectQa = pgTable('project_qa', {
  id: pk(),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  qaItemId: fk('qa_item_id').references(() => qaItems.id),
  roleTagId: fk('role_tag_id').references(() => tags.id),
  title: text('title').notNull(),
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
