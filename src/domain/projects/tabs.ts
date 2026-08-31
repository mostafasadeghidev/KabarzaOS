/**
 * تب‌های نمای کارتِ پروژه‌ها — قواعد عیناً از نسخهٔ قبلی (`card_matches_tab`).
 *
 * این منطق در دامنه است چون هم UI و هم تستِ خودکار به آن نیاز دارند —
 * و چون قواعدش ظریف‌اند (بایگانی همه‌جا را رد می‌کند).
 */

export type TabKey =
  | 'all' | 'not_started' | 'lead' | 'in_progress' | 'completed'
  | 'on_hold' | 'cancelled' | 'tender' | 'review' | 'overdue' | 'archived';

export const TAB_LABELS: Record<TabKey, string> = {
  all: 'همه',
  not_started: 'شروع نشده',
  lead: 'احتمالِ عقد قرارداد',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  on_hold: 'نگه‌داشته‌شده',
  cancelled: 'کنسل‌شده',
  tender: 'مناقصه',
  review: 'نیازمند بررسی',
  overdue: 'گذشته از ددلاین',
  archived: 'بایگانی',
};

/** ترتیبِ نمایش — «همه» اول، «بایگانی» آخر. */
export const TAB_ORDER: TabKey[] = [
  'all', 'not_started', 'lead', 'in_progress', 'completed',
  'on_hold', 'cancelled', 'tender', 'review', 'overdue', 'archived',
];

export interface TabbableProject {
  statusGroup: string | null;
  isTender: boolean;
  isArchived: boolean;
  isOverdue: boolean;
  reviewCount: number;
}

/**
 * ⚠️ قاعدهٔ کلیدی: پروژهٔ بایگانی‌شده **فقط** در تبِ بایگانی دیده می‌شود —
 * حتی اگر شرطِ تبِ دیگری را داشته باشد. بدونِ این، پروژهٔ بایگانی‌شده در
 * «در حال انجام» هم می‌ماند و شمارش‌ها دوتایی می‌شوند.
 */
export function matchesTab(tab: TabKey, project: TabbableProject): boolean {
  if (tab === 'archived') return project.isArchived;
  if (project.isArchived) return false;

  switch (tab) {
    case 'all': return true;
    case 'tender': return project.isTender;
    case 'review': return project.reviewCount > 0;
    case 'overdue': return project.isOverdue;
    default: return project.statusGroup === tab;
  }
}

export interface TabInfo {
  key: TabKey;
  label: string;
  count: number;
  /** تبِ خالی مخفی می‌شود — به‌جز «همه». */
  hidden: boolean;
  active: boolean;
}

/**
 * ساختِ تب‌ها با شمارش.
 * تبِ درخواست‌شده (deep-link) همیشه نمایش داده می‌شود، حتی اگر خالی باشد.
 * وگرنه اولین تبِ **غیرمخفی** فعال می‌شود.
 */
export function buildTabs(projects: TabbableProject[], requested?: string | null): TabInfo[] {
  const want = TAB_ORDER.includes(requested as TabKey) ? (requested as TabKey) : null;

  const rows = TAB_ORDER.map((key) => {
    const count = projects.filter((p) => matchesTab(key, p)).length;
    return { key, label: TAB_LABELS[key], count, hidden: key !== 'all' && count === 0, active: false };
  });

  if (want) {
    for (const row of rows) {
      if (row.key === want) {
        row.hidden = false;   // تبِ deep-link همیشه دیده می‌شود
        row.active = true;
      }
    }
    return rows;
  }

  const first = rows.find((r) => !r.hidden);
  if (first) first.active = true;
  return rows;
}

/** کلیدِ تبِ فعال از فهرستِ ساخته‌شده. */
export function activeTab(tabs: TabInfo[]): TabKey {
  return tabs.find((t) => t.active)?.key ?? 'all';
}
