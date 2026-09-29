/**
 * بردهای «تیمِ من» — پورتِ `render_projects_board` و `render_task_board`.
 *
 * قاعده‌ها این‌جا خالص‌اند تا هم سرویس و هم تست به آن تکیه کنند؛ کوئری‌ها
 * در `server/team/service.ts` می‌مانند.
 */

/** تعداد در صفحه — همان چهار گزینهٔ `pagination_bar` ِ نسخهٔ قبلی. */
export const BOARD_PER_PAGE = [10, 25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

/** مقدارِ آدرس ← تعدادِ مجاز؛ هر چیزِ دیگری پیش‌فرض می‌شود، نه خطا. */
export function perPageOf(raw: unknown): number {
  const n = Number(raw);
  return (BOARD_PER_PAGE as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE;
}

/** شمارهٔ صفحه ← عددِ صحیحِ مثبت، و نه بیشتر از آخرین صفحه. */
export function pageOf(raw: unknown, total: number, perPage: number): number {
  const n = Math.trunc(Number(raw)) || 1;
  const last = Math.max(1, Math.ceil(total / perPage));
  return Math.min(Math.max(1, n), last);
}

export function paginate<T>(items: readonly T[], page: number, perPage: number) {
  const total = items.length;
  const current = pageOf(page, total, perPage);
  return {
    items: items.slice((current - 1) * perPage, current * perPage),
    page: current,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * فیلترِ «عضو / نقش» ِ بردِ تسک.
 *
 * نسخهٔ قبلی `u:<id>` و `r:<id>` می‌فرستاد؛ این‌جا دو شکلِ قدیمیِ خودمان هم
 * پذیرفته می‌شود تا لینک‌های ذخیره‌شده نشکنند: عددِ خالی (= `u:`) و `0`
 * (= «بدونِ مسئول»).
 *
 * ⚠️ مقدارِ نامعتبر `null` است یعنی «بی‌فیلتر» — نه «هیچ تسکی»؛ لینکِ خراب
 * نباید برد را خالی نشان دهد و کاربر را به اشتباه بیندازد.
 */
export type AssigneeFilter =
  | { kind: 'none' }
  | { kind: 'user'; id: number }
  | { kind: 'role'; id: number }
  /**
   * «کارهای این عضو» (`m:`) — دریل‌داونِ پروفایل: هر تسکی که او می‌بیند و باید
   * انجام دهد، از جمله تسکِ نقشیِ ادعانشده (`open_for_user_in_projects`)؛ نه
   * فقط آنچه مستقیم به نامش است (`u:`).
   */
  | { kind: 'member'; id: number };

export function parseAssignee(raw: string | null | undefined): AssigneeFilter | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  if (value === '0') return { kind: 'none' };
  const match = /^(?:([urm]):)?(\d+)$/.exec(value);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (match[1] === 'r') return { kind: 'role', id };
  if (match[1] === 'm') return { kind: 'member', id };
  return { kind: 'user', id };
}

/** شکلِ آدرسیِ فیلتر — برعکسِ `parseAssignee`. */
export function assigneeParam(filter: AssigneeFilter | null): string {
  if (!filter) return '';
  if (filter.kind === 'none') return '0';
  const prefix = { user: 'u', role: 'r', member: 'm' }[filter.kind];
  return `${prefix}:${filter.id}`;
}

/**
 * گروه‌های وضعیتِ بردِ پروژه — ترتیبِ همان تب‌های صفحهٔ پروژه‌ها
 * (`domain/projects/tabs`)، تا یک پروژه در دو صفحه به دو ترتیب نیاید.
 */
export const PROJECT_BOARD_GROUPS = [
  'in_progress', 'lead', 'not_started', 'completed', 'on_hold', 'cancelled',
] as const;
export type ProjectBoardGroup = (typeof PROJECT_BOARD_GROUPS)[number];

export function isBoardGroup(value: unknown): value is ProjectBoardGroup {
  return (PROJECT_BOARD_GROUPS as readonly unknown[]).includes(value);
}

/**
 * شمارِ هر گروه + «همه». گروهِ خالی تب ندارد (همان `empty( $counts[..] )`)،
 * و پروژهٔ بی‌گروه فقط زیرِ «همه» می‌آید.
 */
export function groupTabs(projects: ReadonlyArray<{ statusGroup: string | null }>) {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (p.statusGroup) counts.set(p.statusGroup, (counts.get(p.statusGroup) ?? 0) + 1);
  }
  return {
    all: projects.length,
    groups: PROJECT_BOARD_GROUPS
      .filter((g) => (counts.get(g) ?? 0) > 0)
      .map((g) => ({ key: g, count: counts.get(g)! })),
  };
}

export function inGroup(project: { statusGroup: string | null }, group: ProjectBoardGroup | null): boolean {
  return group === null || project.statusGroup === group;
}

/** درصدِ پیشرفت از شمارِ انجام‌شده‌ها — همان `Tasks::progress` (بی‌تسک = صفر). */
export function progressPercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/**
 * تب‌های «تیمِ من». ⚠️ این‌جا، نه در `team-tabs.tsx`: صفحهٔ سرور تب را از
 * آدرس اعتبارسنجی می‌کند، و ثابتی که از ماژولِ 'use client' صادر شود روی سرور
 * فقط «ارجاعِ کلاینتی» است — `.includes` رویش خطا می‌داد (دیده شد).
 */
export const TEAM_TABS = ['members', 'projects', 'tasks', 'review', 'comments'] as const;
export type TeamTab = (typeof TEAM_TABS)[number];
