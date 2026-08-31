/**
 * اختیارِ **پروژه‌محور**.
 *
 * ⚠️ چرا لازم است: تا پیش از این، مدیریتِ پروژه فقط یک مجوزِ **سراسری** بود
 * (`projects.manage`). یعنی «مدیرِ پروژه» یا هیچ‌چیز را نمی‌گرداند یا همه‌چیزِ
 * همهٔ پروژه‌ها را. نسخهٔ قبلی سه راه دارد و هر سه پروژه‌به‌پروژه‌اند:
 *
 * ۱. مجوزِ سراسری (مالک/ادمینِ پروژه‌ها)
 * ۲. امضا روی **همین** پروژه با تگی که دسترسیِ «مدیرِ پروژه» می‌دهد
 * ۳. مدیرِ دفتری که پروژه مالِ دفترِ اوست — یا روی پروژه امضا شده باشد
 *
 * راهِ دوم است که «مدیرِ پروژه» را ممکن می‌کند: کسی بدونِ هیچ دسترسیِ
 * سراسری، پروژهٔ خودش را کامل می‌گرداند و به بقیه دست نمی‌زند.
 */

/** مقدارِ `tags.grants_cap` که اختیارِ مدیریتِ پروژه می‌دهد. */
export const PM_CAP = 'pm';

/**
 * دسترسی‌هایی که یک تگِ نقشِ عضو می‌تواند بدهد — همان پنج‌تای نسخهٔ قبلی.
 *
 * ⚠️ چرا از راهِ تگ و نه فقط ساختار: مدلِ ذهنیِ مدیر «به این آدم نقشِ
 * حسابدار می‌دهم» است، نه «او را به دفتر X اساین می‌کنم و نقشِ finance
 * می‌دهم». هر دو راه باز است و تگ از هر دو ارزان‌تر است.
 *
 * ⚠️ اینها **اضافه** می‌کنند، هرگز کم نمی‌کنند: تگ نمی‌تواند دسترسیِ
 * ساختاری را پس بگیرد، وگرنه برداشتنِ یک تگ می‌توانست مدیرِ دفتر را
 * بی‌صدا از کار بیندازد.
 */
export const OFFICE_MANAGER_CAP = 'office_manager';
export const FINANCE_SCOPED_CAP = 'finance_scoped';
export const MANAGE_FINANCE_CAP = 'manage_finance';

export const GRANTABLE_CAPS: Array<{ value: string; label: string }> = [
  { value: '', label: 'بدونِ دسترسیِ خاص' },
  { value: PM_CAP, label: 'مدیرِ پروژه — مدیریتِ کاملِ پروژه‌هایی که رویشان امضا شده' },
  { value: OFFICE_MANAGER_CAP, label: 'مدیرِ تیم — مدیریتِ دفترهای اساین‌شده' },
  { value: FINANCE_SCOPED_CAP, label: 'حسابدار — فقط حساب‌های اساین‌شده' },
  { value: MANAGE_FINANCE_CAP, label: 'مدیرِ حسابداری — همهٔ حساب‌ها' },
];

export function isGrantableCap(value: string): boolean {
  return GRANTABLE_CAPS.some((c) => c.value === value);
}

export interface ProjectAuthority {
  /** مجوزِ سراسریِ `projects.manage`. */
  hasGlobalManage: boolean;
  /** روی همین پروژه با تگی امضا شده که `grants_cap = pm` دارد. */
  isPmOnProject: boolean;
  /** دفترِ مالکِ پروژه (`null` = بی‌دفتر). */
  projectOfficeId: number | null;
  /** دفاترِ تحتِ مدیریتِ کاربر. */
  managedOfficeIds: readonly number[];
  /** به هر شکلی روی پروژه امضا شده؟ */
  isMemberOfProject: boolean;
}

/**
 * مدیرِ دفترِ این پروژه است؟ — پورتِ `is_office_manager_of()`.
 *
 * ⚠️ دو شاخه دارد و شاخهٔ دوم به‌سادگی فراموش می‌شود: مدیرِ دفتر روی
 * پروژه‌های **دفترِ خودش** نیازی به امضا ندارد، ولی روی پروژهٔ دفترِ دیگر
 * فقط در صورتِ امضا اختیار دارد.
 */
export function isOfficeManagerOfProject(input: ProjectAuthority): boolean {
  if (input.managedOfficeIds.length === 0) return false;
  if (input.projectOfficeId !== null && input.managedOfficeIds.includes(input.projectOfficeId)) {
    return true;
  }
  return input.isMemberOfProject;
}

/** سه راهِ نسخهٔ قبلی، به همان ترتیب. */
export function canManageProject(input: ProjectAuthority): boolean {
  if (input.hasGlobalManage) return true;
  if (input.isPmOnProject) return true;
  return isOfficeManagerOfProject(input);
}
