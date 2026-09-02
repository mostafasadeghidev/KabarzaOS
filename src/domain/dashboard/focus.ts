/**
 * فهرست‌های متمرکزِ داشبورد — پورتِ `class-focus-page.php` ِ افزونه.
 *
 * کارت‌های «منتظرِ اقدام» به‌جای صفحهٔ عمومی، فهرستِ همان مورد را باز می‌کنند:
 * مناقصه‌های منتظرِ تصمیم / ددلاینِ نزدیک (پروژه‌محور) و تسک‌ها / کامنت‌های
 * نیازمندِ بررسی (ریزِ هر مورد، گروه‌بندی به‌ازای پروژه).
 */

export const FOCUS_VIEWS = ['bids_pending', 'deadline_soon', 'tasks_review', 'comments_review'] as const;
export type FocusView = (typeof FOCUS_VIEWS)[number];

export function isFocusView(value: unknown): value is FocusView {
  return typeof value === 'string' && (FOCUS_VIEWS as readonly string[]).includes(value);
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

/** روزهای مانده تا تاریخ (کف‌بندی‌شده؛ امروز = ۰). */
export function daysUntil(today: string, date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** پورتِ نشانِ ددلاین: «امروز» یا «n روز مانده». */
export function deadlineBadge(days: number, t: Translator): string {
  return days === 0 ? t('امروز') : t('{n} روز مانده', { n: days });
}

/** پورتِ `wp_trim_words(…, 12, '…')` روی متنِ بی‌تگ. */
export function excerptWords(body: string, words = 12): string {
  const plain = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain === '') return '';
  const parts = plain.split(' ');
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : plain;
}

export interface ThreadRow {
  id: number;
  parentId: number | null;
  status: string;
}

/**
 * پورتِ `threads_for_projects` + `subtree_max`: رشته‌های **باز** (ریشه با
 * `needs_review`) و تازه‌ترین پیامِ هر رشته (بزرگ‌ترین شناسه در زیردرخت).
 */
export function openThreads<T extends ThreadRow>(rows: readonly T[]): Array<{ root: T; latest: T }> {
  const byId = new Map<number, T>();
  const children = new Map<number, number[]>();
  for (const r of rows) {
    byId.set(r.id, r);
    if (r.parentId !== null) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
  }
  const subtreeMax = (id: number): number =>
    (children.get(id) ?? []).reduce((max, child) => Math.max(max, subtreeMax(child)), id);

  return rows
    .filter((r) => r.parentId === null && r.status === 'needs_review')
    .map((root) => ({ root, latest: byId.get(subtreeMax(root.id)) ?? root }));
}

/** پیوندِ هر ردیف: پروژه روی تبِ درست (تسک‌ها → زیرتبِ «نیازمند بررسی»). */
export function focusHref(view: FocusView, projectId: number): string {
  switch (view) {
    case 'bids_pending': return `/projects/${projectId}?tab=tender`;
    case 'tasks_review': return `/projects/${projectId}?tab=tasks&view=review`;
    case 'comments_review': return `/projects/${projectId}?tab=comments`;
    default: return `/projects/${projectId}`;
  }
}

/** گروه‌بندی با حفظِ ترتیبِ ورود (ترتیبِ اولویت از کوئری می‌آید). */
export function groupByProject<T extends { projectId: number }>(items: readonly T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const it of items) out.set(it.projectId, [...(out.get(it.projectId) ?? []), it]);
  return out;
}
