import { type MoneyAudience, isPlainMember } from './project-money';

/**
 * کدام ردیف‌های پرداختِ پروژه برای این بیننده است.
 *
 * منبع: «بخشِ مالی» ِ `class-dashboard.php` (۴۵۹۵–۴۶۰۵): کارفرما فقط
 * قیمت، هزینه‌های قابلِ صورتحساب و پرداخت‌های خودش را می‌بیند؛ پرداخت به
 * اعضا و هزینه‌های جذب‌شده داخلی‌اند.
 *
 * ⚠️ چرا این تابع لازم بود: تبِ مالی برای هر کسی که «مالی را می‌بیند» — که
 * کارفرما هم هست — همهٔ ردیف‌ها را بار می‌کرد، از جمله «پرداخت به عضو». یعنی
 * کارفرما دستمزدِ تک‌تکِ اعضا را می‌دید. کارت‌های خلاصه (قیمت/پرداختی/بدهی)
 * درست بودند؛ فهرست نه.
 *
 *  - مجوزِ سراسری (پروژه‌ها یا مالی) → همه.
 *  - کارفرمای پروژه بدونِ مجوزِ سراسری → دریافتی‌ها + هزینهٔ قابلِ صورتحساب.
 *  - عضوِ خالص → فقط پرداخت‌های **خودش**؛ بقیه چیزی نمی‌بینند.
 */
export type PaymentDirection = 'incoming' | 'member_payout' | 'project_expense' | 'project_cost';

export const CLIENT_VISIBLE_DIRECTIONS: readonly PaymentDirection[] = ['incoming', 'project_cost'];

export function visiblePayments<T extends { direction: string; userId: number | null }>(
  audience: MoneyAudience,
  viewerId: number,
  payments: readonly T[],
): T[] {
  if (audience.hasGlobalProjectManage || audience.hasGlobalFinanceManage) return [...payments];
  if (audience.isClientOfProject) {
    return payments.filter((p) => (CLIENT_VISIBLE_DIRECTIONS as readonly string[]).includes(p.direction));
  }
  if (isPlainMember(audience)) {
    return payments.filter((p) => p.direction === 'member_payout' && p.userId === viewerId);
  }
  return [];
}
