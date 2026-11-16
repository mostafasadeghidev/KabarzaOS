/** خطاهای فضای ابری (۳.۴.۰) و پیامِ فارسیِ هر کدام — برای اکشن‌ها و صفحه. */

export type CloudErrorCode =
  | 'no_connection' | 'not_configured' | 'invalid' | 'no_secret' | 'in_use'
  | 'not_found' | 'protected' | 'member_inactive' | 'member_has_account'
  | 'invalid_name' | 'name_taken' | 'invalid_quota' | 'weak_password'
  | 'unauthorized' | 'forbidden' | 'server';

export class CloudError extends Error {
  constructor(readonly code: CloudErrorCode, readonly detail = '') {
    super(`cloud: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'CloudError';
  }
}

/** ⚠️ جزئیاتِ متغیر جای‌نگهدارِ {name} است، نه چسبیده به متن — تا ترجمه نشکند. */
export function cloudMessage(code: CloudErrorCode): string {
  switch (code) {
    case 'no_connection': return 'این اتصالِ فضای ابری پیدا نشد یا خاموش است.';
    case 'not_configured': return 'رمزِ برنامهٔ این اتصال ذخیره نشده یا دیگر باز نمی‌شود؛ در «تنظیمات ← فضای ابری» دوباره بگذاریدش.';
    case 'invalid': return 'این موردها درست نیستند: {name}';
    case 'no_secret': return 'برای اتصالِ تازه رمزِ برنامه (App password) لازم است.';
    case 'in_use': return 'این اتصال تاریخچهٔ دسترسی دارد و پاک نمی‌شود؛ خاموشش کنید.';
    case 'not_found': return 'این حساب روی فضای ابری پیدا نشد.';
    case 'protected': return 'این حساب در گروهِ این اتصال نیست یا خودِ حسابِ اتصال است؛ برنامه به آن دست نمی‌زند.';
    case 'member_inactive': return 'فقط به عضوِ فعال می‌شود حسابِ فضای ابری داد.';
    case 'member_has_account': return 'این عضو از پیش روی همین فضا حسابِ دیگری دارد؛ اول آن را جدا کنید.';
    case 'invalid_name': return 'نامِ کاربری «{name}» معتبر نیست: ۲ تا ۳۲ نویسه، فقط حروفِ کوچکِ لاتین، رقم، نقطه، خط تیره و زیرخط.';
    case 'name_taken': return 'نامِ کاربریِ «{name}» از پیش روی فضای ابری هست.';
    case 'invalid_quota': return 'حجم باید بینِ ۰٫۱ تا ۱۰۰۰۰ گیگابایت باشد.';
    case 'weak_password': return 'رمز پذیرفته نشد: {name}';
    case 'unauthorized': return 'فضای ابری نام‌کاربری یا رمزِ برنامه را نپذیرفت.';
    case 'forbidden': return 'حسابِ اتصال اجازهٔ این کار را ندارد؛ باید مدیرِ همین گروه باشد.';
    case 'server': return 'فضای ابری درخواست را انجام نداد: {name}';
  }
}
