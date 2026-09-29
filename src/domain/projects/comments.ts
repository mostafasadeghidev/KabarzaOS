/**
 * گفت‌وگوهای پروژه و تسک — ترجمهٔ `Support\Comments`.
 *
 * هر رشته دو حالت دارد که با یک تیک جابه‌جا می‌شوند: «نیاز به بررسی» و
 * «انجام شد».
 *
 * ⚠️ نوعِ سومِ `review` برداشته شد (مهاجرتِ 0026): رشتهٔ جدایی بود با همان
 * مکانیزم و فقط واژگانِ بستهٔ متفاوت («حل شد»)، که در عوض از دیدِ همهٔ
 * شمارنده‌ها بیرون می‌ماند. ردیف‌های قدیمی به کامنت تبدیل شدند.
 */

export type CommentType = 'comment' | 'task_note';

/** حالتِ بازِ همهٔ انواع. */
export const OPEN_STATUS = 'needs_review';

/** حالتِ بستهٔ هر رشته. */
export function closedStatus(_type: CommentType = 'comment'): string {
  return 'done';
}

/** برچسبِ دو حالت — دقیقاً مثلِ `Comments::statuses()`. */
export function statusLabels(_type: CommentType = 'comment'): Record<string, string> {
  return { needs_review: 'نیاز به بررسی', done: 'انجام شد' };
}

export function statusLabel(type: CommentType, status: string): string {
  return statusLabels(type)[status] ?? '';
}

export function isOpen(status: string): boolean {
  return status === OPEN_STATUS;
}

/**
 * تیکِ جابه‌جاکننده: باز ↔ بسته.
 * بازگرداندنِ `closedBy` یعنی «انجام شد توسط X» فقط وقتی نوشته می‌شود که
 * رشته واقعاً بسته شود — و با بازکردنِ دوباره پاک می‌شود.
 */
export function toggleStatus(type: CommentType = 'comment', current: string = OPEN_STATUS): {
  status: string;
  stampCloser: boolean;
} {
  if (isOpen(current)) return { status: closedStatus(type), stampCloser: true };
  return { status: OPEN_STATUS, stampCloser: false };
}

/**
 * نوعِ نویسندهٔ کامنت — برای رنگِ قابِ کامنت (پورتِ `kteam-by-member` /
 * `kteam-by-client` / `kteam-by-staff`). عضو با رنگِ تگِ نقشش در همین پروژه،
 * کارفرما با رنگِ ثابت، و بقیه (مدیر، کادر) خنثی.
 *
 * ⚠️ عضویت پیش از کارفرما: کسی که هر دو است، مثلِ نسخهٔ قبلی رنگِ عضو می‌گیرد.
 */
export type CommentAuthorKind = 'member' | 'client' | 'staff';

export function commentAuthor(
  userId: number | null,
  members: ReadonlyArray<{ userId: number; roleColor: string | null }>,
  clientIds: ReadonlySet<number>,
): { kind: CommentAuthorKind; color: string | null } {
  if (userId === null) return { kind: 'staff', color: null };
  const member = members.find((m) => m.userId === userId);
  if (member) {
    // نخستین نقشی که رنگ دارد — عضوِ چندنقشی یک رنگِ پایدار می‌گیرد.
    const colored = members.find((m) => m.userId === userId && m.roleColor);
    return { kind: 'member', color: colored?.roleColor ?? null };
  }
  if (clientIds.has(userId)) return { kind: 'client', color: null };
  return { kind: 'staff', color: null };
}
