/**
 * دروازهٔ اعلان — ترجمهٔ `Support\Notifications`.
 *
 * R-NOTIF-01: هر رویداد از **یک نقطه** رد می‌شود؛ کانالِ جدید یک بار وصل
 * می‌شود و خودبه‌خود همهٔ رویدادها را می‌گیرد.
 */

/** دستهٔ اعلان — فقط برای خاموش‌کردنِ **ایمیل** به‌کار می‌رود (R-NOTIF-04). */
export type NotifyCategory = 'tasks' | 'projects' | 'money' | 'meetings' | 'messages' | 'other';

/**
 * نگاشتِ نوعِ رویداد به دسته.
 *
 * ⚠️ R-NOTIF-05 — نوعی که اینجا نباشد `other` است و **همیشه** ارسال می‌شود؛
 * سکوتِ پیش‌فرض بدترین حالت است.
 *
 * ⚠️ کلیدها باید **دقیقاً** همان رشته‌ای باشند که `notify({ type })` می‌فرستد.
 * یک بار این فهرست از واقعیت جدا افتاده بود — کلیدهایی مثل `task.comment` و
 * `payment.requested` نوشته شده بود که هیچ‌جا منتشر نمی‌شدند، و در عوض
 * `comment`، `payment` و `meeting_soon` ِ واقعی به `other` می‌افتادند. نتیجه:
 * کاربری که دستهٔ «مالی» را خاموش کرده بود همچنان ایمیلِ مالی می‌گرفت و هیچ
 * خطایی هم رخ نمی‌داد. تستِ کنارِ این فایل حالا هم‌ترازی را می‌پاید.
 */
const CATEGORY_OF: Record<string, NotifyCategory> = {
  // تسک
  'task.assigned': 'tasks',
  'task.review': 'tasks',
  'task.back': 'tasks',
  'task_note': 'tasks',
  'comment': 'tasks',

  // پروژه
  'project.signed': 'projects',
  'tender_opened': 'projects',
  'business': 'projects',

  // مالی
  'payment': 'money',
  'payment.requested': 'money',
  'payment.decided': 'money',

  // جلسه و یادآور
  'meeting.invited': 'meetings',
  'meeting_soon': 'meetings',
  'reminder': 'meetings',

  // پیام
  'message.received': 'messages',

  /**
   * ⚠️ عمداً `other`، پس هیچ‌وقت خاموش نمی‌شوند:
   *  · `no_timelog` و `timer_running` — یادآورِ کارِ خودِ کاربر.
   *  · `absence_set` — تغییری که **دیگری** در تقویمِ او داده.
   * این‌ها اگر ساکت شوند کاربر متوجهِ چیزی نمی‌شود که باید بشود.
   */
};

export function categoryOf(type: string): NotifyCategory {
  return CATEGORY_OF[type] ?? 'other';
}

/**
 * دسته‌هایی که کاربر می‌تواند ایمیلشان را خاموش کند.
 *
 * ⚠️ `other` عمداً در این فهرست **نیست**: دستهٔ «هرچیزِ دیگر» قابلِ خاموش‌کردن
 * نیست، چون رویدادی که هنوز دسته‌بندی نشده نباید بی‌صدا گم شود (R-NOTIF-05).
 */
export const EMAIL_CATEGORIES: ReadonlyArray<{ key: NotifyCategory; label: string }> = [
  { key: 'tasks', label: 'تسک‌ها' },
  { key: 'projects', label: 'پروژه‌ها' },
  { key: 'money', label: 'مالی' },
  { key: 'meetings', label: 'جلسات و یادآورها' },
  { key: 'messages', label: 'پیام‌های مستقیم' },
];

/**
 * پاک‌سازیِ فهرستِ بی‌صداها — کلیدِ ناشناخته و `other` دور ریخته می‌شوند.
 * ⚠️ پذیرفتنِ کلیدِ دلخواه یعنی فردا با تغییرِ نامِ یک دسته، کاربر بی‌خبر
 * دوباره ایمیل بگیرد یا برای همیشه ساکت بماند.
 */
export function normalizeMuted(input: readonly string[]): NotifyCategory[] {
  const valid = new Set(EMAIL_CATEGORIES.map((c) => c.key as string));
  return [...new Set(input.filter((k) => valid.has(k)))] as NotifyCategory[];
}

export interface Recipient {
  userId: number;
  /** عضوِ off-board شده — R-NOTIF-02. */
  isInactive: boolean;
  /** دسته‌هایی که کاربر ایمیلشان را خاموش کرده. */
  mutedEmailCategories?: readonly NotifyCategory[];
  hasEmail: boolean;
  hasTelegram: boolean;
}

export interface DeliveryPlan {
  userId: number;
  /** اعلانِ داخلِ اپ — همیشه، مگر کاربر غیرفعال باشد. */
  inApp: boolean;
  email: boolean;
  telegram: boolean;
}

/**
 * ⚠️ R-NOTIF-02 — عضوِ غیرفعال **هیچ** کانالی نمی‌گیرد، و این فیلتر پیش از
 * همهٔ کانال‌ها اعمال می‌شود. تنها نقطه‌ای است که تضمین می‌کند عضوِ جداشده نه
 * ایمیل بگیرد نه تلگرام نه زنگِ داخلِ اپ.
 *
 * ⚠️ R-NOTIF-04 — خاموش‌کردنِ دسته فقط **ایمیل** را ساکت می‌کند؛ زنگِ داخلِ اپ
 * و تلگرام همهٔ رویدادها را می‌گیرند، چون کاربر نباید هشداری را از دست بدهد.
 */
export function planDelivery(type: string, recipients: Recipient[]): DeliveryPlan[] {
  const category = categoryOf(type);

  return recipients
    .filter((r) => !r.isInactive)
    .map((r) => ({
      userId: r.userId,
      inApp: true,
      email: r.hasEmail && !(r.mutedEmailCategories ?? []).includes(category),
      telegram: r.hasTelegram,
    }));
}

/**
 * ⚠️ R-NOTIF-06 — پاک‌سازیِ خودکار فقط اعلانِ **خوانده‌شده** را می‌برد.
 * کاربر نباید هشداری را که ندیده از دست بدهد.
 */
export function shouldPurge(
  notification: { isRead: boolean; createdAt: Date },
  cutoff: Date,
): boolean {
  return notification.isRead && notification.createdAt.getTime() < cutoff.getTime();
}

/**
 * ⚠️ R-NOTIF-08 — بازکردنِ یک صفحه، اعلانِ همان چیز را خوانده می‌کند، با
 * تطبیقِ **عددیِ دقیق** روی پارامترِ لینک.
 *
 * تطبیقِ متنی استفاده نمی‌شود چون `…/threads/10` با `…/threads/100` اشتباه
 * گرفته می‌شد و اعلانِ گفتگوی دیگری خاموش می‌شد.
 */
export function matchesTarget(url: string, prefix: string, id: number): boolean {
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length).replace(/^\//, '');
  const segment = rest.split(/[/?#]/)[0] ?? '';
  return /^\d+$/.test(segment) && Number(segment) === id;
}
