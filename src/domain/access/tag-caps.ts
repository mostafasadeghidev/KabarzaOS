import { FINANCE_SCOPED_CAP, MANAGE_FINANCE_CAP } from './project-scope';
import type { Permission } from './permissions';

/**
 * دسترسی‌هایی که **تگِ نقشِ عضو** می‌دهد — پورتِ `People::sync_caps_from_tags()`.
 *
 * ⚠️ پیش از این تگ‌های «حسابدار» (`finance_scoped`) و «مدیر حسابداری»
 * (`manage_finance`) فقط برچسب بودند: مدیر در فرمِ افراد تگ را می‌داد و هیچ
 * چیزی باز نمی‌شد. نسخهٔ قبلی با هر تغییرِ تگ، cap ِ واقعی می‌نوشت:
 * `manage_finance ⇒ finance_scoped ⇒ access_admin`.
 *
 * اینجا به‌جای نوشتنِ ردیفِ مجوز، دسترسی **هر بار از تگ‌ها مشتق** می‌شود
 * (همان قاعده‌ای که مجوزِ per-user را هم هر بار از دیتابیس می‌خواند): برداشتنِ
 * تگ همان لحظه اثر می‌کند و هیچ ردیفِ یتیمی نمی‌ماند.
 *
 * · «مدیر حسابداری» → دیدن و مدیریتِ مالی (همهٔ حساب‌ها).
 * · «حسابدار» → دیدنِ مالی؛ دامنه‌اش حساب‌های تخصیص‌یافته است (R-ACC-02) و
 *   روی همان حساب‌ها می‌نویسد.
 * · `pm` و `office_manager` ساختاری‌اند (عضویت/دفتر) و اینجا نمی‌آیند.
 */
export function permissionsFromCaps(caps: readonly string[]): Permission[] {
  const out = new Set<Permission>();
  for (const cap of caps) {
    if (cap === MANAGE_FINANCE_CAP) {
      out.add('finance.view');
      out.add('finance.manage');
    } else if (cap === FINANCE_SCOPED_CAP) {
      out.add('finance.view');
    }
  }
  return [...out];
}

/** دارندهٔ تگِ «حسابدار» یا «مدیر حسابداری» — کاندیدای تخصیص به حساب. */
export function hasFinanceCap(caps: readonly string[]): boolean {
  return caps.includes(FINANCE_SCOPED_CAP) || caps.includes(MANAGE_FINANCE_CAP);
}
