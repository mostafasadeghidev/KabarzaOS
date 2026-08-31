/**
 * قواعدِ فهرست‌های پایه — ارز، تگ، دفتر، طرف‌حساب.
 *
 * این‌ها «تنظیمات» به‌نظر می‌رسند ولی چند قاعدهٔ سختِ کسب‌وکار دارند: حذفِ
 * اشتباهِ یک ارز یا تگ می‌تواند ردیف‌های مالی و پروژه را بی‌معنا کند.
 */

export class CatalogError extends Error {
  constructor(
    readonly code:
      | 'default_currency'
      | 'currency_in_use'
      | 'same_currency'
      | 'rate_invalid'
      | 'tag_in_use'
      | 'tag_protected'
      | 'name_required',
  ) {
    super(`catalog rule violated: ${code}`);
    this.name = 'CatalogError';
  }
}

/**
 * ⚠️ R-SET-01 — ارزِ پیش‌فرض حذف نمی‌شود.
 *
 * چرا: ارزِ پیش‌فرض پایهٔ گزارشِ بین‌ارزی است (`amount_eur` روی هر ردیفِ دفتر).
 * با حذفش هر تبدیلِ آینده بی‌مبنا می‌شد و گزارش‌ها بی‌صدا صفر می‌دادند.
 */
export function assertCurrencyDeletable(input: {
  isDefault: boolean;
  usageCount: number;
}): void {
  if (input.isDefault) throw new CatalogError('default_currency');
  // ارزی که روی ردیف یا حسابی نشسته هم حذف نمی‌شود — وگرنه آن ردیف‌ها بی‌ارز می‌ماندند.
  if (input.usageCount > 0) throw new CatalogError('currency_in_use');
}

/**
 * ⚠️ R-SET-02 — تعیینِ ارزِ پیش‌فرض **یکتاست**: پیش از نشاندنِ جدید، پرچمِ همه
 * پاک می‌شود. ارزِ پیش‌فرض خودبه‌خود فعال هم می‌شود.
 */
export interface DefaultCurrencyPlan {
  clearAll: true;
  setId: number;
  alsoActivate: true;
}

export function planSetDefaultCurrency(id: number): DefaultCurrencyPlan {
  return { clearAll: true, setId: id, alsoActivate: true };
}

/**
 * ⚠️ R-SET-03 — نرخِ تبدیل باید بینِ **دو ارزِ متفاوت** و **بزرگ‌تر از صفر** باشد.
 * نرخِ صفر یا نرخِ ارز به خودش، تبدیل را بی‌معنا و مانده‌ها را نابود می‌کند.
 */
export function assertRateValid(from: number, to: number, rate: string): void {
  if (from === to) throw new CatalogError('same_currency');
  if (!/^\d+(\.\d{1,8})?$/.test(rate) || Number(rate) <= 0) {
    throw new CatalogError('rate_invalid');
  }
}

/**
 * ⚠️ R-SET-04 — تگِ در حالِ استفاده حذف نمی‌شود.
 *
 * چرا: تگ‌ها چندریختی‌اند (وضعیتِ پروژه، وضعیتِ تسک، نقشِ عضو، دستهٔ دفتر).
 * حذفِ یک وضعیتِ پروژه یعنی هر کارتی که آن وضعیت را داشت بی‌وضعیت می‌شود و
 * از تبِ خودش می‌افتد — بی‌آنکه کسی بفهمد.
 */
export function assertTagDeletable(usageCount: number, isProtected = false): void {
  /**
   * ⚠️ محافظت **پیش از** استفاده بررسی می‌شود: وضعیتِ پایهٔ پروژه حتی وقتی
   * هیچ پروژه‌ای رویش نیست هم نباید حذف شود. منطقِ اپ به گروه‌های وضعیت
   * (`not_started`، `in_progress`، `completed`…) تکیه دارد؛ حذفِ یکی‌شان
   * داشبورد و گزارش را بی‌صدا ناقص می‌کند.
   */
  if (isProtected) throw new CatalogError('tag_protected');
  if (usageCount > 0) throw new CatalogError('tag_in_use');
}

/** نامِ خالی برای هیچ‌کدام از این فهرست‌ها پذیرفته نیست. */
export function assertName(name: string): string {
  const clean = name.trim();
  if (clean === '') throw new CatalogError('name_required');
  return clean;
}

/** پیامِ فارسیِ هر خطا — همان رشته‌های نسخهٔ قبلی. */
export function catalogMessage(code: CatalogError['code']): string {
  switch (code) {
    case 'default_currency':
      return 'ارز پیش‌فرض قابل حذف نیست.';
    case 'currency_in_use':
      return 'این ارز روی حساب یا ردیفِ دفتر استفاده شده و حذف نمی‌شود.';
    case 'same_currency':
    case 'rate_invalid':
      return 'نرخ نامعتبر است: ارز مبدأ و مقصد باید متفاوت و نرخ بزرگ‌تر از صفر باشد.';
    case 'tag_in_use':
      return 'این تگ در حالِ استفاده است و حذف نمی‌شود.';
    case 'tag_protected':
      return 'این تگ محافظت‌شده است و حذف نمی‌شود.';
    default:
      return 'نام الزامی است.';
  }
}
