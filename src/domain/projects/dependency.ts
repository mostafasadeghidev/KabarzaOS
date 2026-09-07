/**
 * وابستگیِ تسک‌ها — «تسکِ ۲ تا وقتی تسکِ ۱ تمام نشده نوبتش نرسیده».
 *
 * ⚠️ تا امروز `dependsOn` فقط یک **یادداشتِ نمایشی** بود: روی کارت نوشته
 * می‌شد «🔗 وابسته به: فلان» و همین. هیچ‌چیز از آن نتیجه نمی‌گرفت — نه
 * وضعیتی عوض می‌شد، نه کسی می‌فهمید نوبتش رسیده. این ماژول همان پیوند را
 * به یک قاعدهٔ واقعی تبدیل می‌کند:
 *
 *  ۱. تسکی که **وابستگیِ بازِ** دارد و هنوز شروع نشده، «در نوبت» است —
 *     یعنی در صف، پشتِ کارِ دیگری.
 *  ۲. وقتی آن وابستگی **تمام** می‌شود، تسک از صف بیرون می‌آید و به
 *     «شروع نشده» (آمادهٔ شروع) می‌رود و صاحبش خبر می‌گیرد.
 *  ۳. تا وقتی وابستگی باز است، کارت نشانِ «منتظرِ …» می‌گیرد تا معلوم باشد
 *     چرا دست‌نخورده مانده.
 *
 * ⚠️ فقط وضعیت‌های گروهِ `todo` جابه‌جا می‌شوند: تسکی که واقعاً شروع شده
 * (`in_progress`) یا تمام شده، تصمیمِ آدم است و قاعده رویش دست نمی‌گذارد.
 */

export interface StatusInfo {
  id: number;
  /** گروهِ وضعیت: todo | in_progress | complete. */
  group: string | null;
  /** اسلاگِ تگ — «در نوبت» با `next-up` شناخته می‌شود. */
  slug?: string | null;
  isClosed?: boolean | null;
}

/** وضعیتی که «در صف» یعنی — تگِ `next-up`، وگرنه هیچ. */
export function queuedStatusId(statuses: readonly StatusInfo[]): number | null {
  return statuses.find((s) => s.slug === 'next-up')?.id ?? null;
}

/** «آمادهٔ شروع» — اولین وضعیتِ گروهِ todo که «در نوبت» نیست. */
export function readyStatusId(statuses: readonly StatusInfo[]): number | null {
  return statuses.find((s) => s.group === 'todo' && s.slug !== 'next-up')?.id ?? null;
}

/** آیا این وضعیت «تمام‌شده» است؟ */
export function isDoneStatus(status: StatusInfo | null | undefined): boolean {
  return Boolean(status && (status.isClosed || status.group === 'complete'));
}

/**
 * وضعیتی که تسک **هنگامِ ذخیره** باید بگیرد.
 *
 * @param chosen وضعیتی که کاربر انتخاب کرده (یا پیش‌فرضِ سامانه).
 * @param dependencyDone وابستگی‌اش تمام شده؟ (`null` یعنی وابستگی ندارد)
 * @returns شناسهٔ وضعیتِ نهایی — `chosen` وقتی قاعده‌ای اعمال نشود.
 */
export function statusForDependency(
  chosen: number | null,
  dependencyDone: boolean | null,
  statuses: readonly StatusInfo[],
): number | null {
  // بدونِ وابستگی، یا وابستگیِ تمام‌شده → دستِ کاربر.
  if (dependencyDone !== false) return chosen;

  const current = statuses.find((s) => s.id === chosen) ?? null;
  // کاری که واقعاً شروع/تمام شده، در صف نمی‌رود.
  if (current !== null && current.group !== 'todo') return chosen;

  return queuedStatusId(statuses) ?? chosen;
}

export interface DependentTask {
  id: number;
  statusTagId: number | null;
}

/**
 * با تمام‌شدنِ یک تسک، کدام وابسته‌ها از صف بیرون می‌آیند.
 * فقط آن‌هایی که در «در نوبت»‌اند — تسکی که کاربر خودش جای دیگری برده،
 * دست نمی‌خورد.
 */
export function tasksToRelease(
  dependents: readonly DependentTask[],
  statuses: readonly StatusInfo[],
): { taskIds: number[]; statusTagId: number | null } {
  const queued = queuedStatusId(statuses);
  const ready = readyStatusId(statuses);
  if (queued === null) return { taskIds: [], statusTagId: ready };
  return {
    taskIds: dependents.filter((t) => t.statusTagId === queued).map((t) => t.id),
    statusTagId: ready,
  };
}
