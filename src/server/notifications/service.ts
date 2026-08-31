import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications, users } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { matchesTarget, planDelivery, type Recipient } from '@/domain/notifications/gateway';
import { sendMail } from '@/server/mail/transport';
import { telegramCredentials } from '@/server/settings/telegram-service';

/**
 * دروازهٔ اعلان — **تنها** نقطهٔ ارسال (R-NOTIF-01).
 *
 * هر رویدادِ جدید فقط `notify()` را صدا می‌زند؛ کانالِ تازه یک بار اینجا وصل
 * می‌شود و خودبه‌خود همهٔ رویدادها را می‌گیرد.
 */

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  url?: string;
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
    })
    .from(users)
    .where(inArray(users.id, ids));

  /** نشانیِ اعلان: ایمیلِ اختصاصی، وگرنه ایمیلِ ورود. */
  const addressOf = (r: (typeof rows)[number]) => (r.notifyEmail.trim() || r.email).trim();
  const byId = new Map(rows.map((r) => [r.userId, r]));

  const recipients: Recipient[] = rows.map((r) => ({
    userId: r.userId,
    // R-NOTIF-02 — «قطع‌شده» و حذف‌شده هیچ اعلانی نمی‌گیرند. «فقط مالی» می‌گیرد،
    // چون هنوز به صورت‌حسابِ خودش دسترسی دارد.
    isInactive: r.memberState === 'locked' || r.deletedAt !== null,
    // ⚠️ خاموش‌کردنِ کانال **پیش از** فیلترِ دسته می‌آید؛ کاربری که کلِ ایمیل
    // را خاموش کرده نباید با دستهٔ `other` دوباره ایمیل بگیرد.
    hasEmail: !r.notifyEmailOff && addressOf(r) !== '',
    mutedEmailCategories: r.notifyEmailMuted as Recipient['mutedEmailCategories'],
    hasTelegram: !r.telegramOff && r.telegramChatId !== '',
  }));

  const plan = planDelivery(input.type, recipients);
  if (plan.length === 0) return 0;

  await db.insert(notifications).values(
    plan.filter((p) => p.inApp).map((p) => ({
      userId: p.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      url: input.url ?? '',
    })),
  );

  // ⚠️ کانال‌های بیرونی اینجا وصل می‌شوند — و شکستشان بی‌صدا است.
  for (const p of plan) {
    if (!p.email && !p.telegram) continue;
    const row = byId.get(p.userId);
    if (!row) continue;
    try {
      await deliverExternal(p, input, {
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
  input: NotifyInput,
  target: { email: string; chatId: string },
): Promise<void> {
  const url = input.url ? absoluteUrl(input.url) : '';

  if (plan.email) {
    const lines = input.body ? [input.body] : [];
    if (url) lines.push('', url);
    await sendMail(target.email, input.title, lines.join('\n'));
  }

  if (plan.telegram) {
    const lines = [input.title];
    if (input.body) lines.push(input.body);
    if (url) lines.push(url);
    await sendTelegram(target.chatId, lines.join('\n\n'));
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

/** ارسالِ پیامِ تلگرام به یک کاربر. شکست بی‌صداست (R-NOTIF-03). */
async function sendTelegram(chatId: string, text: string): Promise<void> {
  const { token } = await telegramCredentials();
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
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
