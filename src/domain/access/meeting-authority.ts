/**
 * اختیارِ جلسه — پورتِ `Meetings::can_create_general()`,
 * `Meetings::general_office_scope()` و `Frontend::can_manage_meeting()`.
 *
 * ⚠️ پیش از این تنها کلیدِ ساختِ جلسه مجوزِ بخشِ `meetings.manage` بود — که
 * هیچ عضوی ندارد. نتیجه: مدیرِ پروژه و مدیرِ دفتر (که در نسخهٔ قبلی برای
 * پروژه/دفترِ خودشان جلسه می‌ساختند) اصلاً دکمهٔ «جلسهٔ جدید» را نمی‌دیدند.
 *
 * سه قاعده:
 *  · جلسهٔ **پروژه‌ای** را کسی می‌سازد که آن پروژه را مدیریت می‌کند (سراسری،
 *    مدیرِ پروژه با تگ، یا مدیرِ دفترِ آن پروژه) — تصمیمش در
 *    `canManageProject` است، اینجا فقط مصرف می‌شود.
 *  · جلسهٔ **عمومی** را مالک/مدیرِ بخش برای هر دفتری، و مدیرِ دفتر **فقط** برای
 *    دفاترِ خودش می‌سازد.
 *  · ویرایش/حذف: سازنده، مدیرِ پروژه‌اش، یا مدیرِ سراسری.
 */

export interface MeetingActorContext {
  /** مجوزِ بخشِ جلسات یا مدیریتِ سراسریِ پروژه‌ها — هر دفتری، هر پروژه‌ای. */
  hasGlobal: boolean;
  /** دفاترِ تحتِ مدیریتِ کاربر. */
  managedOfficeIds: readonly number[];
}

/** آیا این کاربر اصلاً می‌تواند جلسهٔ عمومی (بدونِ پروژه) بسازد؟ */
export function canCreateGeneralMeeting(ctx: MeetingActorContext): boolean {
  return ctx.hasGlobal || ctx.managedOfficeIds.length > 0;
}

export interface GeneralScope {
  /** دفتری که روی جلسه ثبت می‌شود — `null` یعنی همهٔ دفاترِ مجاز. */
  officeId: number | null;
  /** دفاتری که استخرِ دعوت‌شدگان از آن‌ها پر می‌شود — `null` یعنی همهٔ دفاتر. */
  officeIds: number[] | null;
}

/**
 * دامنهٔ یک جلسهٔ عمومی.
 *
 * ⚠️ مدیرِ دفتر نمی‌تواند از دفترِ دیگری دعوت کند: دفترِ درخواستی اگر مالِ او
 * نباشد **بی‌صدا** به دفاترِ خودش می‌افتد (همان رفتارِ نسخهٔ قبلی که دفترِ
 * درخواستی را برای مدیرِ دفتر نادیده می‌گرفت). `null` یعنی اجازه ندارد.
 */
export function generalOfficeScope(
  ctx: MeetingActorContext,
  requestedOfficeId: number | null,
): GeneralScope | null {
  if (ctx.hasGlobal) {
    return requestedOfficeId
      ? { officeId: requestedOfficeId, officeIds: [requestedOfficeId] }
      : { officeId: null, officeIds: null };
  }
  if (ctx.managedOfficeIds.length === 0) return null;
  if (requestedOfficeId && ctx.managedOfficeIds.includes(requestedOfficeId)) {
    return { officeId: requestedOfficeId, officeIds: [requestedOfficeId] };
  }
  return { officeId: null, officeIds: [...ctx.managedOfficeIds] };
}

/** ویرایش/حذفِ یک جلسهٔ موجود. */
export function canManageMeeting(input: {
  isCreator: boolean;
  hasGlobal: boolean;
  /** برای جلسهٔ پروژه‌ای: بیننده آن پروژه را مدیریت می‌کند؟ */
  managesProject: boolean;
}): boolean {
  return input.isCreator || input.hasGlobal || input.managesProject;
}
