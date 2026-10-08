import { boolean, index, text, uniqueIndex, pgTable, jsonb, check, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, ts, stamps, softDelete } from './_shared';
import { tags } from './base';

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
   * ظاهرِ اپ — پورتِ `_kteam_theme` (مهاجرتِ 0033). روی کاربر، نه مرورگر، تا
   * روی هر دستگاهی یکسان باشد. خالی = «انتخابی نکرده»؛ آن‌وقت ترجیحِ مرورگر.
   */
  theme: text('theme').notNull().default('').$type<'' | 'system' | 'light' | 'dark'>(),
  /** پالتِ رنگ — محورِ دوم کنارِ روشن/تیره؛ خالی = ترجیحِ مرورگر. */
  palette: text('palette').notNull().default(''),
  /**
   * درزِ گرنتِ دسترسیِ خصوصی (D-014).
   * PRD: دیدنِ دادهٔ خصوصی یک گرنت است، نه یک نقش — تا بشود بدونِ تنزلِ نقش پسش گرفت.
   */
  privateAccess: boolean('private_access').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  /** توکنِ تعیین/بازنشانیِ رمز — فقط هش؛ `invite_pending` = پنجرهٔ سه‌روزهٔ دعوت (مهاجرتِ 0023). */
  resetTokenHash: text('reset_token_hash'),
  resetExpiresAt: ts('reset_expires_at'),
  invitePending: boolean('invite_pending').notNull().default(false),
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
  /** ربات تلگرام اجازهٔ کارهای حساس دارد؟ (۲.۱۳.۰) — پیش‌فرض خاموش. */
  aiSensitive: boolean('ai_sensitive').notNull().default(false),
  /** انواعِ اعلانی که کاربر در تلگرام بی‌صدا کرده (۲.۱۴.۰)؛ `brief` = گزارشِ صبحگاهی. */
  telegramMuted: text('telegram_muted').array().notNull().default(sql`'{}'::text[]`),
  /** ساعتِ گزارشِ صبحگاهی (HH:MM، وقتِ خودِ کاربر)؛ خالی = خاموش. */
  briefAt: text('brief_at').notNull().default('08:30'),

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
  check('users_theme_ck', sql`${t.theme} in ('','system','light','dark')`),
  check('users_palette_ck', sql`${t.palette} in ('','stone','ocean','forest','sunset','violet','slate')`),
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

/**
 * کلیدهای API — از ۲.۷.۰ «توکنِ شخصی» برای اتصالِ MCP.
 * ⚠️ هر کلید مالِ یک کاربر است و همان دسترسی‌های او را دارد؛ فقط هش ذخیره می‌شود.
 */
export const apiKeys = pgTable('api_keys', {
  id: pk(),
  /** صاحبِ کلید — دسترسی‌ها هر بار از همین کاربر خوانده می‌شود (مهاجرتِ ۰۰۴۳). */
  userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
  /** آغازِ توکن («kbz_ab12…») — فقط برای تشخیص؛ از آن نمی‌شود توکن را ساخت. */
  prefix: text('prefix').notNull().default(''),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  /** مثلاً ['ledger.draft.create','ledger.read'] — کلیدِ ایجنت هرگز confirm نمی‌کند. */
  scopes: jsonb('scopes').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  rateLimit: integer('rate_limit').notNull().default(600),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
  /** توکنِ دسترسیِ OAuth کوتاه‌عمر است؛ توکنِ شخصی تاریخِ انقضا ندارد (۲.۸.۰). */
  expiresAt: ts('expires_at'),
  /** توکنی که «اتصالِ وب» صادر کرده — با قطعِ اتصال پاک می‌شود. */
  oauthGrantId: fk('oauth_grant_id').references(() => oauthGrants.id, { onDelete: 'cascade' }),
  ...stamps,
}, (t) => [uniqueIndex('api_keys_hash_uq').on(t.hash), index('api_keys_user_ix').on(t.userId)]);

/* ------------------------------------------------------------------ *
 * OAuth 2.1 — اتصالِ نسخه‌های وبِ هوشِ مصنوعی به MCP (مهاجرتِ ۰۰۴۴)
 * ------------------------------------------------------------------ */

/** اپِ هوشِ مصنوعی‌ای که خودش را ثبت کرده (Dynamic Client Registration). */
export const oauthClients = pgTable('oauth_clients', {
  id: pk(),
  clientId: text('client_id').notNull().unique(),
  name: text('name').notNull().default(''),
  redirectUris: jsonb('redirect_uris').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  ...stamps,
});

/** کدِ یک‌بارمصرفِ پس از «اجازه» — ده دقیقه، با PKCE. فقط هش ذخیره می‌شود. */
export const oauthCodes = pgTable('oauth_codes', {
  id: pk(),
  codeHash: text('code_hash').notNull().unique(),
  clientId: fk('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scopes: jsonb('scopes').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  ...stamps,
});

/** «اتصالِ وب»: یک کاربر به یک اپ اجازه داده — با توکنِ تمدیدِ چرخشی. */
export const oauthGrants = pgTable('oauth_grants', {
  id: pk(),
  clientId: fk('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  refreshHash: text('refresh_hash').notNull().unique(),
  refreshExpiresAt: ts('refresh_expires_at').notNull(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
  ...stamps,
}, (t) => [index('oauth_grants_user_ix').on(t.userId)]);

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

/* ------------------------------------------------------------------ *
 * دفترِ دسترسی‌های بیرونی — «چه کسی به چه سامانه‌ای دسترسی دارد»
 * ------------------------------------------------------------------ */

/**
 * سامانه‌های بیرونِ KabarzaOS که تیم به آن‌ها دسترسی می‌گیرد.
 *
 * ⚠️ هیچ اعتبارنامه‌ای اینجا ذخیره نمی‌شود — نه رمز، نه توکن، نه کلید.
 * این جدول فقط می‌گوید «چنین سرویسی داریم و کلیدش دستِ کیست».
 */
export const services = pgTable('services', {
  id: pk(),
  name: text('name').notNull(),
  /**
   * دستهٔ سرویس — تگی از نوعِ `service_category` که در «تنظیمات ← تگ‌ها»
   * اداره می‌شود (مهاجرتِ ۰۰۳۲). فقط برای نمایش و گروه‌بندی است؛ هیچ منطقی
   * به آن گره نخورده. اختیاری است: سرویسِ تازه می‌تواند بی‌دسته ثبت شود.
   */
  categoryTagId: fk('category_tag_id').references(() => tags.id),
  /** مسئولِ اعطا و قطعِ دسترسی — کسی که پنلِ مدیریتِ سرویس دستِ اوست. */
  ownerUserId: fk('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  adminUrl: text('admin_url').notNull().default(''),
  note: text('note').notNull().default(''),
  /**
   * هزینهٔ سرویس از ماژولِ مالی می‌آید: اشتراکِ متناظر در `recurring_expenses`.
   *
   * ⚠️ بدونِ `.references()` عمداً — `payments.ts` خودش از `access.ts` جدول
   * می‌خواند و ارجاعِ برگشتی حلقهٔ import می‌ساخت. کلیدِ خارجی در مهاجرتِ
   * ۰۰۲۹ تعریف شده است، دقیقاً مثلِ `user_offices.office_id`.
   */
  recurringExpenseId: fk('recurring_expense_id'),
  /** مثلِ دفتر، حذف نمی‌شود بلکه غیرفعال می‌شود تا گرنت‌های تاریخی نشکنند. */
  isActive: boolean('is_active').notNull().default(true),
  ...stamps,
}, (t) => [
  index('services_name_lower_ix').on(sql`lower(${t.name})`),
  index('services_category_ix').on(t.categoryTagId),
]);

/** سطحِ دسترسی — فهرستِ ثابت تا گزارش‌ها قابلِ جمع‌بستن بمانند. */
export const GRANT_LEVELS = ['admin', 'member', 'viewer'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

/**
 * یک دسترسیِ داده‌شده به یک نفر روی یک سرویس.
 *
 * ⚠️ R-ACCESS-01 — ردیف **هرگز پاک نمی‌شود**؛ فقط `revoked_at` می‌خورد.
 * پرسشِ اصلیِ این ماژول «او چه داشت و کی ازش گرفته شد» است؛ با حذفِ ردیف
 * همان پرسش بی‌جواب می‌ماند — همان درسی که در off-boarding هم گرفتیم.
 *
 * ⚠️ R-ACCESS-02 — یکتاییِ (کاربر، سرویس) فقط روی گرنتِ **باز** اعمال
 * می‌شود. اگر یکتاییِ کامل می‌گذاشتیم، کسی که رفت و برگشت دیگر نمی‌توانست
 * دسترسیِ دوباره بگیرد.
 */
export const serviceGrants = pgTable('service_grants', {
  id: pk(),
  serviceId: fk('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** شناسهٔ حساب در آن سرویس — ایمیل، نامِ کاربری یا شمارهٔ داخلی. هرگز رمز. */
  accountRef: text('account_ref').notNull().default(''),
  level: text('level').notNull().default('member').$type<GrantLevel>(),
  /**
   * نامِ آیتم در password manager — فقط یک **اشاره**، نه خودِ راز.
   * راز در جای خودش می‌ماند؛ این ستون صرفاً می‌گوید کجا دنبالش بگردیم.
   */
  vaultRef: text('vault_ref').notNull().default(''),
  note: text('note').notNull().default(''),
  grantedAt: ts('granted_at').notNull().defaultNow(),
  grantedBy: fk('granted_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: ts('revoked_at'),
  revokedBy: fk('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps,
}, (t) => [
  check('service_grants_level_ck', sql`${t.level} in ('admin','member','viewer')`),
  uniqueIndex('service_grants_open_uq').on(t.serviceId, t.userId).where(sql`${t.revokedAt} is null`),
  index('service_grants_user_ix').on(t.userId),
  index('service_grants_service_ix').on(t.serviceId),
]);

/**
 * «مغزِ» ربات تلگرام (۲.۹.۰) — ارائه‌دهندهٔ هوشِ مصنوعیِ هر کاربر.
 * ⚠️ `apiKeyEnc` رمزگذاری‌شده است (`server/ai/secret-box`)؛ `keyHint` فقط چهار
 * نویسهٔ آخرِ کلید برای تشخیص.
 */
export const aiConnections = pgTable('ai_connections', {
  id: pk(),
  userId: fk('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** ترتیبِ امتحان (۲.۱۲.۰): کوچک‌تر اول؛ اگر به سقف خورد، بعدی. */
  priority: integer('priority').notNull().default(0),
  provider: text('provider').notNull(),
  baseUrl: text('base_url').notNull(),
  model: text('model').notNull().default(''),
  apiKeyEnc: text('api_key_enc').notNull(),
  keyHint: text('key_hint').notNull().default(''),
  ...stamps,
}, (t) => [
  index('ai_connections_user_ix').on(t.userId, t.priority),
]);
