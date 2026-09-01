import type { TagType } from '@/db/schema/base';

/**
 * معنیِ ستونِ `status_group` **به نوعِ تگ بستگی دارد** — بازاستفادهٔ عمدیِ
 * یک ستون (R-PROJ-16: منطق به status_group تکیه کند، نه به نام):
 *
 * | نوعِ تگ           | معنی                                  |
 * |-------------------|---------------------------------------|
 * | `project_status`  | تبِ خط‌لوله در نمای پروژه‌ها           |
 * | `task_status`     | ستونِ کانبان                           |
 * | `ledger_category` | **جهتِ حسابداری** (واریز/برداشت/هردو)  |
 * | بقیه              | بی‌استفاده                             |
 *
 * ⚠️ بدونِ این نگاشت فرمِ تگ نمی‌داند چه بپرسد، و کاربر فیلدی می‌بیند که
 * نمی‌داند چه اثری دارد.
 */

export interface GroupChoice {
  value: string;
  label: string;
}

/** ستون‌های کانبانِ تسک. */
export const TASK_STATUS_GROUPS: GroupChoice[] = [
  { value: 'todo', label: 'برای انجام' },
  { value: 'in_progress', label: 'در حالِ انجام' },
  { value: 'complete', label: 'تکمیل' },
];

/**
 * برچسبِ گروه با کلیدش — برای منوهایی که سرگروه نشان می‌دهند.
 *
 * ⚠️ چرا اینجا و نه در خودِ منو: `status-picker` و `tasks-tab` هرکدام
 * رونوشتِ خودشان را داشتند و رونوشتِ اولی از افزونه فاصله گرفته بود
 * («متوقف» به‌جای «نگه‌داشته‌شده»، «لغوشده» به‌جای «کنسل‌شده»). یک منبع،
 * یک جواب.
 */
export function groupLabels(choices: GroupChoice[]): Record<string, string> {
  return Object.fromEntries(choices.map((c) => [c.value, c.label]));
}

/** تب‌های خط‌لوله در نمای پروژه‌ها. */
export const PROJECT_STATUS_GROUPS: GroupChoice[] = [
  { value: 'not_started', label: 'شروع نشده' },
  { value: 'lead', label: 'احتمالِ عقدِ قرارداد' },
  { value: 'in_progress', label: 'در حالِ انجام' },
  { value: 'completed', label: 'تکمیل‌شده' },
  { value: 'on_hold', label: 'نگه‌داشته‌شده' },
  { value: 'cancelled', label: 'کنسل‌شده' },
];

/**
 * جهتِ حسابداریِ تگِ دفترکل.
 *
 * ⚠️ «هردو» رشتهٔ خالی است و پیش‌فرض: تگی که جهت ندارد هم در واریز و هم در
 * برداشت دیده می‌شود، پس تا وقتی مدیر جهتی تعیین نکرده هیچ تگی از فهرست
 * ناپدید نمی‌شود.
 */
export const LEDGER_DIRECTIONS: GroupChoice[] = [
  { value: '', label: 'هردو (واریز و برداشت)' },
  { value: 'in', label: 'واریز' },
  { value: 'out', label: 'برداشت' },
];

/** گزینه‌های `status_group` برای یک نوع؛ خالی یعنی این نوع گروه ندارد. */
export function groupChoices(type: TagType): GroupChoice[] {
  switch (type) {
    case 'task_status': return TASK_STATUS_GROUPS;
    case 'project_status': return PROJECT_STATUS_GROUPS;
    case 'ledger_category': return LEDGER_DIRECTIONS;
    default: return [];
  }
}

/** برچسبِ خودِ فیلد — چون معنایش با نوع عوض می‌شود. */
export function groupFieldLabel(type: TagType): string {
  switch (type) {
    case 'task_status': return 'ستونِ کانبان';
    case 'project_status': return 'تبِ خط‌لوله';
    case 'ledger_category': return 'جهتِ حسابداری';
    default: return '';
  }
}

/** این نوع نشانهٔ «تمام‌شده» می‌پذیرد؟ */
export function supportsClosed(type: TagType): boolean {
  return type === 'task_status' || type === 'project_status';
}

/** نشانهٔ «ستونِ بررسی» فقط برای وضعیتِ تسک. */
export function supportsReview(type: TagType): boolean {
  return type === 'task_status';
}

/** دسترسی‌دادن فقط از تگِ نقشِ عضو برمی‌آید. */
export function supportsGrant(type: TagType): boolean {
  return type === 'member_role';
}

/** مقدارِ گروه معتبر است؟ (خالی همیشه مجاز) */
export function isValidGroup(type: TagType, value: string): boolean {
  if (value === '') return true;
  return groupChoices(type).some((c) => c.value === value);
}

/** جهتِ یک تگِ دفترکل — نامعتبر و خالی هر دو «هردو» می‌شوند. */
export function ledgerDirection(statusGroup: string): 'in' | 'out' | 'both' {
  return statusGroup === 'in' || statusGroup === 'out' ? statusGroup : 'both';
}

/** این تگ در فهرستِ جهتِ خواسته‌شده دیده می‌شود؟ */
export function matchesDirection(statusGroup: string, want: 'in' | 'out'): boolean {
  const dir = ledgerDirection(statusGroup);
  return dir === 'both' || dir === want;
}
