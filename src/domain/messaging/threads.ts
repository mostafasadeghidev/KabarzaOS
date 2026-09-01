/**
 * پیام‌رسانی — ترجمهٔ `Support\Messages`.
 *
 * مدل: هر گفتگو یک **رشتهٔ دونفره** است. ارسال به چند نفر، چند رشتهٔ جدا
 * می‌سازد که با `broadcastId` گروه می‌شوند — نه یک گروهِ مشترک.
 */

/** فاصلهٔ اجباری بینِ دو ارسال (ثانیه) — ضدِ اسپم. */
export const SEND_COOLDOWN_SECONDS = 30;

export interface ComposePlan {
  /** برای هر گیرنده یک رشته. */
  threads: Array<{ recipientId: number; participantIds: number[] }>;
  /** با بیش از یک گیرنده، رشته‌ها گروه می‌شوند. */
  isBroadcast: boolean;
}

export interface ComposeContext {
  senderId: number;
  /** فرستنده خودش مدیر است؟ */
  senderIsManager: boolean;
  /** شناسهٔ مدیران — برای هم‌مالکیِ رشته. */
  managerIds: readonly number[];
  /**
   * شناسهٔ **مالکان**.
   *
   * ⚠️ جدا از `managerIds` است و باید باشد: «مدیر» شاملِ همکارِ ادمین هم
   * هست، پس با قاعدهٔ قبلی رشته‌ای که همکارِ ادمین می‌ساخت فقط دو نفر
   * داشت — خودش و گیرنده — و مالک هرگز نمی‌دیدش. حالا مالک همیشه
   * هم‌مالکِ رشته است، مگر خودش فرستنده باشد.
   */
  ownerIds: readonly number[];
}

/**
 * ⚠️ سه قاعدهٔ ظریف:
 *
 * ۱. **هر گیرنده رشتهٔ خودش را دارد.** ارسال به ده نفر ده گفتگوی دونفره
 * می‌سازد، نه یک گروه — تا گیرنده‌ها همدیگر و پاسخ‌های هم را نبینند.
 *
 * ۲. **فرستنده از فهرستِ گیرندگان حذف می‌شود** — کسی به خودش پیام نمی‌دهد.
 *
 * ۳. ⚠️ اگر فرستنده **مدیر نباشد**، مدیران به رشته اضافه می‌شوند: پیامی که
 * همکار «از طرفِ مدیریت» می‌فرستد هم‌مالکِ مدیریت است تا مدیر گفتگو و
 * پاسخ‌ها را ببیند.
 *
 * ۴. ⚠️ **مالک همیشه اضافه می‌شود**، مگر خودش فرستنده باشد. قاعدهٔ ۳
 * به‌تنهایی همکارِ ادمین را هم «مدیر» می‌شمرد و از آن معاف می‌کرد، پس
 * رشته‌ای که همکارِ ادمین به یک عضو می‌فرستاد دقیقاً دو نفر داشت و
 * مالک — که پاسخ‌گوی همان تیم است — هیچ راهی برای دیدنش نداشت.
 */
export function planCompose(recipientIds: number[], ctx: ComposeContext): ComposePlan {
  const recipients = [...new Set(recipientIds.filter((id) => id > 0 && id !== ctx.senderId))];
  if (recipients.length === 0) return { threads: [], isBroadcast: false };

  const management = ctx.senderIsManager ? [] : ctx.managerIds;
  // قاعدهٔ ۴ — مالک هم‌مالکِ هر رشته‌ای است که خودش نساخته.
  const owners = ctx.ownerIds.filter((id) => id !== ctx.senderId);

  return {
    threads: recipients.map((recipientId) => ({
      recipientId,
      participantIds: [...new Set([ctx.senderId, ...management, ...owners, recipientId])],
    })),
    isBroadcast: recipients.length > 1,
  };
}

export interface ThreadState {
  id: number;
  creatorId: number;
  /** false یعنی اعلانِ یک‌طرفه. */
  allowReply: boolean;
  participantIds: readonly number[];
}

/**
 * ⚠️ R-MSG-N2 — در **اعلانِ یک‌طرفه** فقط خودِ فرستنده می‌تواند بنویسد؛
 * گیرنده می‌خواند و پاسخ نمی‌دهد. در گفتگوی عادی هر شرکت‌کننده می‌نویسد.
 *
 * در هر دو حالت شرطِ «شرکت‌کننده بودن» لازم است — بدونِ آن، دانستنِ شناسهٔ
 * رشته برای نوشتن در آن کافی می‌شد.
 */
export function canReply(thread: ThreadState, userId: number): boolean {
  const isParticipant = thread.participantIds.includes(userId);
  if (!isParticipant) return false;
  if (!thread.allowReply) return thread.creatorId === userId;
  return true;
}

/** خواندنِ رشته فقط برای شرکت‌کنندگان. */
export function canRead(thread: ThreadState, userId: number): boolean {
  return thread.participantIds.includes(userId);
}

/**
 * محدودیتِ ارسال.
 * ⚠️ فقط پس از ارسالِ **موفق** مهر می‌خورد — وگرنه یک تلاشِ ناموفق کاربر را
 * ۳۰ ثانیه قفل می‌کرد.
 */
export function isRateLimited(lastSentAt: Date | null, now: Date): boolean {
  if (!lastSentAt) return false;
  return (now.getTime() - lastSentAt.getTime()) / 1000 < SEND_COOLDOWN_SECONDS;
}

/** ثانیه‌های باقی‌مانده تا اجازهٔ ارسالِ بعدی — برای پیامِ کاربرپسند. */
export function cooldownRemaining(lastSentAt: Date | null, now: Date): number {
  if (!lastSentAt) return 0;
  const passed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(SEND_COOLDOWN_SECONDS - passed));
}

export type Audience = 'members' | 'clients' | 'all';

/** برچسبِ مخاطب‌های آماده — همان سه گزینهٔ نسخهٔ قبلی. */
export const AUDIENCE_LABELS: Record<Audience, string> = {
  members: 'همهٔ اعضا',
  clients: 'همهٔ کارفرمایان',
  all: 'همه (اعضا و کارفرمایان)',
};

/**
 * اثرانگشتِ گفت‌وگو.
 *
 * ⚠️ دو جزء دارد و جزءِ دوم به‌سادگی فراموش می‌شود: بیشینهٔ شناسهٔ پیام
 * (پیامِ تازه) **و** کمینهٔ رسیدِ خواندنِ بقیه (طرفِ مقابل خواند). بدونِ جزءِ
 * دوم، تیکِ «خوانده شد» تا رفرشِ بعدی به‌روز نمی‌شد.
 *
 * ⚠️ رسیدِ خودِ کاربر کنار می‌رود: هر بار که خودش گفت‌وگو را باز می‌کند
 * رسیدش جلو می‌رود و اثرانگشت بی‌دلیل عوض می‌شد — یعنی هر پول یک «تغییر»
 * دروغین گزارش می‌کرد.
 */
export function streamFingerprint(input: {
  maxMessageId: number;
  readStates: ReadonlyArray<{ userId: number; lastReadMessageId: number | null }>;
  viewerId: number;
}): string {
  const others = input.readStates
    .filter((r) => r.userId !== input.viewerId)
    .map((r) => r.lastReadMessageId ?? 0);
  return `${input.maxMessageId}:${others.length > 0 ? Math.min(...others) : 0}`;
}
