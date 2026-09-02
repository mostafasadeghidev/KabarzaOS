/**
 * برداشتنِ تسک (claim) و بردِ کانبان — قواعدِ خالص.
 *
 * منبع: /
 * `render_task_bucket()`.
 */

export interface TaskRoleRef {
  roleTagId: number;
  claimedBy: number | null;
}

export interface ClaimInput {
  assignedTo: number | null;
  roles: readonly TaskRoleRef[];
  /** نقشِ عضویت‌های پروژه: نقش ← شناسهٔ اعضایی که آن نقش را دارند. */
  roleHolders: ReadonlyMap<number, readonly number[]>;
  userId: number;
}

/**
 * آیا این کاربر می‌تواند این تسک را بردارد؟
 *
 * سه شرط، و شرطِ سوم همان ظرافتی است که راحت از قلم می‌افتد:
 *  ۱. تسک **مسئولِ مشخص** نداشته باشد
 *  ۲. تسک نقش داشته باشد و آن نقش هنوز برداشته نشده باشد
 *  ۳. کاربر آن نقش را داشته باشد **و بیش از یک نفر** آن نقش را داشته باشند
 *
 * ⚠️ شرطِ سوم: اگر تنها دارندهٔ آن نقش شمایید، «برداشتن» بی‌معناست — تسک
 * از پیش مالِ شماست. دکمه‌ای که هیچ چیزی را عوض نمی‌کند فقط کاربر را
 * سردرگم می‌کند.
 */
export function canClaimTask(input: ClaimInput): boolean {
  if (input.assignedTo) return false;
  if (input.roles.length === 0) return false;

  return input.roles.some((role) => {
    if (role.claimedBy) return false;
    const holders = input.roleHolders.get(role.roleTagId) ?? [];
    return holders.includes(input.userId) && holders.length > 1;
  });
}

/**
 * همهٔ نقش‌هایی که با برداشتن به این کاربر می‌رسند — پورتِ `Tasks::claim()`:
 * **هر** نقشِ برداشته‌نشده‌ای که کاربر دارد، نه فقط اولی. تسک نقشی می‌ماند
 * (`assigned_to` دست نمی‌خورد)؛ دارندگانِ نقش‌های دیگرِ تسک همچنان می‌بینندش.
 *
 * ⚠️ پیش از این فقط یک نقش برداشته می‌شد **و** `assignedTo` ست می‌شد: تسکِ
 * چندنقشه یک‌نفره می‌شد و صاحبانِ نقش‌های دیگر تسک و اعلانش را از دست می‌دادند.
 */
export function claimableRoleIds(input: ClaimInput): number[] {
  if (!canClaimTask(input)) return [];
  return input.roles
    .filter((r) => !r.claimedBy && (input.roleHolders.get(r.roleTagId) ?? []).includes(input.userId))
    .map((r) => r.roleTagId);
}

/** نقشی که با برداشتن به این کاربر می‌رسد (اولین نقشِ واجدِ شرایط). */
export function claimableRoleId(input: ClaimInput): number | null {
  if (!canClaimTask(input)) return null;
  const role = input.roles.find((r) => {
    if (r.claimedBy) return false;
    const holders = input.roleHolders.get(r.roleTagId) ?? [];
    return holders.includes(input.userId) && holders.length > 1;
  });
  return role?.roleTagId ?? null;
}

/* ------------------------------------------------------------------ *
 * بردِ کانبان
 * ------------------------------------------------------------------ */

/**
 * ستون‌های برد از **گروهِ وضعیت** می‌آیند، نه از تک‌تکِ تگ‌ها.
 * ⚠️ همان گروه‌هایی که نسخهٔ قبلی برای پایپ‌لاینِ پروژه استفاده می‌کند، تا برد و
 * فهرست دو زبانِ متفاوت حرف نزنند.
 */
export const BOARD_COLUMNS = [
  { group: 'not_started', label: 'شروع نشده' },
  { group: 'in_progress', label: 'در حال انجام' },
  { group: 'review', label: 'نیازمند بررسی' },
  { group: 'complete', label: 'انجام‌شده' },
] as const;

export type BoardGroup = (typeof BOARD_COLUMNS)[number]['group'];

/**
 * ستونِ یک تسک.
 * ⚠️ تسکِ بی‌وضعیت یا با گروهِ ناشناخته در «شروع نشده» می‌افتد، نه اینکه از
 * برد **غایب** شود — تسکِ نامرئی همان تسکِ فراموش‌شده است.
 */
export function boardColumn(statusGroup: string | null, isReview: boolean): BoardGroup {
  if (isReview) return 'review';
  const known = BOARD_COLUMNS.some((c) => c.group === statusGroup);
  return known ? (statusGroup as BoardGroup) : 'not_started';
}

export interface BoardTask {
  id: number;
  statusGroup: string | null;
  isReview: boolean;
}

/** گروه‌بندیِ تسک‌ها در ستون‌ها — ترتیبِ ورودی حفظ می‌شود. */
export function groupIntoColumns<T extends BoardTask>(tasks: readonly T[]): Map<BoardGroup, T[]> {
  const out = new Map<BoardGroup, T[]>(BOARD_COLUMNS.map((c) => [c.group, [] as T[]]));
  for (const task of tasks) {
    const column = boardColumn(task.statusGroup, task.isReview);
    out.get(column)!.push(task);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * صفحه‌بندی
 * ------------------------------------------------------------------ */

export interface Page<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

/**
 * صفحه‌بندی.
 * ⚠️ شمارهٔ صفحهٔ بیرون از بازه به نزدیک‌ترین صفحهٔ معتبر بسته می‌شود، نه
 * اینکه فهرستِ خالی بدهد؛ کاربری که «صفحهٔ ۹۹» را باز می‌کند باید چیزی ببیند.
 */
export function paginate<T>(items: readonly T[], page: number, perPage = 25): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (current - 1) * perPage;
  return { items: items.slice(start, start + perPage), page: current, pages, total };
}
