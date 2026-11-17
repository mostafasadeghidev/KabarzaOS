/**
 * کوکیِ «آخرین حسابِ دفترکل» (۲.۴۵.۰) — صفحهٔ سرور می‌خواندش و کلاینت می‌نویسدش.
 * ⚠️ فایلِ جدا، نه داخلِ `account-picker.tsx`: ثابتی که از ماژولِ `'use client'`
 * به کامپوننتِ سرور وارد شود، مقدار نیست، ارجاعِ کلاینت است.
 *
 * ⚠️ از ۳.۸.۰ انتخاب فقط تا وقتی در «مالی» هستید می‌ماند: کوکیِ نشست است (بی max-age)
 * و `FinanceAccountReset` با بیرون رفتن از /finance پاکش می‌کند — دفعهٔ بعد دوباره
 * می‌پرسد. یک سال ماندنش باعث می‌شد ماه‌ها بعد ردیف در حسابی نوشته شود که کاربر
 * یادش نبود باز است.
 */
export const LAST_ACCOUNT_COOKIE = 'kz.finAccount';

/** صفحه‌ای زیرِ «مالی» است؟ (‎/finance و زیرمسیرهایش، نه ‎/financeX.) */
export function isFinancePath(pathname: string): boolean {
  return pathname === '/finance' || pathname.startsWith('/finance/');
}

/** انتخابِ حساب را پاک می‌کند تا بارِ بعدِ ورود به «مالی» دوباره پرسیده شود. */
export function forgetAccount(): void {
  try {
    document.cookie = `${LAST_ACCOUNT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // مرورگرِ بی‌کوکی — چیزی برای پاک کردن نیست.
  }
}
