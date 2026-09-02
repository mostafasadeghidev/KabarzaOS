/**
 * فاکتور — سندِ صورت‌حسابِ کارفرما.
 *
 * منبع: `Support\
 */

/**
 * شمارهٔ فاکتور — **پایدار** و مبتنی بر شناسهٔ پروژه.
 *
 * ⚠️ عمداً از تاریخ یا شمارنده ساخته نمی‌شود: فاکتورِ یک پروژه باید هر بار
 * که باز می‌شود همان شماره را بدهد، وگرنه کارفرما دو سندِ متفاوت با دو
 * شماره برای یک بدهی می‌گیرد.
 */
export function invoiceNumber(projectId: number): string {
  return `INV-${String(Math.max(0, Math.trunc(projectId))).padStart(5, '0')}`;
}

export interface InvoiceLine {
  description: string;
  date: string | null;
  amount: string;
}

export interface InvoiceTotals {
  /** قیمتِ ثبت‌شده + هزینه‌های قابلِ صورت‌حساب. */
  totalDue: string;
  paid: string;
  remaining: string;
}

/**
 * جمع‌های فاکتور.
 *
 * ⚠️ «مجموعِ صورت‌حساب» فقط قیمتِ پروژه نیست — **هزینه‌های قابلِ بازپرداخت**
 * هم به آن اضافه می‌شوند (همان چیزی که R-FORM-02 تعیین می‌کند کدام هزینه
 * قابلِ بازپرداخت است). ماندهٔ منفی صفر می‌شود: کارفرمایی که بیشتر پرداخته
 * «بدهیِ منفی» ندارد.
 */
export function invoiceTotals(input: {
  price: string;
  billableExpenses: string;
  paid: string;
}): InvoiceTotals {
  const totalDue = Number(input.price) + Number(input.billableExpenses);
  const remaining = totalDue - Number(input.paid);

  return {
    totalDue: totalDue.toFixed(2),
    paid: Number(input.paid).toFixed(2),
    remaining: (remaining > 0 ? remaining : 0).toFixed(2),
  };
}

/** آیا فاکتور ارزشِ صادرشدن دارد؟ */
export function isIssuable(input: { hasClient: boolean; totalDue: string }): boolean {
  return input.hasClient && Number(input.totalDue) > 0;
}

/**
 * نامِ صادرکننده — اگر مشخصاتِ شرکت خالی باشد، به نامِ برندِ سامانه
 * برمی‌گردد، نه رشتهٔ خالی روی سندِ رسمی.
 */
/** پورتِ افزونه: نامِ شرکت، وگرنه نامِ برند، وگرنه **خالی** (سرصفحه بدونِ نام، نه نامِ ساختگی). */
export function issuerName(companyName: string, brandName: string): string {
  return companyName.trim() || brandName.trim();
}
