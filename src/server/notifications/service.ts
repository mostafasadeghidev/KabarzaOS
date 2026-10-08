import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { isLocale, type Locale } from '@/i18n/config';
import { createTranslator, type Translator } from '@/i18n/translate';
import { loadMessages } from '@/i18n/server';
import { getSystemConfig } from '@/server/settings/system-service';
import { db } from '@/db/client';
import { notifications, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { matchesTarget, planDelivery, type Recipient } from '@/domain/notifications/gateway';
import { sendMail } from '@/server/mail/transport';
import { telegramCredentials } from '@/server/settings/telegram-service';
import { taskCard, type TaskCardFile } from '@/server/telegram/task-card';
import { getObject } from '@/server/files/storage';

/**
 * دروازهٔ اعلان — **تنها** نقطهٔ ارسال (R-NOTIF-01).
 *
 * هر رویدادِ جدید فقط `notify()` را صدا می‌زند؛ کانالِ تازه یک بار اینجا وصل
 * می‌شود و خودبه‌خود همهٔ رویدادها را می‌گیرد.
 */

/**
 * ⚠️ `title` و `body` **کلیدِ ترجمه‌اند** (رشتهٔ فارسیِ مبدأ، با جای‌نگهدارِ
 * `{name}`)، نه متنِ آماده: هر گیرنده اعلان را به زبانِ خودش می‌گیرد — در
 * زنگوله، ایمیل و تلگرام. پیش از این متنِ خام ذخیره و عیناً فرستاده می‌شد،
 * پس بدنه‌های قالب‌دار (`${title} — ${n}`) هرگز ترجمه نمی‌شدند و ایمیل و
 * تلگرام همیشه فارسی می‌رفتند. داده (نامِ پروژه، مبلغ) از راهِ `params` می‌آید.
 */
export interface NotifyInput {
  /** مقادیرِ جای‌نگهدارها — `{project}`, `{n}` … */
  params?: Record<string, string | number>;
  type: string;
  title: string;
  body?: string;
  url?: string;
  /**
   * بستنِ یک کانالِ بیرونی **برای همین اعلان** (پیش‌فرض: هر دو باز). مثلاً
   * پیامِ عادیِ گروهِ پروژه به تلگرام می‌رود ولی ایمیل نه — ایمیل برای هر
   * پیامِ گفتگو پرسروصدا است. ترجیحِ کاربر همچنان مقدم است؛ این فقط کم می‌کند.
   */
  channels?: { email?: boolean; telegram?: boolean };
  /**
   * تسکِ همین اعلان (۲.۱۲.۰) — برای «سپرده شد» تلگرام کارتِ کامل می‌فرستد:
   * عنوان، پروژه، اولویت، ددلاین، توضیح و فایل‌های تسک.
   */
  taskId?: number;
}

/**
 * ارسالِ اعلان به چند نفر.
 *
 * ⚠️ R-NOTIF-03 — شکستِ کانالِ بیرونی **هرگز** اکشنِ اصلی را نمی‌شکند:
 * نوشتنِ ردیفِ داخلِ اپ اول انجام می‌شود و آینه‌کردن به کانال‌ها در
 * `try/catch` است. قطعیِ تلگرام نباید مانعِ ثبتِ تسک یا پرداخت شود.
 */
export async function notify(userIds: number[], input: NotifyInput): Promise<number> {
  const ids = [...new Set(userIds.filter((id) => id > 0))];
  if (ids.length === 0) return 0;

  const rows = await db
    .select({
      userId: users.id,
      memberState: users.memberState,
      deletedAt: users.deletedAt,
      email: users.email,
      notifyEmail: users.notifyEmail,
      notifyEmailOff: users.notifyEmailOff,
      notifyEmailMuted: users.notifyEmailMuted,
      telegramChatId: users.telegramChatId,
      telegramOff: users.telegramOff,
      locale: users.locale,
    })
    .from(users)
    .where(inArray(users.id, ids));

  // ترجمهٔ به‌ازای زبانِ هر گیرنده — یک مترجم برای هر زبان، نه هر نفر.
  const fallbackLocale = (await getSystemConfig()).defaultLocale as Locale;
  const translators = new Map<Locale, Translator>();
  const render = async (locale: Locale): Promise<{ title: string; body: string; openLabel: string; locale: Locale; tr: Translator }> => {
    let tr = translators.get(locale);
    if (!tr) {
      tr = createTranslator(await loadMessages(locale), locale);
      translators.set(locale, tr);
    }
    return {
      title: tr(input.title, input.params),
      body: input.body ? tr(input.body, input.params) : '',
      openLabel: tr('باز کردن در برنامه'),
      locale,
      tr,
    };
  };
  const localeOf = (r: { locale: string | null }): Locale =>
    (r.locale && isLocale(r.locale) ? r.locale : fallbackLocale);

  /** نشانیِ اعلان: ایمیلِ اختصاصی، وگرنه ایمیلِ ورود. */
  const addressOf = (r: (typeof rows)[number]) => (r.notifyEmail.trim() || r.email).trim();
  const byId = new Map(rows.map((r) => [r.userId, r]));

  const recipients: Recipient[] = rows.map((r) => ({
    userId: r.userId,
    // R-NOTIF-02 — «قطع‌شده» و حذف‌شده هیچ اعلانی نمی‌گیرند. «فقط مالی» تنها
    // رویدادهای مالی را می‌گیرد — هنوز صورت‌حسابِ خودش را می‌بیند، ولی تسک و
    // کامنت و پیامِ تیم دیگر مالِ او نیست (نسخهٔ قبلی هیچ‌کدام را نمی‌داد).
    isInactive: r.memberState === 'locked' || r.deletedAt !== null,
    financeOnly: r.memberState === 'finance',
    // ⚠️ خاموش‌کردنِ کانال **پیش از** فیلترِ دسته می‌آید؛ کاربری که کلِ ایمیل
    // را خاموش کرده نباید با دستهٔ `other` دوباره ایمیل بگیرد.
    hasEmail: !r.notifyEmailOff && addressOf(r) !== '',
    mutedEmailCategories: r.notifyEmailMuted as Recipient['mutedEmailCategories'],
    hasTelegram: !r.telegramOff && r.telegramChatId !== '',
  }));

  const plan = planDelivery(input.type, recipients).map((p) => ({
    ...p,
    email: p.email && input.channels?.email !== false,
    telegram: p.telegram && input.channels?.telegram !== false,
  }));
  if (plan.length === 0) return 0;

  const inApp = plan.filter((p) => p.inApp);
  if (inApp.length > 0) {
    const values = [];
    for (const p of inApp) {
      const row = byId.get(p.userId);
      const text = await render(localeOf(row ?? { locale: null }));
      values.push({ userId: p.userId, type: input.type, title: text.title, body: text.body, url: input.url ?? '' });
    }
    await db.insert(notifications).values(values);
  }

  // ⚠️ کانال‌های بیرونی اینجا وصل می‌شوند — و شکستشان بی‌صدا است.
  for (const p of plan) {
    if (!p.email && !p.telegram) continue;
    const row = byId.get(p.userId);
    if (!row) continue;
    try {
      const text = await render(localeOf(row));
      await deliverExternal(p, { ...input, ...text }, {
        email: addressOf(row),
        chatId: row.telegramChatId,
      });
    } catch {
      // R-NOTIF-03 — عمداً بلعیده می‌شود.
    }
  }

  return plan.length;
}

/**
 * آینه‌کردنِ اعلان به کانال‌های بیرونی.
 *
 * ⚠️ قالبِ دو کانال عمداً فرق دارد و این پورتِ دقیقِ نسخهٔ قبلی است:
 * ایمیل «موضوع» دارد پس عنوان به موضوع می‌رود و متن فقط بدنه است؛ تلگرام
 * موضوع ندارد پس عنوان **اولین خطِ** پیام می‌شود. اگر عنوان را در ایمیل هم
 * تکرار کنیم، هر ایمیل دو بار عنوانش را می‌گوید.
 */
async function deliverExternal(
  plan: { email: boolean; telegram: boolean },
  input: NotifyInput & { openLabel?: string; locale?: Locale; tr?: Translator },
  target: { email: string; chatId: string },
): Promise<void> {
  const url = input.url ? absoluteUrl(input.url) : '';

  if (plan.email) {
    const lines = input.body ? [input.body] : [];
    if (url) lines.push('', url);
    await sendMail(target.email, input.title, lines.join('\n'));
  }

  if (plan.telegram) {
    // ⚠️ کارتِ کامل فقط برای «سپرده شد» — گیرنده انجام‌دهندهٔ همان تسک است.
    const card = input.type === 'task.assigned' && input.taskId && input.locale && input.tr
      ? await taskCard(input.taskId, input.locale, input.tr).catch(() => null)
      : null;
    if (card) {
      const text = [`🔔 ${input.title}`, '', ...card.lines, ...(url ? ['', url] : [])].join('\n');
      await sendTelegram(target.chatId, text.slice(0, 4000), miniAppButton(input.url, input.openLabel));
      for (const file of card.files) await sendTelegramFile(target.chatId, file);
    } else {
      // 🔔 عنوان، بعد متن؛ پیوند ته پیام (دکمهٔ «باز کردن» زیرش است).
      const lines = [`🔔 ${input.title}`];
      if (input.body) lines.push(input.body);
      if (url) lines.push(url);
      await sendTelegram(target.chatId, lines.join('\n\n'), miniAppButton(input.url, input.openLabel));
    }
  }
}

/**
 * پیوندِ **مطلق** — اعلان بیرون از مرورگرِ کاربر باز می‌شود.
 * ⚠️ `/projects/3` در ایمیل کلیک‌ناپذیر است؛ باید دامنه داشته باشد.
 */
function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
  return base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : url;
}

/**
 * دکمهٔ «باز کردن در برنامه» زیرِ اعلانِ تلگرام (۲.۱۲.۰) — همان صفحه داخلِ
 * مینی‌اپ و با ورودِ خودکار، به‌جای مرورگرِ بیرونی. فقط برای مسیرِ داخلی و فقط
 * با `APP_URL` ِ HTTPS (تلگرام مینی‌اپِ بی‌HTTPS را باز نمی‌کند). پیوندِ متنی هم
 * می‌ماند، برای نسخه‌هایی از تلگرام که مینی‌اپ ندارند.
 */
export function miniAppButton(path: string | undefined, label = 'باز کردن در برنامه') {
  const base = (process.env.APP_URL ?? '').trim().replace(/\/$/, '');
  if (!path || !base.startsWith('https://')) return undefined;
  const inner = path.startsWith(base) ? path.slice(base.length) || '/' : path;
  if (!inner.startsWith('/') || inner.startsWith('//')) return undefined;
  return { inline_keyboard: [[{ text: `📱 ${label}`, web_app: { url: `${base}/tg?next=${encodeURIComponent(inner)}` } }]] };
}

/**
 * فرستادنِ یک فایلِ تسک به تلگرام — عکس با sendPhoto (پیش‌نمایش در چت)، بقیه
 * با sendDocument. ⚠️ بایت‌ها از انبار خوانده و مستقیم بارگذاری می‌شوند؛ نشانیِ
 * فایلِ ما (که ورود می‌خواهد) به تلگرام داده نمی‌شود. شکست بی‌صداست.
 */
async function sendTelegramFile(chatId: string, file: TaskCardFile): Promise<void> {
  const { token } = await telegramCredentials();
  if (!token || !chatId) return;
  try {
    const bytes = await getObject(file.storageKey);
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append(file.photo ? 'photo' : 'document', new Blob([new Uint8Array(bytes)], { type: file.mime }), file.name);
    await fetch(`https://api.telegram.org/bot${token}/${file.photo ? 'sendPhoto' : 'sendDocument'}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // R-NOTIF-03 — فایلِ ناموفق متنِ اعلان را بی‌اثر نمی‌کند.
  }
}

/** ارسالِ پیامِ تلگرام به یک کاربر. شکست بی‌صداست (R-NOTIF-03). */
async function sendTelegram(chatId: string, text: string, replyMarkup?: ReturnType<typeof miniAppButton>): Promise<void> {
  const { token } = await telegramCredentials();
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    // ⚠️ تلگرامِ گیرکرده نباید درخواستی را که اعلان را راه انداخته نگه دارد (نسخهٔ قبلی: ۱۵ ثانیه).
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * پیامِ آزمایشی به تلگرامِ **خودِ کاربر** — پورتِ دکمهٔ «ارسال پیام تست» ِ
 * تبِ تلگرامِ پروفایل. برخلافِ `sendTelegram` بی‌صدا نیست: کاربر می‌خواهد
 * بداند اتصالش کار می‌کند، پس نتیجه برمی‌گردد.
 */
export async function sendTelegramTestToSelf(actor: Actor, text: string): Promise<boolean> {
  const [row] = await db.select({ chatId: users.telegramChatId }).from(users).where(eq(users.id, actor.id));
  const { token } = await telegramCredentials();
  if (!token || !row?.chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: row.chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return res?.ok === true;
}

/** زنگِ کاربر — آخرین اعلان‌ها و شمارِ خوانده‌نشده. */
export async function listNotifications(actor: Actor, limit = 30) {
  const [rows, unread] = await Promise.all([
    db.select().from(notifications)
      .where(eq(notifications.userId, actor.id))
      .orderBy(desc(notifications.id))
      .limit(limit),
    db.select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.id), eq(notifications.isRead, false))),
  ]);
  return { items: rows, unread: unread[0]?.n ?? 0 };
}

/** سقفِ فهرستِ صفحهٔ اعلان‌ها — همان ۲۰۰ ِ نسخهٔ قبلی (`for_user`/`unread`). */
export const FEED_LIMIT = 200;

/**
 * صفحهٔ اعلان‌ها — پورتِ `view_notifications`.
 *
 * پیش‌فرض فقط خوانده‌نشده‌ها (همان نسخهٔ قبلی)؛ `showAll` خوانده‌شده‌ها را هم
 * می‌آورد. ⚠️ زنگوله فقط ۳۰ ردیفِ آخر را دارد؛ بدونِ این صفحه اعلانِ قدیمی‌تر
 * هیچ راهی برای دیده‌شدن نداشت.
 *
 * ⚠️ شرطِ «مالِ خودم» در خودِ کوئری است؛ شناسهٔ کاربر از نشست می‌آید، نه از آدرس.
 */
export async function listNotificationFeed(actor: Actor, options: { showAll: boolean }) {
  const mine = eq(notifications.userId, actor.id);
  const [rows, unread] = await Promise.all([
    db.select().from(notifications)
      .where(options.showAll ? mine : and(mine, eq(notifications.isRead, false)))
      .orderBy(desc(notifications.id))
      .limit(FEED_LIMIT),
    db.select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(mine, eq(notifications.isRead, false))),
  ]);
  return { items: rows, unread: unread[0]?.n ?? 0 };
}

export async function markRead(actor: Actor, notificationId: number) {
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, actor.id)));
}

export async function markAllRead(actor: Actor) {
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, actor.id), eq(notifications.isRead, false)));
}

/**
 * ⚠️ R-NOTIF-08 — بازکردنِ یک صفحه، اعلانِ همان چیز را خوانده می‌کند.
 * تطبیق **عددیِ دقیق** است تا «۱۰» با «۱۰۰» اشتباه نشود.
 */
export async function markReadForTarget(actor: Actor, prefix: string, id: number) {
  const rows = await db.select({ id: notifications.id, url: notifications.url })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), eq(notifications.isRead, false)));

  const hit = rows.filter((r) => matchesTarget(r.url, prefix, id)).map((r) => r.id);
  if (hit.length === 0) return 0;

  await db.update(notifications).set({ isRead: true }).where(inArray(notifications.id, hit));
  return hit.length;
}

/**
 * پاک‌سازیِ خودکار.
 * ⚠️ R-NOTIF-06 — فقط **خوانده‌شده**‌های قدیمی؛ خوانده‌نشده هرگز.
 */
export async function purgeOld(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const deleted = await db.delete(notifications)
    .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, cutoff)))
    .returning({ id: notifications.id });
  return deleted.length;
}

export { isNull };
