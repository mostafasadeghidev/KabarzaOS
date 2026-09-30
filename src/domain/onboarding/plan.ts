/**
 * آنبوردینگِ نقش‌محور — قاعده‌های خالص (بی‌دیتابیس، آزمودنی).
 *
 * کتابخانه (`onboarding_items`) برای هر نقش فهرستِ کارهای روزهای اول را
 * نگه می‌دارد؛ شروعِ آنبوردینگ از آن یک چک‌لیستِ شخصی (`onboarding_tasks`)
 * می‌سازد با موعدِ واقعی و انجام‌دهندهٔ مشخص.
 */

export const KINDS = ['learn', 'task', 'access', 'meeting', 'document'] as const;
export type OnboardingKind = (typeof KINDS)[number];

export const ASSIGNEES = ['member', 'office_manager', 'service_owner', 'user'] as const;
export type AssigneeRule = (typeof ASSIGNEES)[number];

/** برچسبِ فارسیِ مبدأ — ترجمه در لحظهٔ نمایش (`t()`). */
export const KIND_LABELS: Record<OnboardingKind, string> = {
  learn: 'آموزش',
  task: 'کار',
  access: 'دسترسی',
  meeting: 'جلسه',
  document: 'مدرک',
};

export const ASSIGNEE_LABELS: Record<AssigneeRule, string> = {
  member: 'خودِ عضو',
  office_manager: 'مدیرِ دفترِ عضو',
  service_owner: 'مسئولِ سرویس',
  user: 'شخصِ مشخص',
};

export const MAX_DUE_DAY = 90;

export function isKind(value: unknown): value is OnboardingKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function isAssigneeRule(value: unknown): value is AssigneeRule {
  return typeof value === 'string' && (ASSIGNEES as readonly string[]).includes(value);
}

/** روزِ چندم ← تاریخ. «روزِ ۱» همان روزِ شروع است. */
export function dueDateFor(start: string, dueDay: number): string {
  const day = Math.min(MAX_DUE_DAY, Math.max(1, Math.trunc(dueDay) || 1));
  const at = Date.parse(`${start}T00:00:00Z`) + (day - 1) * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

export interface LibraryItem {
  id: number;
  roleTagId: number | null;
  title: string;
  description: string;
  kind: OnboardingKind;
  assignee: AssigneeRule;
  assigneeUserId: number | null;
  serviceId: number | null;
  link: string;
  dueDay: number;
  sortOrder: number;
}

/**
 * آیتم‌هایی که به این نفر می‌رسند: «همهٔ نقش‌ها» + آیتم‌های نقش‌های خودش —
 * منهای آن‌هایی که از قبل در چک‌لیستش هست (همگام‌سازی تکراری نمی‌سازد).
 * ترتیب: موعد، بعد ترتیبِ کتابخانه.
 */
export function itemsToAdd(
  items: readonly LibraryItem[],
  roleTagIds: ReadonlySet<number>,
  existingItemIds: ReadonlySet<number>,
): LibraryItem[] {
  return items
    .filter((i) => (i.roleTagId === null || roleTagIds.has(i.roleTagId)) && !existingItemIds.has(i.id))
    .sort((a, b) => a.dueDay - b.dueDay || a.sortOrder - b.sortOrder || a.id - b.id);
}

/**
 * انجام‌دهندهٔ واقعی. `null` یعنی کسی پیدا نشد (دفترِ بی‌مدیر، سرویسِ
 * بی‌مسئول) — آن‌وقت هر مدیرِ اعضا تیکش را می‌زند، و کار بی‌صاحب نمی‌ماند.
 */
export function resolveAssignee(
  rule: AssigneeRule,
  ctx: { memberId: number; officeManagerId: number | null; serviceOwnerId: number | null; userId: number | null },
): number | null {
  switch (rule) {
    case 'member': return ctx.memberId;
    case 'office_manager': return ctx.officeManagerId;
    case 'service_owner': return ctx.serviceOwnerId;
    case 'user': return ctx.userId;
  }
}

export interface TaskLike {
  userId: number;
  assigneeUserId: number | null;
  dueDate: string;
  doneAt: Date | string | null;
}

export type TaskState = 'done' | 'overdue' | 'open';

export function taskState(task: Pick<TaskLike, 'dueDate' | 'doneAt'>, today: string): TaskState {
  if (task.doneAt) return 'done';
  return task.dueDate < today ? 'overdue' : 'open';
}

export function progress(tasks: ReadonlyArray<Pick<TaskLike, 'dueDate' | 'doneAt'>>, today: string) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.doneAt).length;
  const overdue = tasks.filter((t) => taskState(t, today) === 'overdue').length;
  return { total, done, overdue, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * چه کسی تیک می‌زند؟
 *  · مدیرِ اعضا همیشه (جای خالیِ هر کسی را پر می‌کند)؛
 *  · انجام‌دهندهٔ خودِ کار؛
 *  · کارِ بی‌صاحب فقط مدیرِ اعضا.
 * ⚠️ عضو کارِ دیگران را تیک نمی‌زند — «ایمیلِ کاری ساخته شد» را فقط کسی
 * می‌گوید که ساخته.
 */
export function canTick(
  viewer: { id: number; canManageMembers: boolean },
  task: Pick<TaskLike, 'assigneeUserId'>,
): boolean {
  if (viewer.canManageMembers) return true;
  return task.assigneeUserId !== null && task.assigneeUserId === viewer.id;
}

/** روزِ چندم از شروع — برای گروه‌بندیِ کارتِ عضو («روزِ ۲ · امروز»). */
export function dayNumber(start: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}
