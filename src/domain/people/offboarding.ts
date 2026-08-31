/**
 * off-boarding عضو — ترجمهٔ `Support\People` (`member_state`, `set_state`, `remove`).
 *
 * «عضوِ سابق» حذف نمی‌شود؛ دسترسی‌اش قطع می‌شود و تاریخچه‌اش می‌ماند. این
 * تفاوت حیاتی است: ردیف‌های مالی و ساعتِ کاری به کاربر ارجاع می‌دهند.
 */

export const MEMBER_STATES = ['active', 'finance', 'locked'] as const;
export type MemberState = (typeof MEMBER_STATES)[number];

/**
 * ⚠️ R-PEOPLE-01 — سه حالتِ عضو، نه دو:
 * active — دسترسیِ کامل
 * finance — عضوِ سابق که **فقط امور مالیِ خودش** را می‌بیند؛ به پروژه‌ها نه
 * locked — عضوِ سابق با دسترسیِ کاملاً قطع (ورود مسدود)
 *
 * «فقط مالی» حالتِ واقعیِ کسب‌وکار است: کسی که رفته ولی هنوز تسویه‌نشده دارد
 * باید بتواند صورت‌حسابِ خودش را ببیند بی‌آنکه به کارِ تیم دسترسی داشته باشد.
 */
export function isInactive(state: MemberState): boolean {
  return state !== 'active';
}

export function hasFinanceAccess(state: MemberState): boolean {
  return state === 'finance';
}

export function isLocked(state: MemberState): boolean {
  return state === 'locked';
}

/** برچسبِ کارت — دقیقاً همان دو رشتهٔ نسخهٔ قبلی. */
export function stateLabel(state: MemberState): string | null {
  if (state === 'finance') return 'سابق · فقط مالی';
  if (state === 'locked') return 'سابق · قطع‌شده';
  return null;
}

/** ورودیِ ناشناخته به «فعال» می‌افتد — همان رفتارِ `set_state()`. */
export function normalizeState(raw: string): MemberState {
  return (MEMBER_STATES as readonly string[]).includes(raw) ? (raw as MemberState) : 'active';
}

export type RemoveOutcome = 'detached' | 'deactivated' | 'deleted' | 'noop';

export interface RemoveContext {
  exists: boolean;
  /** نقش‌های دیگری غیر از نقشِ همین صفحه دارد؟ */
  hasOtherRoles: boolean;
  /** مالک/ادمینِ سامانه است؟ هرگز از این صفحه حذف نمی‌شود. */
  isSystemAdmin: boolean;
  /** ردِ پای مالی یا کاری دارد؟ (پرداخت، ساعتِ کاری، عضویتِ پروژه، …) */
  hasFootprint: boolean;
}

/**
 * ⚠️ R-PEOPLE-02 — «حذف» چهار سرانجامِ متفاوت دارد:
 * noop — کاربر وجود ندارد
 * detached — مالک/ادمین است یا نقشِ دیگری دارد → فقط **نقشِ این بخش** برداشته
 * می‌شود، خودِ کاربر می‌ماند
 * deactivated — کاربرِ خالصِ این بخش با ردِ پای مالی/کاری → **حذف نمی‌شود**؛
 * به `locked` می‌رود و تاریخچه‌اش حفظ می‌شود
 * deleted — کاربرِ خالص و بدونِ ردِ پا → واقعاً حذف
 *
 * چرا مهم است: حذفِ کاربری که ردیفِ پرداخت دارد، آن پول را بی‌صاحب می‌کرد.
 * دکمه یکی است ولی نتیجه‌اش فرق می‌کند، پس پیامِ بازگشتی هم باید فرق کند.
 */
export function planRemovePerson(ctx: RemoveContext): RemoveOutcome {
  if (!ctx.exists) return 'noop';
  if (ctx.isSystemAdmin || ctx.hasOtherRoles) return 'detached';
  if (ctx.hasFootprint) return 'deactivated';
  return 'deleted';
}

/** پیامی که به کاربر نشان داده می‌شود — سرانجامِ واقعی، نه آنچه کلیک کرده. */
export function removeMessage(outcome: RemoveOutcome): string {
  switch (outcome) {
    case 'deactivated':
      return 'این کاربر سابقهٔ مالی/کاری داشت؛ به‌جای حذف، دسترسی‌اش قطع شد و تاریخچه‌اش حفظ شد.';
    case 'noop':
      return 'کاربر یافت نشد.';
    default:
      return 'کاربر حذف/جدا شد.';
  }
}

/**
 * ⚠️ R-PEOPLE-03 — «فقط مالی» می‌تواند وارد شود؛ فقط «قطع‌شده» مسدود است.
 *
 * اگر ورود را با «فعال بودن» می‌سنجیدیم، عضوِ سابقی که هنوز تسویه‌نشده دارد
 * هم بیرون می‌ماند و نمی‌توانست صورت‌حسابِ خودش را ببیند — یعنی همان قابلیتی
 * که حالتِ `finance` برایش ساخته شده بی‌اثر می‌شد.
 */
export function canSignIn(state: MemberState, deleted: boolean): boolean {
  if (deleted) return false;
  return state !== 'locked';
}
