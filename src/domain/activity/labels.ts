/**
 * برچسبِ فارسیِ رویدادهای ممیزی.
 *
 * ⚠️ فهرست باید با **همهٔ** کلیدهایی که سرویس‌ها می‌نویسند بخواند، وگرنه صفحهٔ
 * فعالیت کلیدِ خام (`person.permissions`) را به کاربر نشان می‌دهد. تستِ کنارِ
 * این فایل همین را می‌پاید.
 */

export const ACTION_LABELS: Record<string, string> = {
  // پروفایل و شرکت
  'profile.bank': 'ویرایشِ اطلاعاتِ بانکی',
  'profile.password': 'تغییرِ رمزِ خود',
  'person.password': 'تعیینِ رمز برای فرد',
  'company.update': 'ویرایشِ مشخصاتِ شرکت',

  // مرخصی
  'absence.set': 'ثبتِ مرخصی',
  'absence.delete': 'حذفِ مرخصی',

  // پروژه
  'project.create': 'پروژهٔ جدید',
  'project.update': 'ویرایشِ پروژه',
  'project.status': 'تغییرِ وضعیتِ پروژه',
  'project.archive': 'بایگانی',
  'project.lighten': 'سبک‌سازیِ پروژه',
  // ⚠️ حذف `project.delete.${plan.financial}` می‌نویسد — none/detach/purge —
  // نه soft/hard. با دو کلیدِ قبلی، هر سه گونهٔ واقعی خام رندر می‌شدند.
  'project.delete.none': 'حذفِ پروژه',
  'project.delete.detach': 'حذفِ پروژه (ردیف‌های مالی جدا ماند)',
  'project.delete.purge': 'حذفِ کاملِ پروژه با ردیف‌های مالی',
  'members.set': 'تغییرِ اعضای پروژه',
  'member.add': 'افزودنِ عضو به پروژه',
  'client.add': 'افزودنِ کارفرما به پروژه',
  'clients.set': 'تغییرِ کارفرمایانِ پروژه',
  'tender.announce': 'اعلامِ مناقصه به نقش‌های تازه',
  'bid.submit': 'ثبتِ پیشنهادِ مناقصه',
  'bid.update': 'ویرایشِ پیشنهادِ مناقصه',
  'bid.approve': 'تأییدِ پیشنهاد',
  'bid.withdraw': 'پس‌گرفتنِ پیشنهاد',

  // تسک و نظر
  'task.create': 'تسکِ جدید',
  'task.update': 'ویرایشِ تسک',
  'task.status': 'وضعیتِ تسک',
  'task.delete': 'حذفِ تسک',
  'task.note': 'یادداشتِ تسک',
  'task.claim': 'برداشتنِ تسک',
  'comment.add': 'نظر',
  'comment.status': 'ریویو',
  'comment.delete': 'حذفِ کامنت',

  // QA
  'qa.apply': 'اعمالِ چک‌لیستِ QA',
  'qa.toggle': 'تیکِ QA',
  'qa.create': 'آیتمِ جدیدِ QA',
  'qa.update': 'ویرایشِ آیتمِ QA',
  'qa.delete': 'حذفِ آیتمِ کتابخانهٔ QA',
  'qa.item_delete': 'حذفِ آیتمِ QA ِ پروژه',
  'qa.role_remove': 'برداشتنِ QA ِ یک نقش',

  // مالی
  'ledger.create': 'ثبتِ ردیفِ دفتر',
  'ledger.update': 'ویرایشِ ردیفِ دفتر',
  'ledger.delete': 'حذفِ ردیفِ دفتر',
  'ledger.transfer': 'انتقالِ داخلی',
  'account.save': 'ذخیرهٔ حساب',
  'account.delete': 'حذفِ حساب',
  'request.paid': 'پرداختِ درخواست',
  'unit.paid': 'پرداختِ مستقیمِ کارکرد',
  'request.approved': 'تأییدِ درخواست',
  'request.rejected': 'ردِ درخواست',
  'recurring.create': 'هزینهٔ دوره‌ایِ جدید',
  'recurring.update': 'ویرایشِ هزینهٔ دوره‌ای',
  'recurring.pay': 'پرداختِ هزینهٔ دوره‌ای',
  'recurring.delete': 'حذفِ هزینهٔ دوره‌ای',

  // کارکردِ تعدادی و درخواستِ عضو
  'unit.add': 'ثبتِ کارکرد',
  'unit.delete': 'حذفِ کارکرد',
  'request.create': 'درخواستِ پرداخت',
  'request.cancel': 'لغوِ درخواستِ پرداخت',

  // ساعتِ کاری
  'timelog.add': 'ثبتِ ساعت',
  'timelog.merge': 'افزودن به ساعتِ همان روز',
  'timelog.update': 'ویرایشِ ساعت',
  'timelog.delete': 'حذفِ ساعت',

  // افراد
  'person.create': 'فردِ جدید',
  'person.update': 'ویرایشِ فرد',
  'person.attach': 'افزودنِ نقش',
  'person.staff.grant': 'افزودن به همکارانِ ادمین',
  'person.staff.revoke': 'برداشتن از همکارانِ ادمین',
  'person.state': 'تغییرِ حالتِ عضو',
  'person.permissions': 'تغییرِ دسترسی‌ها',
  'person.remove.detached': 'جداسازی از این بخش',
  'person.remove.deactivated': 'قطعِ دسترسیِ فرد',
  'person.remove.deleted': 'حذفِ فرد',
  'person.remove.noop': 'حذف — بدونِ تغییر',

  // جلسات و تنظیمات
  'meeting.create': 'جلسهٔ جدید',
  'meeting.update': 'ویرایشِ جلسه',
  'meeting.delete': 'حذفِ جلسه',
  'currency.create': 'ارزِ جدید',
  'currency.update': 'ویرایشِ ارز',
  'currency.default': 'تغییرِ ارزِ پیش‌فرض',
  'currency.delete': 'حذفِ ارز',
  'rate.create': 'نرخِ جدید',
  'rate.delete': 'حذفِ نرخ',
  'tag.create': 'تگِ جدید',
  'tag.update': 'ویرایشِ تگ',
  'tag.delete': 'حذفِ تگ',
  'office.create': 'دفترِ جدید',
  'office.update': 'ویرایشِ دفتر',
  'office.deactivate': 'غیرفعال‌سازیِ دفتر',
  'vendor.create': 'طرف‌حسابِ جدید',
  'vendor.update': 'ویرایشِ طرف‌حساب',
  'vendor.delete': 'حذفِ طرف‌حساب',
  'settings.system': 'تنظیماتِ سامانه',
  'fiscal.close': 'بستنِ دورهٔ مالی',
  'fiscal.recompute': 'بازمحاسبهٔ معادلِ یورو',
  'fiscal.reopen': 'بازگشاییِ دورهٔ مالی',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
