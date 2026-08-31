import { boolean, index, text, uniqueIndex, pgTable, jsonb, check, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, ts, stamps, softDelete } from './_shared';

/** گروه ۲ — کاربران و دسترسی */

export const users = pgTable('users', {
  id: pk(),
  email: text('email').notNull(),
  /**
   * نامِ کاربری — شناسهٔ دومِ ورود. اختیاری است؛ کاربرانِ قدیمی ندارند و با
   * ایمیل وارد می‌شوند. یکتاییِ **بی‌اعتنا به حروف** با شاخصِ
   * `lower(username)` تضمین می‌شود (مهاجرتِ 0017).
   */
  username: text('username'),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  phone: text('phone').notNull().default(''),
  /**
   * ⚠️ R-PEOPLE-01 — وضعیتِ عضو **سه‌حالته** است، نه یک بولینِ فعال/غیرفعال:
   *   active  — دسترسیِ کامل
   *   finance — عضوِ سابق که فقط امور مالیِ خودش را می‌بیند
   *   locked  — عضوِ سابق با دسترسیِ کاملاً قطع
   * تنها منبعِ حقیقت است؛ `is_active` ِ جداگانه‌ای نداریم تا از هم درنروند.
   */
  memberState: text('member_state').notNull().default('active').$type<'active' | 'finance' | 'locked'>(),
  /**
   * زبانِ کاربر — R-I18N-03: زبانِ اپ per-user است.
   *
   * ⚠️ `null` یعنی «خودش انتخابی نکرده»، نه «فارسی». آن‌وقت زبانِ پیش‌فرضِ
   * سامانه اثر می‌کند (R-I18N-14). با `not null default 'fa'` پلهٔ دوم
   * هیچ‌وقت اجرا نمی‌شد.
   */
  locale: text('locale'),
  /**
   * درزِ گرنتِ دسترسیِ خصوصی (D-014).
   * PRD: دیدنِ دادهٔ خصوصی یک گرنت است، نه یک نقش — تا بشود بدونِ تنزلِ نقش پسش گرفت.
   */
  privateAccess: boolean('private_access').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  /** مهرِ آخرین ارسالِ پیام — پایهٔ محدودیتِ ۳۰ ثانیه‌ای (R-MSG-N4). */
  lastMessageSentAt: ts('last_message_sent_at'),

  /** اطلاعاتِ دریافتِ پرداخت — یک‌به‌یک است، پس روی خودِ کاربر می‌نشیند. */
  bankAccount: text('bank_account').notNull().default(''),
  bankIban: text('bank_iban').notNull().default(''),
  bankCard: text('bank_card').notNull().default(''),

  /** خالی یعنی «منطقهٔ زمانیِ سامانه». */
  timezone: text('timezone').notNull().default(''),
  telegramChatId: text('telegram_chat_id').notNull().default(''),
  /** توکنِ یک‌بارمصرفِ اتصالِ تلگرام. */
  telegramLinkToken: text('telegram_link_token'),

  /**
   * ترجیحاتِ اعلان — پیش‌فرضِ همه «روشن» (R-NOTIF-09).
   * `notifyEmail` خالی یعنی «همان ایمیلِ ورود».
   */
  notifyEmail: text('notify_email').notNull().default(''),
  notifyEmailOff: boolean('notify_email_off').notNull().default(false),
  /** دسته‌هایی که کاربر ایمیلشان را **بی‌صدا** کرده (opt-out). */
  notifyEmailMuted: jsonb('notify_email_muted').notNull().default([]).$type<string[]>(),
  telegramOff: boolean('telegram_off').notNull().default(false),

  /**
   * حضورِ زنده — دو مهر: آخرین ضربان (هر تبی) و آخرین ضربانِ تبِ **متمرکز**.
   * ⚠️ از همین دو، سه حالتِ صادقانه مشتق می‌شود (R-PRESENCE-01).
   */
  lastSeenAt: ts('last_seen_at'),
  lastActiveAt: ts('last_active_at'),
  ...stamps,
  ...softDelete,
}, (t) => [
  uniqueIndex('users_email_uq').on(t.email),
  check('users_member_state_ck', sql`${t.memberState} in ('active','finance','locked')`),
]);

/** دفاترِ یک نفر — چندتایی است (`People::office_ids()`). */
export const userOffices = pgTable('user_offices', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  officeId: integer('office_id').notNull(),
  /** دفترِ «تحتِ مدیریت» — دامنهٔ مدیرِ دفتر، نه صرفِ عضویت. */
  manages: boolean('manages').notNull().default(false),
  ...stamps,
}, (t) => [uniqueIndex('user_offices_uq').on(t.userId, t.officeId)]);

export const ROLES = ['owner', 'admin', 'finance', 'member', 'client'] as const;
export type Role = (typeof ROLES)[number];

export const userRoles = pgTable('user_roles', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().$type<Role>(),
  ...stamps,
}, (t) => [
  check('user_roles_role_ck', sql`${t.role} in ('owner','admin','finance','member','client')`),
  uniqueIndex('user_roles_uq').on(t.userId, t.role),
]);

/**
 * مجوزهای per-user (معادلِ capabilityهای همکارِ ادمین).
 * ⚠️ R-RBAC-11 — تلهٔ حیاتی: در نسخهٔ قبلی یک کارِ نگهداشتی این‌ها را در هر ارتقا پاک می‌کرد.
 * هیچ عملیاتِ خودکاری نباید این جدول را کورکورانه خالی کند.
 */
export const userPermissions = pgTable('user_permissions', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
  ...stamps,
}, (t) => [uniqueIndex('user_permissions_uq').on(t.userId, t.permission)]);

/** کلیدهای API — پیش‌نیازِ لایهٔ ایجنت (بستهٔ ۹/۱۰ GAP). */
export const apiKeys = pgTable('api_keys', {
  id: pk(),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  /** مثلاً ['ledger.draft.create','ledger.read'] — کلیدِ ایجنت هرگز confirm نمی‌کند. */
  scopes: jsonb('scopes').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  rateLimit: integer('rate_limit').notNull().default(600),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
  ...stamps,
}, (t) => [uniqueIndex('api_keys_hash_uq').on(t.hash)]);

/**
 * لاگِ ممیزی — ارتقا نسبت به نسخهٔ قبلی: دیفِ قبل/بعد + نوعِ عامل.
 * actorType لازم است تا اقدامِ ایجنت از اقدامِ انسان تفکیک شود.
 */
export const ACTOR_TYPES = ['user', 'api_key', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const auditLog = pgTable('audit_log', {
  id: pk(),
  actorType: text('actor_type').notNull().$type<ActorType>(),
  actorId: fk('actor_id'),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: fk('object_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  check('audit_log_actor_type_ck', sql`${t.actorType} in ('user','api_key','system')`),
  index('audit_log_object_ix').on(t.objectType, t.objectId),
  index('audit_log_actor_ix').on(t.actorType, t.actorId),
  index('audit_log_created_ix').on(t.createdAt),
]);
