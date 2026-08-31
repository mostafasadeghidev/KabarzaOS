/**
 * حساب‌های بانکی — ترجمهٔ `Support\Accounts`.
 *
 * دو قاعده اینجا زندگی می‌کنند: محافظت هنگامِ حذف، و **دامنهٔ حسابدار**.
 */

export class AccountError extends Error {
  constructor(readonly code: 'in_use' | 'name_required' | 'no_currency') {
    super(`account rule violated: ${code}`);
    this.name = 'AccountError';
  }
}

/**
 * ⚠️ R-ACC-01 — حسابی که ردیفِ دفتر دارد **حذف نمی‌شود**؛ باید غیرفعال شود.
 *
 * چرا: مانده و گزارش‌ها روی همان ردیف‌ها ساخته می‌شوند. حذفِ حساب یعنی
 * ردیف‌هایش بی‌صاحب می‌مانند و مانده‌ها از تراز خارج می‌شوند.
 */
export function assertAccountDeletable(ledgerRowCount: number): void {
  if (ledgerRowCount > 0) throw new AccountError('in_use');
}

export function accountMessage(code: AccountError['code']): string {
  if (code === 'in_use') {
    return 'این حساب ردیف‌های ثبت‌شده دارد و حذف نمی‌شود؛ به‌جای حذف، آن را غیرفعال کنید.';
  }
  if (code === 'no_currency') return 'ارزِ حساب را انتخاب کنید.';
  return 'نامِ حساب الزامی است.';
}

/**
 * ⚠️ R-ACC-02 — **دامنهٔ حسابدار**.
 *
 * مدیرِ مالی و مالک همهٔ حساب‌ها را می‌بینند. «حسابدارِ محدود» — کسی که فقط
 * مجوزِ دیدنِ مالی دارد — تنها حساب‌هایی را می‌بیند که به او تخصیص یافته‌اند.
 *
 * چرا مهم است: بدونِ این، هر کسی که مجوزِ خواندنِ مالی داشت مانده و تراکنشِ
 * **همهٔ** حساب‌ها را می‌دید — از جمله حساب‌هایی که کارِ او نیستند.
 */
export function visibleAccountIds(
  input: {
    seesAll: boolean;
    assignedAccountIds: readonly number[];
    allAccountIds: readonly number[];
  },
): number[] {
  if (input.seesAll) return [...input.allAccountIds];
  const assigned = new Set(input.assignedAccountIds);
  return input.allAccountIds.filter((id) => assigned.has(id));
}

/** حسابِ منفرد قابلِ دیدن است؟ — گاردِ صفحهٔ دفترکل. */
export function canSeeAccount(
  accountId: number,
  input: { seesAll: boolean; assignedAccountIds: readonly number[] },
): boolean {
  return input.seesAll || input.assignedAccountIds.includes(accountId);
}
