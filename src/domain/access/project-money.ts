import { canManageSection, type Actor } from './permissions';

/**
 * چه کسی **پولِ پروژه** را می‌بیند.
 *
 * ⚠️ این با «مدیریتِ پروژه» یکی نیست و همین جای اشتباه است. در نسخهٔ قبلی
 * (`class-dashboard.php` → `project_view()`):
 *
 * ```php
 * $as_member    = $is_member && ! is_client_of($p) && ! can('kteam_manage_projects');
 * $see_money    = can('kteam_manage_projects') || can('kteam_manage_finance');
 * $show_finance = $as_member || $see_money || is_client_of($p);
 * ```
 *
 * یعنی سه دستهٔ کاملاً جدا:
 *
 * | کیست | چه می‌بیند |
 * |---|---|
 * | مالک / مدیرِ سراسریِ پروژه‌ها / مدیرِ مالی | **قیمتِ پروژه** |
 * | کارفرمای همین پروژه | **قیمتِ پروژه** — صورت‌حسابِ خودش است |
 * | عضوِ عادی | فقط **دستمزدِ توافقیِ خودش**، نه قیمت |
 * | مدیرِ پروژه / مدیرِ دفتر (بدونِ مجوزِ سراسری) | **هیچ** — نه تبِ مالی |
 *
 * ⚠️ مدیرِ پروژه و مدیرِ دفتر عمداً بیرون‌اند: کامنتِ خودِ نسخهٔ قبلی
 * می‌گوید «A team/office manager or pure project manager does NOT — no
 * finance tab». آنها کار را می‌گردانند، نه قرارداد را.
 *
 * ⚠️ پیش از این قیمت **بی‌هیچ محافظی** رندر می‌شد — روی کارتِ پروژه و روی
 * کارتِ «مبلغ» ِ صفحهٔ پروژه — پس هر عضوی قیمتِ قراردادِ کارفرما را
 * می‌دید.
 */

export interface MoneyAudience {
  /** مجوزِ سراسریِ `projects.manage`. */
  hasGlobalProjectManage: boolean;
  /** مجوزِ سراسریِ مدیریتِ مالی. */
  hasGlobalFinanceManage: boolean;
  /** کارفرمای **همین** پروژه است؟ */
  isClientOfProject: boolean;
  /** به هر نقشی روی **همین** پروژه امضا شده؟ */
  isMemberOfProject: boolean;
}

/**
 * قیمتِ پروژه (و مانده و دریافتیِ کارفرما) را می‌بیند؟
 *
 * ⚠️ عضویت اینجا هیچ وزنی ندارد؛ عمداً. عضو بودن به معنیِ دیدنِ قیمت نیست.
 */
export function canSeeProjectPrice(a: MoneyAudience): boolean {
  if (a.hasGlobalProjectManage || a.hasGlobalFinanceManage) return true;
  return a.isClientOfProject;
}

/**
 * «عضوِ خالص» — کسی که فقط دستمزدِ **خودش** را می‌بیند.
 *
 * ⚠️ کارفرمایی که هم‌زمان عضو است، عضوِ خالص نیست: او قیمت را می‌بیند و
 * جمعِ پروژه برایش معنا دارد.
 */
export function isPlainMember(a: MoneyAudience): boolean {
  return a.isMemberOfProject && !a.isClientOfProject && !a.hasGlobalProjectManage;
}

/** تبِ مالیِ پروژه اصلاً ساخته شود؟ */
export function canSeeProjectFinance(a: MoneyAudience): boolean {
  return canSeeProjectPrice(a) || isPlainMember(a);
}

/**
 * مبلغِ **اعضا** (توافقی، نرخِ واحد، ارز) را می‌بیند و عوض می‌کند؟ (۱.۱۱۹.۱)
 *
 * ⚠️ همان دو در ورودیِ قیمتِ پروژه — مدیرِ سراسریِ پروژه‌ها و مدیرِ مالی.
 * مدیرِ پروژه و مدیرِ تیم اعضا را اضافه و کم می‌کنند و نقش می‌دهند، ولی
 * پول را نه: «A team/office manager or pure project manager does NOT — no
 * finance tab». پیش از این فرمِ «مدیریتِ اعضا» و افزودنِ سریعِ کارت مبلغِ
 * همه را به مدیرِ پروژه نشان می‌دادند و می‌گذاشتند عوضش کند.
 */
export function canEditTeamMoney(actor: Actor): boolean {
  return canManageSection(actor, 'projects') || canManageSection(actor, 'finance');
}
