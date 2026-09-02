/**
 * دیدِ عضو روی تسک‌ها — پورتِ `Tasks::visible_to_user_sql()` ِ افزونه.
 *
 * عضوِ عادی فقط این‌ها را می‌بیند:
 *  - تسکی که مستقیم به خودش سپرده شده (خصوصی یا نه)؛
 *  - تسکِ خصوصی‌ای که خودش ساخته؛
 *  - تسکِ **نقشیِ** بی‌مسئول (غیرِخصوصی) که یکی از نقش‌هایش را روی همان
 *    پروژه دارد و آن نقش یا ادعانشده است یا خودش ادعایش کرده.
 *
 * ⚠️ «دولوپرِ دوم هرگز تسکِ دولوپرِ اول را نمی‌بیند»: تا وقتی یک هم‌نقش نقش
 * را برندارد، همه می‌بینند؛ به‌محضِ ادعا، از دیدِ بقیه می‌رود. مدیرانِ پروژه
 * و کارفرما این قاعده را ندارند (همه‌چیز / همهٔ غیرِخصوصی‌ها).
 */

export interface VisibleTaskRole {
  roleTagId: number | null;
  claimedBy: number | null;
}

export interface VisibleTask {
  assignedTo: number | null;
  createdBy: number | null;
  isPrivate: boolean;
  roles: readonly VisibleTaskRole[];
}

export function isTaskVisibleToMember(
  task: VisibleTask,
  viewerId: number,
  /** تگ‌های نقشِ بیننده روی **همین** پروژه. */
  myRoleTagIds: ReadonlySet<number>,
): boolean {
  if (task.assignedTo === viewerId) return true;
  if (task.isPrivate) return task.createdBy === viewerId;
  if (task.assignedTo !== null) return false;
  return task.roles.some((r) =>
    r.roleTagId !== null
    && myRoleTagIds.has(r.roleTagId)
    && (r.claimedBy === null || r.claimedBy === viewerId));
}

/**
 * «تسکِ باز» برای شمارنده‌ها — پورتِ `count_open_for_user`: نه بسته، نه در
 * انتظارِ بررسی (کاری که تمام شده و منتظرِ نظرِ دیگری است، روی میزِ عضو نیست).
 */
export function isOpenTask(task: { statusGroup: string | null; isReview: boolean | null }): boolean {
  return (task.statusGroup ?? '') !== 'complete' && !task.isReview;
}
