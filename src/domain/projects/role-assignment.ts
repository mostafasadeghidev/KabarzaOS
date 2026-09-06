/**
 * تسک‌هایی که به یک **نقش** سپرده شده‌اند و هنوز صاحبِ انسانی ندارند.
 *
 * دو لحظه این قواعد را می‌خواهند:
 *  ۱. **عضوِ تازه با نقشِ X** به پروژه اضافه می‌شود — تسک‌های بازِ نقشِ X که
 *     منتظر مانده‌اند باید به او برسند. اگر او **تنها** دارندهٔ آن نقش است،
 *     خودکار به نامش می‌خورد؛ اگر چند نفر همان نقش را دارند، تسک برنداشته
 *     می‌ماند تا خودشان یکی‌یکی بردارند (وگرنه نفرِ آخری که اضافه شده صاحبِ
 *     همهٔ کارها می‌شد).
 *  ۲. **دسترسیِ یک عضو قطع می‌شود** — کارِ نیمه‌تمامش نباید بی‌صاحب بماند.
 *     اگر دقیقاً یک نفرِ دیگر همان نقش را دارد، به او منتقل می‌شود؛ وگرنه
 *     به همان نقش برمی‌گردد تا هر که می‌تواند برش دارد.
 */

export interface OpenRoleTask {
  taskId: number;
  roleTagId: number;
  claimedBy: number | null;
  /** مسئولِ فعلیِ تسک — پرشده یعنی صاحب دارد و دستکاری نمی‌شود. */
  assignedTo: number | null;
}

/** تسک‌هایی که با آمدنِ این عضو باید به نامش بخورند. */
export function tasksToAutoAssign(
  openRoleTasks: readonly OpenRoleTask[],
  newMember: { userId: number; roleTagId: number | null },
  /** شمارِ دارندگانِ هر نقش روی پروژه **پس از** افزودنِ عضوِ تازه. */
  holderCount: ReadonlyMap<number, number>,
): number[] {
  const role = newMember.roleTagId;
  if (role === null) return [];
  // بیش از یک دارنده → انتخاب با خودشان (برداشتنِ دستی).
  if ((holderCount.get(role) ?? 0) !== 1) return [];

  return openRoleTasks
    .filter((t) => t.roleTagId === role && t.claimedBy === null && t.assignedTo === null)
    .map((t) => t.taskId);
}

export interface HandoverTask {
  taskId: number;
  /** نقش‌های همین تسک. */
  roleTagIds: readonly number[];
}

export interface Handover {
  taskId: number;
  /** گیرندهٔ جدید؛ null یعنی «به نقش برگردد و برداشتنش آزاد شود». */
  toUserId: number | null;
}

/**
 * تسک‌های نیمه‌تمامِ عضوی که دسترسی‌اش قطع شده، به کجا می‌روند.
 *
 * ⚠️ فقط کارِ **باز**: تسکِ تمام‌شده تاریخ است و دست‌کاری‌اش سابقه را خراب
 * می‌کند.
 */
export function handoverPlan(
  openTasks: readonly HandoverTask[],
  leaving: { userId: number; roleTagIds: readonly number[] },
  /** دارندگانِ هر نقش روی پروژه **بدونِ** فردِ در حالِ رفتن. */
  holdersByRole: ReadonlyMap<number, readonly number[]>,
): Handover[] {
  return openTasks.map((task) => {
    // نقشِ مشترکِ تسک با نقشِ فردِ در حالِ رفتن — مبنای پیدا کردنِ جانشین.
    const roles = task.roleTagIds.length > 0 ? task.roleTagIds : leaving.roleTagIds;
    const candidates = new Set<number>();
    for (const role of roles) {
      for (const holder of holdersByRole.get(role) ?? []) {
        if (holder !== leaving.userId) candidates.add(holder);
      }
    }
    // دقیقاً یک جانشین → انتقالِ مستقیم؛ صفر یا چند نفر → برگشت به نقش.
    return { taskId: task.taskId, toUserId: candidates.size === 1 ? [...candidates][0]! : null };
  });
}
