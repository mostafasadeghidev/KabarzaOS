/**
 * اعمالِ چک‌لیستِ QA روی پروژه — ترجمهٔ `Support\.
 *
 * کتابخانهٔ QA آیتم دارد؛ هر آیتم به یک **نقش** بسته است و ممکن است «تسک‌ساز»
 * باشد یا نباشد. اعمال یعنی: آیتم‌های نقش‌های انتخاب‌شده روی این پروژه بنشینند.
 */

/** R-QA-02 — مخاطبِ «کارفرما» با شناسهٔ نگهبانِ صفر شناخته می‌شود، نه یک تگِ واقعی. */
export const CLIENT_ROLE = 0;

/** مخاطبِ انتخابی: شناسهٔ تگِ نقش، یا توکنِ «client». */
export type QaAudience = number | 'client';

export interface QaLibraryItem {
  id: number;
  title: string;
  description: string;
  /** صفر یعنی آیتمِ کارفرما. */
  roleTagId: number;
  isTask: boolean;
}

export type QaPlanEntry =
  | { kind: 'task'; item: QaLibraryItem; assignRoleTagId: number }
  | { kind: 'client_task'; item: QaLibraryItem; assignUserId: number }
  | { kind: 'checklist'; item: QaLibraryItem };

export interface QaPlan {
  entries: QaPlanEntry[];
  /** شناسهٔ آیتم‌هایی که اعمال شدند — به فهرستِ «اعمال‌شده» اضافه می‌شوند. */
  appliedIds: number[];
}

/**
 * نقشهٔ اعمال. هیچ‌چیز نمی‌نویسد؛ فقط می‌گوید چه باید ساخته شود.
 *
 * ⚠️ چهار قاعدهٔ ظریف:
 *  ۱. آیتمِ **قبلاً اعمال‌شده** دوباره اعمال نمی‌شود (تکراری ممنوع).
 *  ۲. آیتمِ تسک‌سازِ یک نقش، تسکی می‌سازد که به **نقش** تخصیص می‌یابد
 *     (هرکس آن نقش را دارد می‌بیند)، نه به یک شخص.
 *  ۳. آیتمِ تسک‌سازِ **کارفرما** تسکی می‌سازد که به **شخصِ** کارفرمای اصلی
 *     می‌خورد — چون کارفرما نقشِ تیمی ندارد.
 *  ۴. اگر آیتمِ تسک‌سازِ کارفرما روی پروژه‌ای بیفتد که **کارفرما ندارد**،
 *     به‌جای گم‌شدن به یک ردیفِ چک‌لیستِ ساده تبدیل می‌شود.
 */
export function planQaApply(
  library: QaLibraryItem[],
  audiences: QaAudience[],
  options: { appliedItemIds?: ReadonlySet<number>; primaryClientId?: number | null } = {},
): QaPlan {
  const includeClient = audiences.some((a) => a === 'client' || a === CLIENT_ROLE);
  const roleIds = new Set(
    audiences.filter((a): a is number => typeof a === 'number' && a > 0),
  );

  const entries: QaPlanEntry[] = [];
  const appliedIds: number[] = [];
  if (roleIds.size === 0 && !includeClient) return { entries, appliedIds };

  const already = options.appliedItemIds ?? new Set<number>();
  const clientId = options.primaryClientId ?? null;

  for (const item of library) {
    const isClientItem = item.roleTagId === CLIENT_ROLE;

    if (isClientItem ? !includeClient : !roleIds.has(item.roleTagId)) continue;
    if (already.has(item.id)) continue; // قاعدهٔ ۱

    if (item.isTask && !isClientItem) {
      entries.push({ kind: 'task', item, assignRoleTagId: item.roleTagId }); // قاعدهٔ ۲
    } else if (item.isTask && isClientItem && clientId) {
      entries.push({ kind: 'client_task', item, assignUserId: clientId }); // قاعدهٔ ۳
    } else {
      entries.push({ kind: 'checklist', item }); // قاعدهٔ ۴ و آیتم‌های غیرِ تسک
    }
    appliedIds.push(item.id);
  }

  return { entries, appliedIds };
}

/**
 * تیکِ آیتمِ چک‌لیست.
 * ⚠️ «انجام‌شده توسط X» فقط هنگامِ تیک‌زدن نوشته می‌شود و با برداشتنِ تیک پاک
 * می‌شود — وگرنه نامِ کسی که تیک را برداشته به‌جای انجام‌دهنده می‌نشست.
 */
export function qaToggle(isDone: boolean): { isDone: boolean; stampDoer: boolean } {
  const next = !isDone;
  return { isDone: next, stampDoer: next };
}

/** پیشرفتِ چک‌لیستِ پروژه — `QA::project_progress()`. */
export function qaProgress(total: number, done: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
