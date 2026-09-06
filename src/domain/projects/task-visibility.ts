/**
 * تسک‌هایی که یک **عضوِ ساده** روی صفحهٔ پروژه می‌بیند.
 *
 * ⚠️ این قاعده برای مدیران نیست: مدیرِ کل، مدیرِ پروژه و مدیرِ دفتر باید کلِ
 * تختهٔ پروژه را ببینند، وگرنه نمی‌توانند مدیریتش کنند. برای عضو اما دیدنِ
 * کارِ بقیه فقط شلوغی است — و روی پروژه‌ای با دو دولوپر، تسکِ آن یکی هیچ
 * کاری از دستِ او برنمی‌آید.
 *
 * چهار در ورودی:
 *  ۱. تسکی که به **خودم** سپرده شده.
 *  ۲. تسکِ خصوصی‌ای که خودم ساخته‌ام.
 *  ۳. تسکِ **بی‌مسئولِ نقشی** که نقشش را دارم و هنوز کسی برنداشته (یا خودم
 *     برداشته‌ام) — تا بشود برش داشت. به‌محضِ اینکه یکی برداشت، از دیدِ
 *     بقیه می‌رود.
 *  ۴. تسکی که تسکِ **دیدنیِ من به آن وابسته است** — باید بدانم منتظرِ چه
 *     هستم، حتی اگر مالِ نفرِ دیگری باشد.
 */

export interface VisibilityTask {
  id: number;
  assignedTo: number | null;
  isPrivate: boolean;
  createdBy: number | null;
  dependsOn?: number | null;
}

export interface TaskRoleRef {
  taskId: number;
  roleTagId: number;
  claimedBy: number | null;
}

export interface MemberViewer {
  userId: number;
  /** نقش‌های همین کاربر روی همین پروژه. */
  roleTagIds: readonly number[];
}

/** آیا این تسک مستقیماً به بیننده مربوط است؟ (سه در ورودیِ اول) */
export function isOwnTask<T extends VisibilityTask>(
  task: T,
  roles: readonly TaskRoleRef[],
  viewer: MemberViewer,
): boolean {
  if (task.assignedTo === viewer.userId) return true;
  if (task.isPrivate && task.createdBy === viewer.userId) return true;
  if (task.assignedTo !== null) return false;

  const mine = new Set(viewer.roleTagIds);
  return roles.some((r) => (
    r.taskId === task.id
    && mine.has(r.roleTagId)
    && (r.claimedBy === null || r.claimedBy === viewer.userId)
  ));
}

/**
 * فهرستِ دیدنیِ عضو — با بستارِ وابستگی.
 * ترتیبِ ورودی حفظ می‌شود؛ خروجی زیرمجموعه‌ای از همان است.
 */
export function visibleTasksForMember<T extends VisibilityTask>(
  tasks: readonly T[],
  roles: readonly TaskRoleRef[],
  viewer: MemberViewer,
): T[] {
  const keep = new Set<number>();
  for (const task of tasks) {
    if (isOwnTask(task, roles, viewer)) keep.add(task.id);
  }

  /**
   * بستارِ وابستگی — «تسکِ ۲ وابسته به تسکِ ۱ است» یعنی صاحبِ ۲ باید ۱ را
   * ببیند. زنجیره تا هر عمقی دنبال می‌شود، ولی هر تسک یک بار (حلقهٔ
   * وابستگیِ خراب نباید صفحه را قفل کند).
   */
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const queue = [...keep];
  while (queue.length > 0) {
    const current = byId.get(queue.shift()!);
    const parent = current?.dependsOn ?? null;
    if (parent === null || keep.has(parent) || !byId.has(parent)) continue;
    keep.add(parent);
    queue.push(parent);
  }

  return tasks.filter((t) => keep.has(t.id));
}
