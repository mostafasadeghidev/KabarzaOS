/**
 * چرخهٔ عمرِ پروژه — قواعدِ docs/rules/PROJECTS-TASKS.md
 * حذفِ اشتباه اینجا دادهٔ مالی را نابود می‌کند.
 */

export type ImpactState = 'clean' | 'confirm' | 'locked';
export type DeleteMode = 'full' | 'detach';

export interface ProjectImpact {
  ledgerRows: number;
  paymentRows: number;
  timelogRows: number;
  openRequests: number;
  /** R-PROJ-02 — «ماندهٔ باز» یعنی دقیقاً وضعیتِ «پیش‌پرداخت». */
  clientPartiallyPaid: boolean;
  memberPartiallyPaid: boolean;
}

/**
 * ⚠️ R-PROJ-01 — وضعیتِ حذف از رویِ داده تعیین می‌شود:
 *  locked  — ماندهٔ باز دارد → **هرگز** حذف نمی‌شود
 *  confirm — دادهٔ مالی/کاری دارد → فقط با تأییدِ صریح
 *  clean   — هیچ‌کدام → آزادانه
 *
 * چرا: حذفِ پروژه‌ای که هنوز طلب یا بدهی دارد، آن بدهی را **ناپدید** می‌کند.
 */
export function impactState(impact: ProjectImpact): ImpactState {
  if (impact.clientPartiallyPaid || impact.memberPartiallyPaid) return 'locked';

  const hasMoney = impact.ledgerRows > 0 || impact.paymentRows > 0;
  const hasHours = impact.timelogRows > 0;
  if (hasMoney || hasHours || impact.openRequests > 0) return 'confirm';

  return 'clean';
}

export class ProjectDeleteError extends Error {
  constructor(readonly code: 'locked' | 'needs_confirmation' | 'title_mismatch') {
    super(`project delete refused: ${code}`);
    this.name = 'ProjectDeleteError';
  }
}

export interface DeleteRequest {
  mode?: DeleteMode;
  /** R-PROJ-04 — نامِ پروژه باید عیناً تایپ شود. */
  confirmTitle?: string;
  actualTitle: string;
}

export interface DeletePlan {
  /** ردیف‌های سبک: فایل، تسک، کامنت، QA، پیشنهاد، اعضا، کارفرمایان، درخواست‌ها. */
  purgeSubordinate: true;
  /** R-PROJ-03 — تراکنش‌ها پاک شوند یا فقط از پروژه جدا شوند. */
  financial: 'purge' | 'detach' | 'none';
}

/**
 * ⚠️ R-PROJ-04 — هر مسیرِ حذفی باید از همین گارد رد شود.
 * در نسخهٔ قبلی فقط UIِ اصلی گارد داشت و حذفِ مستقیم از لیستِ سامانهٔ قبلی باید
 * جداگانه مسدود می‌شد. اینجا یک نقطهٔ تصمیم است (R-ARCH-01).
 */
export function planDelete(impact: ProjectImpact, request: DeleteRequest): DeletePlan {
  const state = impactState(impact);

  if (state === 'locked') {
    throw new ProjectDeleteError('locked');
  }

  if (state === 'clean') {
    return { purgeSubordinate: true, financial: 'none' };
  }

  // داده‌دار — فقط با تأییدِ صریح.
  if (!request.mode) throw new ProjectDeleteError('needs_confirmation');
  if (request.confirmTitle?.trim() !== request.actualTitle.trim()) {
    throw new ProjectDeleteError('title_mismatch');
  }

  return { purgeSubordinate: true, financial: request.mode === 'full' ? 'purge' : 'detach' };
}

/** R-PROJ-06 — سبک‌سازی فقط روی پروژهٔ بایگانی‌شده (قدمِ برگشت‌پذیر اول). */
export function canLighten(project: { isArchived: boolean; lightenSummary: unknown }): boolean {
  return project.isArchived && !project.lightenSummary;
}

/**
 * R-PROJ-20 — زیرپروژه یک سطح و بدونِ حلقه.
 *
 * ⚠️ شرطِ چهارم به‌سادگی از قلم می‌افتد: پروژه‌ای که **خودش زیرپروژه دارد**
 * نمی‌تواند زیرپروژهٔ کسِ دیگری شود — وگرنه سلسله‌مراتب دو سطح می‌شد.
 * (`self::children( $pid )` در)
 */
export function canSetParent(
  childId: number,
  parentId: number,
  parentOfParent: number | null,
  hasChildren = false,
): boolean {
  if (childId === parentId) return false;        // والدِ خودش
  if (parentOfParent !== null) return false;     // والد خودش زیرپروژه است → دو سطح
  if (hasChildren) return false;                 // خودش والد است → نمی‌تواند فرزند هم باشد
  return true;
}

/**
 * عکسِ لحظه‌ایِ سبک‌سازی — قدمِ ۱.
 *
 * ⚠️ این عکس **پیش از** پاک‌شدنِ جزئیات گرفته می‌شود. اگر بعد گرفته می‌شد،
 * مجموعِ ساعتِ کاری صفر می‌افتاد و حافظهٔ پروژه از دست می‌رفت.
 */
export interface LightenSummary {
  minutes: number;
  price: string;
  currencyId: number | null;
  clientPaidEur: string;
  memberPaidEur: string;
  lightenedAt: string;
  /** پروژه پیش از سبک‌سازی مناقصه بوده؟ پرچمِ مناقصه پاک می‌شود، ولی خاطره‌اش می‌ماند. */
  wasTender: boolean;
}

export class LightenError extends Error {
  constructor(readonly code: 'not_archived' | 'already_lightened') {
    super(`project lighten refused: ${code}`);
    this.name = 'LightenError';
  }
}

/**
 * ⚠️ R-PROJ-06 — سبک‌سازی فقط روی پروژهٔ **بایگانی‌شده**، و فقط یک بار.
 *
 * بایگانی قدمِ برگشت‌پذیرِ اول است؛ سبک‌سازی برگشت‌ناپذیر است. اجباری‌کردنِ
 * ترتیب یعنی کاربر همیشه یک قدمِ قابلِ بازگشت پیش از نابودیِ داده دارد
 * (R-ARCH-04).
 */
export function assertCanLighten(project: { isArchived: boolean; lightenSummary: unknown }): void {
  if (!project.isArchived) throw new LightenError('not_archived');
  if (project.lightenSummary) throw new LightenError('already_lightened');
}

/**
 * آنچه سبک‌سازی پاک می‌کند و آنچه نگه می‌دارد — تصمیم در یک جا، تا
 * پیاده‌سازیِ سرور فقط اجرا کند.
 */
export const LIGHTEN_PURGES = [
  'attachments', 'tasks', 'task_roles', 'comments', 'project_qa', 'timelogs', 'tender_bids',
] as const;

/** ⚠️ این‌ها **هرگز** پاک نمی‌شوند: پول و پیوندهای انسانی. */
export const LIGHTEN_KEEPS = [
  'ledger', 'project_payments', 'payment_requests', 'project_members', 'project_clients',
] as const;

/**
 * گروه‌های وضعیتی که پروژه را **منجمد** می‌کنند — پورتِ
 *.
 *
 * ⚠️ لغوشده و متوقف، نه فقط بایگانی: پروژه‌ای که لغو شده هنوز بایگانی نشده
 * ولی کارِ تازه رویش بی‌معناست. پیش از این اپ فقط `isArchived` را می‌دید،
 * پس روی پروژهٔ **لغوشده** هنوز می‌شد ساعت ثبت کرد، کارکرد نوشت و درخواستِ
 * پرداخت داد — با پیامدِ مالی.
 */
export const FROZEN_STATUS_GROUPS = ['cancelled', 'on_hold'] as const;

export function isFrozenProject(project: {
  isArchived: boolean;
  statusGroup?: string | null;
}): boolean {
  if (project.isArchived) return true;
  return (FROZEN_STATUS_GROUPS as readonly string[]).includes(project.statusGroup ?? '');
}

/**
 * پروژهٔ «باز».
 *
 * ⚠️ ملاک `is_closed` ِ تگ است، نه یک گروهِ واحد: هم «تکمیل‌شده» و هم
 * «لغوشده» بسته‌اند، با دو گروهِ متفاوت. پس نمی‌شود از `status_group` تنها
 * نتیجه گرفت.
 * ⚠️ بی‌وضعیت = باز، نه بسته.
 */
export function isOpenProject(project: { isClosed?: boolean | null }): boolean {
  return project.isClosed !== true;
}
