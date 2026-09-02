import type { Role } from './permissions';

/**
 * چه کسی را می‌شود از صفحهٔ «افراد» ویرایش کرد.
 *
 * منبع: `Admin\People_Page` (۱۶۴–۱۶۶، ۴۲۹–۴۳۱) و `Support\People::save_extras`
 * (۳۹۵–۳۹۹) — صفحهٔ افراد فقط کاربرانِ **همان نقشِ بخش** را ذخیره می‌کند و
 * مدیرِ سیستم را هرگز دست نمی‌زند.
 *
 * ⚠️ چرا این قاعده جدا از «مجوزِ مدیریتِ اعضا» است: مجوز می‌گوید بازیگر
 * می‌تواند اعضا را مدیریت کند؛ نمی‌گوید **چه کسی** عضو است. بدونِ این چک،
 * همکارِ ادمینی که «اعضا → مدیریت» گرفته می‌توانست شناسهٔ مالک را بفرستد و
 * نام، ایمیل، نامِ کاربری یا رمزِ او را عوض کند — تصاحبِ کاملِ حساب. مسیرِ
 * حذف از اول این چک را داشت (`planRemovePerson.isSystemAdmin`)؛ ویرایش،
 * تغییرِ وضعیت و رمز نداشتند.
 *
 * قاعده:
 *  - هدف `owner` دارد → از این صفحه هرگز ویرایش نمی‌شود، حتی به دستِ خودش.
 *    مالک خودش را از پروفایل ویرایش می‌کند؛ رمزش هم همان‌جا.
 *  - هدف `admin` (همکارِ ادمین) دارد → فقط مالک (R-RBAC-10: تنها مالک
 *    دسترسیِ همکار را تغییر می‌دهد — هویتش هم همین حکم را دارد).
 *  - در غیرِ این صورت آزاد است.
 */
export type PeopleEditVerdict = 'ok' | 'owner_protected' | 'owner_only';

export function canEditPerson(input: {
  actorRoles: readonly Role[];
  targetRoles: readonly Role[];
}): PeopleEditVerdict {
  if (input.targetRoles.includes('owner')) return 'owner_protected';
  if (input.targetRoles.includes('admin') && !input.actorRoles.includes('owner')) {
    return 'owner_only';
  }
  return 'ok';
}
