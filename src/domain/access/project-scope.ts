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
 * دسترسی‌هایی که یک تگِ نقشِ عضو می‌تواند بدهد.
 *
 * ⚠️ فقط همین یکی منتقل شده و عمدی است: بقیهٔ capهای نسخهٔ قبلی در اپ از راهِ
 * ساختاری‌تری می‌آیند — مدیرِ دفتر از `user_offices.manages`، مدیرِ مالی از
 * نقشِ `finance`، و حسابدارِ محدود از دامنهٔ حساب. تکرارشان اینجا یعنی دو
 * منبعِ حقیقت برای یک چیز.
 */
export const GRANTABLE_CAPS: Array<{ value: string; label: string }> = [
  { value: '', label: 'بدونِ دسترسیِ خاص' },
  { value: PM_CAP, label: 'مدیرِ پروژه (مدیریتِ کاملِ پروژه‌هایی که رویشان امضا شده)' },
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
