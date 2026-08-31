/**
 * تایمرِ کار و ثبتِ ساعت — قواعدِ خالص.
 *
 * منبع: `Support\Timelogs` (بخشِ تایمر) + `Frontend\Timer_Absence_Handlers`.
 *
 * ⚠️ تایمر **سمتِ سرور** است: فقط لحظهٔ شروع ذخیره می‌شود و مدت هنگامِ توقف
 * محاسبه می‌گردد. پس بستنِ تبِ مرورگر هیچ چیزی را از بین نمی‌برد — همان
 * تصمیمِ نسخهٔ قبلی، و دلیلش هم همین است.
 */

/** ⚠️ بیش از ۵ ساعت یعنی «یادش رفته متوقف کند» — خودکار ثبت نمی‌شود. */
export const CAP_MINUTES = 300;

/** پنجرهٔ ویرایش/حذفِ یک ثبت، از لحظهٔ ساخته‌شدنش. */
export const EDIT_WINDOW_DAYS = 14;

export interface RunningTimer {
  projectId: number | null;
  startedAt: Date;
}

export interface PendingTimer {
  projectId: number | null;
  minutes: number;
  logDate: string;
}

/** دقیقه‌های سپری‌شده از یک لحظه تا اکنون — هرگز منفی. */
export function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));
}

export type StopOutcome =
  | { action: 'log'; minutes: number; projectId: number | null; logDate: string }
  | { action: 'park'; minutes: number; projectId: number | null; logDate: string };

/**
 * تصمیمِ توقفِ تایمر.
 *
 * ⚠️ زیرِ سقف ثبت می‌شود؛ بالای سقف **هیچ چیز ذخیره نمی‌شود** و به‌جایش
 * «پارک» می‌شود تا کاربر تأیید یا اصلاح کند. ثبتِ خودکارِ ۹ ساعت روی حقوقِ
 * کسی می‌نشیند که واقعاً ۹ ساعت کار نکرده.
 */
export function planStop(timer: RunningTimer, now: Date): StopOutcome {
  const minutes = elapsedMinutes(timer.startedAt, now);
  const logDate = toDateString(timer.startedAt);
  const base = { minutes, projectId: timer.projectId, logDate };
  return minutes > CAP_MINUTES ? { action: 'park', ...base } : { action: 'log', ...base };
}

/**
 * ازسرگیریِ تایمرِ پارک‌شده: لحظهٔ شروع را به عقب می‌بریم تا زمانِ شمرده‌شده
 * از دست نرود.
 */
export function resumeStartedAt(pending: PendingTimer, now: Date): Date {
  return new Date(now.getTime() - pending.minutes * 60_000);
}

/** تاریخِ محلیِ یک لحظه به شکلِ `YYYY-MM-DD`. */
export function toDateString(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * ادغامِ توضیحات هنگامِ افزودن به ثبتِ موجودِ همان روز/پروژه.
 *
 * ⚠️ ثبت‌های یک روز و یک پروژه **یک ردیف** می‌مانند (تایمرِ دوباره، یا دستی +
 * تایمر). وگرنه «چقدر روی پروژهٔ X امروز» به چند ردیفِ تکه‌تکه تبدیل می‌شود.
 */
export function mergeDescriptions(existing: string, added: string): string {
  const a = existing.trim();
  const b = added.trim();
  if (!b) return a;
  return a ? `${a} · ${b}` : b;
}

/** آیا این ثبت هنوز در پنجرهٔ ویرایش است؟ */
export function isEditable(createdAt: Date, now: Date): boolean {
  const cutoff = now.getTime() - EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return createdAt.getTime() >= cutoff;
}

/** ساعت:دقیقه — همان قالبِ `Money::format_minutes()`. */
export function hoursLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * دقیقه از ساعت و دقیقهٔ واردشده.
 * ⚠️ مقدارِ منفی صفر می‌شود؛ فرمِ دستکاری‌شده نباید ساعتِ کاری کم کند.
 */
export function minutesFrom(hours: number, minutes: number): number {
  return Math.max(0, Math.trunc(hours) * 60 + Math.trunc(minutes));
}
