/**
 * گفت‌وگوهای پروژه و تسک — ترجمهٔ `Support\Comments`.
 *
 * هر رشته دو حالت دارد که با یک تیک جابه‌جا می‌شوند، ولی **نامِ حالتِ بسته با
 * نوعِ رشته فرق می‌کند**.
 */

export type CommentType = 'comment' | 'review' | 'task_note';

/** حالتِ بازِ همهٔ انواع. */
export const OPEN_STATUS = 'needs_review';

/**
 * ⚠️ R-PROJ-27 — نامِ حالتِ بسته به نوع بستگی دارد: «ریویو» resolved می‌شود و
 * کامنت done. یکی‌کردنشان یعنی شمارندهٔ «نیازمند بررسی» و برچسبِ رشته
 * برای یکی از دو نوع غلط می‌شد.
 */
export function closedStatus(type: CommentType): string {
  return type === 'review' ? 'resolved' : 'done';
}

/** برچسبِ دو حالتِ هر نوع — دقیقاً مثلِ `Comments::statuses()`. */
export function statusLabels(type: CommentType): Record<string, string> {
  if (type === 'review') {
    return { needs_review: 'بررسی بشه', resolved: 'حل شد' };
  }
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
export function toggleStatus(type: CommentType, current: string): {
  status: string;
  stampCloser: boolean;
} {
  if (isOpen(current)) return { status: closedStatus(type), stampCloser: true };
  return { status: OPEN_STATUS, stampCloser: false };
}
