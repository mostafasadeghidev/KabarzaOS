/**
 * تسک‌ها — قواعدِ docs/rules/PROJECTS-TASKS.md
 */

export interface TaskRoleRow {
  roleTagId: number;
  claimedBy: number | null;
}

/**
 * ⚠️ R-PROJ-13 — «ساین‌کردن» per-role است.
 * وقتی کاربری تسکِ نقشی را برمی‌دارد، فقط نقش‌هایی که **خودش دارد و هنوز
 * ساین‌نشده‌اند** به نامش می‌خورند. دارندگانِ نقش‌های دیگر بی‌تأثیر می‌مانند.
 *
 * چرا: یک تسک می‌تواند هم‌زمان به «دولوپر» و «طراح» تخصیص یافته باشد.
 * اگر دولوپر آن را بردارد، طراح نباید تسکش را از دست بدهد.
 */
export function rolesToClaim(
  taskRoles: readonly TaskRoleRow[],
  userRoleTagIds: readonly number[],
): number[] {
  const held = new Set(userRoleTagIds);
  return taskRoles
    .filter((r) => r.claimedBy === null && held.has(r.roleTagId))
    .map((r) => r.roleTagId);
}

export interface AssignmentSnapshot {
  assignedTo: number | null;
  roles: readonly TaskRoleRow[];
}

/** کسانی که «کارِ» یک تسک را انجام می‌دهند. */
export function taskDoers(
  task: AssignmentSnapshot,
  roleHolders: ReadonlyMap<number, readonly number[]>,
): number[] {
  if (task.assignedTo) return [task.assignedTo];

  const ids = new Set<number>();
  for (const role of task.roles) {
    if (role.claimedBy) {
      ids.add(role.claimedBy);
      continue;
    }
    for (const holder of roleHolders.get(role.roleTagId) ?? []) ids.add(holder);
  }
  return [...ids];
}

/**
 * ⚠️ R-PROJ-15 — تغییرِ مسئول فقط به فردِ **جدید** اطلاع می‌دهد.
 * نه به افرادِ قبلی، نه به خودِ ویرایش‌کننده.
 */
export function newlyAssigned(
  before: AssignmentSnapshot,
  after: AssignmentSnapshot,
  roleHolders: ReadonlyMap<number, readonly number[]>,
  editorId: number,
): number[] {
  const was = new Set(taskDoers(before, roleHolders));
  return taskDoers(after, roleHolders).filter((id) => !was.has(id) && id !== editorId);
}

/** R-PROJ-16 — منطق به گروهِ وضعیت تکیه می‌کند، نه به نامِ قابلِ تغییرِ آن. */
export type TaskStatusGroup = 'todo' | 'in_progress' | 'complete';

export function isDone(group: TaskStatusGroup | null): boolean {
  return group === 'complete';
}

export function isOpen(group: TaskStatusGroup | null): boolean {
  return group !== 'complete';
}
