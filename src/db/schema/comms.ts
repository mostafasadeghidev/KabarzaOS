import { boolean, index, integer, text, date, pgTable, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, ts, stamps, scope } from './_shared';
import { offices } from './base';
import { users } from './access';
import { projects } from './projects';

/** گروه ۵ — ارتباطات. قواعد در rules/MESSAGING.md, MEETINGS.md, NOTIFICATIONS.md */

/**
 * R-MSG-01 — ارسالِ همگانی چند گفتگوی ۱:۱ می‌سازد که با broadcastId گروه می‌شوند.
 * گیرنده هرگز نمی‌فهمد چه کسانِ دیگری پیام را گرفته‌اند.
 */
export const threads = pgTable('threads', {
  id: pk(),
  creatorId: fk('creator_id').notNull().references(() => users.id),
  /** R-MSG-06 — گفتگوی یک‌طرفه (اعلان). */
  allowReply: boolean('allow_reply').notNull().default(true),
  broadcastId: fk('broadcast_id'),
  ...stamps,
}, (t) => [index('threads_broadcast_ix').on(t.broadcastId)]);

/**
 * R-MSG-02 — صندوق کاملاً شخصی: کاربر فقط گفتگوهایی را می‌بیند که اینجا ردیف دارد.
 * R-MSG-04 — وقتی همکار به‌نامِ مدیریت می‌فرستد، مالک هم اینجا ردیف می‌گیرد.
 */
export const threadUsers = pgTable('thread_users', {
  id: pk(),
  threadId: fk('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** R-MSG-07 — رسیدِ خواندن. */
  lastReadMessageId: fk('last_read_message_id'),
  ...stamps,
}, (t) => [index('thread_users_user_ix').on(t.userId)]);

export const messages = pgTable('messages', {
  id: pk(),
  threadId: fk('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  fromUserId: fk('from_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('messages_thread_ix').on(t.threadId, t.id)]);

export const MEETING_SCOPES = ['project', 'general'] as const;

export const meetings = pgTable('meetings', {
  id: pk(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  meetAt: ts('meet_at').notNull(),
  location: text('location').notNull().default(''),
  /** R-MEET-01 — جلسهٔ پروژه‌ای یا عمومی. */
  meetingScope: text('meeting_scope').notNull().default('project').$type<'project' | 'general'>(),
  projectId: fk('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  officeId: fk('office_id').references(() => offices.id),
  createdBy: fk('created_by').notNull().references(() => users.id),
  /** یادآوریِ «یک ساعت مانده» فرستاده شد؟ یک‌بار برای هر جلسه. */
  reminded: boolean('reminded').notNull().default(false),
  scope: scope(),
  ...stamps,
}, (t) => [
  check('meetings_scope_ck', sql`${t.meetingScope} in ('project','general')`),
  check('meetings_data_scope_ck', sql`${t.scope} in ('company','private')`),
  index('meetings_meet_at_ix').on(t.meetAt),
]);

export const meetingAttendees = pgTable('meeting_attendees', {
  id: pk(),
  meetingId: fk('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...stamps,
});

/** R-MEET-05/07 — چند فاصلهٔ زمانی؛ ارسالِ هر کدام یک‌بار. */
export const reminders = pgTable('reminders', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  remindAt: ts('remind_at').notNull(),
  body: text('body').notNull(),
  /** آرایهٔ واقعی (در نسخهٔ قبلی CSV بود). */
  leadMinutes: integer('lead_minutes').array(),
  sentOffsets: integer('sent_offsets').array(),
  isSent: boolean('is_sent').notNull().default(false),
  ...stamps,
}, (t) => [index('reminders_due_ix').on(t.remindAt, t.isSent)]);

/** R-NOTIF-06 — اعلانِ خوانده‌نشده هرگز پاک نمی‌شود. */
export const notifications = pgTable('notifications', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  url: text('url').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('notifications_user_ix').on(t.userId, t.isRead, t.id)]);

export const absences = pgTable('absences', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromDate: date('from_date', { mode: 'string' }).notNull(),
  toDate: date('to_date', { mode: 'string' }).notNull(),
  note: text('note').notNull().default(''),
  ...stamps,
}, (t) => [index('absences_user_ix').on(t.userId, t.fromDate)]);
